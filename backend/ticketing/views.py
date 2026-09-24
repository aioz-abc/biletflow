import secrets
from io import BytesIO

import qrcode
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from qrcode.image.svg import SvgPathImage
from rest_framework import generics, permissions
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import OrganizerProfile

from . import services
from .models import AuditLog, Event, Order, PromoCode, PromotionalCampaign, Ticket, TicketType
from .serializers import (
    AuditLogSerializer,
    CampaignSerializer,
    CheckoutSerializer,
    EventSerializer,
    OrderSerializer,
    PublishSerializer,
    QRSerializer,
    RefundSerializer,
    ReserveSerializer,
    TicketSerializer,
    TicketTypeSerializer,
    qr_token,
)


def managed_events(user):
    events = Event.objects.all()
    return events if user.is_superuser else events.filter(organizer__user=user)


def visible_events(user):
    # Private events are only ever visible to their owner/admin, even by direct
    # link; unlisted events are reachable by ID/QR but excluded from the public
    # listing (see EventList.get_queryset).
    public = Q(
        published=True, organizer__user__is_active=True, visibility__in=["public", "unlisted"]
    )
    if user.is_authenticated:
        if user.is_superuser:
            return Event.objects.all()
        public |= Q(organizer__user=user)
    return Event.objects.filter(public)


class EventList(generics.ListCreateAPIView):
    serializer_class = EventSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        return Event.objects.filter(
            published=True, organizer__user__is_active=True, visibility="public"
        ).select_related("organizer")

    def perform_create(self, serializer):
        profile = OrganizerProfile.objects.filter(user=self.request.user).first()
        if profile is None:
            raise PermissionDenied("Organizer profile required.")
        serializer.save(organizer=profile)


class MyEvents(generics.ListAPIView):
    serializer_class = EventSerializer

    def get_queryset(self):
        return managed_events(self.request.user)


class EventDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EventSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return (
            visible_events(self.request.user)
            if self.request.method in permissions.SAFE_METHODS
            else managed_events(self.request.user)
        )

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        event = get_object_or_404(self.get_queryset().select_for_update(), pk=kwargs["pk"])
        serializer = self.get_serializer(event, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("capacity", event.capacity) < services.reserved(event.pk):
            raise services.Conflict("Capacity cannot be below sold and reserved tickets.")
        serializer.save()
        return Response(serializer.data)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        event = get_object_or_404(self.get_queryset().select_for_update(), pk=kwargs["pk"])
        if event.orders.exists():
            raise services.Conflict("Events with orders cannot be deleted; unpublish instead.")
        event.ticket_types.all().delete()
        event.delete()
        return Response(status=204)


class Publish(APIView):
    @transaction.atomic
    def post(self, request, pk):
        serializer = PublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = get_object_or_404(managed_events(request.user).select_for_update(), pk=pk)
        if serializer.validated_data["published"] and event.starts_at <= timezone.now():
            raise services.Conflict("Cannot publish an event that has started.")
        event.published = serializer.validated_data["published"]
        event.save(update_fields=["published"])
        return Response(EventSerializer(event).data)


class DuplicateEvent(APIView):
    @transaction.atomic
    def post(self, request, pk):
        original = get_object_or_404(managed_events(request.user).select_for_update(), pk=pk)
        copy = Event.objects.create(
            organizer=original.organizer,
            title=f"Copy of {original.title}"[:200],
            description=original.description,
            venue=original.venue,
            category=original.category,
            images=original.images,
            visibility=original.visibility,
            starts_at=original.starts_at,
            ends_at=original.ends_at,
            capacity=original.capacity,
            published=False,
        )
        # Duplication copies configuration only: ticket-type setup is carried
        # over as fresh rows with no inventory sold or reserved against them.
        TicketType.objects.bulk_create(
            TicketType(
                event=copy,
                name=kind.name,
                price_minor=kind.price_minor,
                quantity=kind.quantity,
                max_per_order=kind.max_per_order,
                sales_start=kind.sales_start,
                sales_end=kind.sales_end,
                hidden=kind.hidden,
            )
            for kind in original.ticket_types.all()
        )
        return Response(EventSerializer(copy).data, status=201)


class TicketTypeList(generics.ListCreateAPIView):
    serializer_class = TicketTypeSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        event = get_object_or_404(visible_events(self.request.user), pk=self.kwargs["pk"])
        queryset = event.ticket_types.select_related("event")
        user = self.request.user
        if not user.is_authenticated or (
            not user.is_superuser and event.organizer.user_id != user.pk
        ):
            queryset = queryset.filter(hidden=False)
        return queryset

    @transaction.atomic
    def perform_create(self, serializer):
        event = get_object_or_404(
            managed_events(self.request.user).select_for_update(), pk=self.kwargs["pk"]
        )
        serializer.save(event=event)


class TicketTypeDetail(generics.UpdateAPIView):
    serializer_class = TicketTypeSerializer
    http_method_names = ["patch", "options"]

    @transaction.atomic
    def patch(self, request, pk):
        kind = get_object_or_404(TicketType, pk=pk, event__in=managed_events(request.user))
        Event.objects.select_for_update().get(pk=kind.event_id)
        kind.refresh_from_db()
        serializer = self.get_serializer(kind, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("quantity", kind.quantity) < services.reserved(
            kind.event_id, kind.pk
        ):
            raise services.Conflict("Quantity cannot be below sold and reserved tickets.")
        serializer.save()
        return Response(serializer.data)


class OrderCreate(APIView):
    def post(self, request):
        serializer = ReserveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        order = services.reserve(request.user, data["event"], data["items"])
        return Response(OrderSerializer(order).data, status=201)


class MyOrders(generics.ListAPIView):
    serializer_class = OrderSerializer

    def get_queryset(self):
        return Order.objects.filter(purchaser=self.request.user).prefetch_related("items")


class OrderDetail(generics.RetrieveAPIView):
    serializer_class = OrderSerializer

    def get_queryset(self):
        return Order.objects.filter(purchaser=self.request.user)


class Checkout(APIView):
    def post(self, request, pk):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = services.checkout(
            request.user,
            pk,
            serializer.validated_data["outcome"],
            serializer.validated_data.get("promo_code"),
        )
        return Response(OrderSerializer(order).data)


class CancelOrder(APIView):
    def post(self, request, pk):
        order = services.cancel_order(request.user, pk)
        return Response(OrderSerializer(order).data)


class RefundOrder(APIView):
    def post(self, request, pk):
        order, refund = services.refund_order(request.user, pk)
        return Response(
            {"order": OrderSerializer(order).data, "refund": RefundSerializer(refund).data}
        )


def accessible_tickets(user):
    tickets = Ticket.objects.select_related("order_item__order", "order_item__ticket_type")
    if user.is_superuser:
        return tickets
    return tickets.filter(
        Q(order_item__order__purchaser=user) | Q(order_item__order__event__organizer__user=user)
    )


class MyTickets(generics.ListAPIView):
    serializer_class = TicketSerializer

    def get_queryset(self):
        return accessible_tickets(self.request.user).filter(
            order_item__order__purchaser=self.request.user
        )


class EventAttendees(generics.ListAPIView):
    serializer_class = TicketSerializer

    def get_queryset(self):
        event = get_object_or_404(managed_events(self.request.user), pk=self.kwargs["pk"])
        return accessible_tickets(self.request.user).filter(order_item__order__event=event)


class TicketDetail(generics.RetrieveAPIView):
    serializer_class = TicketSerializer

    def get_queryset(self):
        return accessible_tickets(self.request.user)


class TicketQR(APIView):
    def get(self, request, pk):
        ticket = get_object_or_404(accessible_tickets(request.user), pk=pk)
        output = BytesIO()
        qrcode.make(qr_token(ticket), image_factory=SvgPathImage).save(output)
        response = HttpResponse(output.getvalue(), content_type="image/svg+xml")
        response["Cache-Control"] = "private, no-store"
        return response


class VerifyTicket(APIView):
    def post(self, request, pk=None):
        serializer = QRSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lookup = (
            {"pk": pk}
            if pk is not None
            else {"identifier": services.qr_identifier(serializer.validated_data["qr_token"])}
        )
        ticket = get_object_or_404(
            Ticket.objects.select_related("order_item__order"),
            order_item__order__event__in=managed_events(request.user),
            **lookup,
        )
        services.check_qr(ticket, serializer.validated_data["qr_token"])
        return Response(
            {"valid": ticket.status == "valid", "ticket": TicketSerializer(ticket).data}
        )


class CheckIn(APIView):
    def post(self, request, pk=None):
        serializer = QRSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if pk is None:
            pk = get_object_or_404(
                Ticket,
                identifier=services.qr_identifier(serializer.validated_data["qr_token"]),
                order_item__order__event__in=managed_events(request.user),
            ).pk
        ticket = services.check_in(pk, request.user, serializer.validated_data["qr_token"])
        return Response(TicketSerializer(ticket).data)


class CampaignList(generics.ListCreateAPIView):
    """Organizer-facing campaign CRUD (SRS 4.14).

    Mirat owns the admin UI for campaigns; this is the enforcement-side API it can
    drive, and he may well want to reshape the payload once that UI exists.
    """

    serializer_class = CampaignSerializer

    def event(self):
        return get_object_or_404(managed_events(self.request.user), pk=self.kwargs["pk"])

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "event": self.event()}

    def get_queryset(self):
        return (
            self.event()
            .campaigns.prefetch_related("codes", "ticket_types", "redemptions__order")
            .all()
        )

    @transaction.atomic
    def perform_create(self, serializer):
        event = get_object_or_404(
            managed_events(self.request.user).select_for_update(), pk=self.kwargs["pk"]
        )
        campaign = serializer.save(event=event)
        # Every campaign gets exactly one generated code plus its Campaign QR token.
        token = services.campaign_link_token()
        PromoCode.objects.create(
            campaign=campaign,
            code=services.normalize_code(
                f"{campaign.name[:6].strip() or 'PROMO'}-{secrets.token_hex(3)}"
            ),
            link_token_digest=services.link_token_digest(token),
        )
        services.record_audit(event, self.request.user, "campaign.created", campaign, campaign.name)
        self.link_token = token

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        # The raw link token is returned once, at creation, and never stored in clear.
        response.data["campaign_link"] = services.campaign_link(request, self.link_token)
        return response


class CampaignQR(APIView):
    def get(self, request, pk):
        campaign = get_object_or_404(
            PromotionalCampaign, pk=pk, event__in=managed_events(request.user)
        )
        token = services.campaign_link_token()
        code = campaign.codes.first()
        code.link_token_digest = services.link_token_digest(token)
        code.save(update_fields=["link_token_digest"])
        output = BytesIO()
        qrcode.make(services.campaign_link(request, token), image_factory=SvgPathImage).save(output)
        response = HttpResponse(output.getvalue(), content_type="image/svg+xml")
        # Deliberately distinct from an admission QR: this encodes an HTTPS campaign
        # link with an opaque token, never a ticket identifier or a discount amount.
        response["X-BiletFlow-QR-Kind"] = "campaign-link"
        response["Cache-Control"] = "private, no-store"
        return response


class CampaignLinkResolve(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        code = get_object_or_404(
            PromoCode.objects.select_related("campaign__event"),
            link_token_digest=services.link_token_digest(token),
        )
        campaign = code.campaign
        if not campaign.event.published or campaign.event.visibility == "private":
            raise NotFound()
        return Response(
            {
                "event": campaign.event_id,
                "campaign": campaign.pk,
                "promo_code": code.code,
                "name": campaign.name,
                "discount_type": campaign.discount_type,
                "discount_value": campaign.discount_value,
                "active": services.campaign_active(campaign),
            }
        )


class EventAuditLog(generics.ListAPIView):
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        event = get_object_or_404(managed_events(self.request.user), pk=self.kwargs["pk"])
        return AuditLog.objects.filter(event=event)
