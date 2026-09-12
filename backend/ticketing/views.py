from io import BytesIO

import qrcode
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from qrcode.image.svg import SvgPathImage
from rest_framework import generics, permissions
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import OrganizerProfile

from . import services
from .models import Event, Order, Ticket, TicketType
from .serializers import (
    CheckoutSerializer,
    EventSerializer,
    OrderSerializer,
    PublishSerializer,
    QRSerializer,
    ReserveSerializer,
    TicketSerializer,
    TicketTypeSerializer,
    qr_token,
)


def managed_events(user):
    events = Event.objects.all()
    return events if user.is_superuser else events.filter(organizer__user=user)


def visible_events(user):
    public = Q(published=True, organizer__user__is_active=True)
    if user.is_authenticated:
        if user.is_superuser:
            return Event.objects.all()
        public |= Q(organizer__user=user)
    return Event.objects.filter(public)


class EventList(generics.ListCreateAPIView):
    serializer_class = EventSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        return Event.objects.filter(published=True, organizer__user__is_active=True).select_related(
            "organizer"
        )

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
        order = services.checkout(request.user, pk, serializer.validated_data["outcome"])
        return Response(OrderSerializer(order).data)


class CancelOrder(APIView):
    @transaction.atomic
    def post(self, request, pk):
        initial = get_object_or_404(Order, pk=pk, purchaser=request.user)
        Event.objects.select_for_update().get(pk=initial.event_id)
        order = Order.objects.select_for_update().get(pk=pk)
        if order.status == "confirmed":
            raise services.Conflict("Confirmed orders cannot be cancelled in this MVP.")
        order.status = "cancelled"
        order.save(update_fields=["status"])
        return Response(OrderSerializer(order).data)


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
