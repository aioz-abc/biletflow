import hashlib
import secrets
from datetime import timedelta
from uuid import UUID

from django.core import signing
from django.db import transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException, NotFound, ValidationError

from .models import (
    AuditLog,
    Event,
    Order,
    OrderItem,
    Payment,
    PromoCode,
    PromoRedemption,
    Refund,
    Ticket,
    TicketType,
)


class Conflict(APIException):
    status_code = 409
    default_detail = "The operation conflicts with current state."


def reserved(event_id, ticket_type_id=None):
    items = OrderItem.objects.filter(order__event_id=event_id).filter(
        Q(order__status="confirmed")
        | Q(order__status="pending", order__expires_at__gt=timezone.now())
    )
    if ticket_type_id is not None:
        items = items.filter(ticket_type_id=ticket_type_id)
    return items.aggregate(total=Sum("quantity"))["total"] or 0


@transaction.atomic
def reserve(user, event_id, items):
    # ponytail: one event lock serializes sales; narrow only if measured throughput requires it.
    event = get_object_or_404(
        Event.objects.select_for_update(),
        pk=event_id,
        published=True,
        organizer__user__is_active=True,
    )
    now = timezone.now()
    if event.starts_at <= now:
        raise Conflict("Sales have ended.")
    if reserved(event.pk) + sum(item["quantity"] for item in items) > event.capacity:
        raise Conflict("Event capacity exceeded.")
    selected = []
    total = 0
    for item in items:
        kind = get_object_or_404(TicketType, pk=item["ticket_type"], event=event, hidden=False)
        quantity = item["quantity"]
        if quantity > kind.max_per_order:
            raise ValidationError("Per-order ticket limit exceeded.")
        if (kind.sales_start and kind.sales_start > now) or (
            kind.sales_end and kind.sales_end <= now
        ):
            raise Conflict("Ticket sales are closed.")
        if reserved(event.pk, kind.pk) + quantity > kind.quantity:
            raise Conflict("Not enough tickets remaining.")
        total += kind.price_minor * quantity
        selected.append((kind, quantity))
    order = Order.objects.create(
        purchaser=user,
        event=event,
        subtotal_minor=total,
        total_minor=total,
        expires_at=min(now + timedelta(minutes=15), event.starts_at),
    )
    OrderItem.objects.bulk_create(
        [
            OrderItem(
                order=order, ticket_type=kind, quantity=quantity, unit_price_minor=kind.price_minor
            )
            for kind, quantity in selected
        ]
    )
    return order


@transaction.atomic
def checkout(user, order_id, outcome, promo_code=None):
    initial = get_object_or_404(Order, pk=order_id, purchaser=user)
    event = Event.objects.select_for_update().get(pk=initial.event_id)
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.status == "confirmed":
        return order
    if order.status != "pending" or order.expires_at <= timezone.now():
        raise Conflict("Order is cancelled or expired.")
    if (
        not event.published
        or not event.organizer.user.is_active
        or event.starts_at <= timezone.now()
    ):
        raise Conflict("Event is unavailable.")
    if outcome == "failure":
        return order
    # Totals are always recomputed from purchase-time item prices; a client never
    # supplies a discount. The event is already locked above, so redemption counting
    # is serialized by exactly the same lock that protects seat inventory.
    subtotal = sum(item.unit_price_minor * item.quantity for item in order.items.all())
    discount = 0
    redemption = None
    if promo_code is not None:
        code, discount = price_promo(order, subtotal, promo_code)
        redemption = PromoRedemption(
            order=order, campaign=code.campaign, promo_code=code, discount_minor=discount
        )
    order.subtotal_minor = subtotal
    order.discount_minor = discount
    order.total_minor = subtotal - discount
    if redemption is not None:
        redemption.save()
    if order.total_minor:
        Payment.objects.create(order=order, amount_minor=order.total_minor)
    Ticket.objects.bulk_create(
        [Ticket(order_item=item) for item in order.items.all() for _ in range(item.quantity)]
    )
    order.status = "confirmed"
    order.confirmed_at = timezone.now()
    order.save(
        update_fields=[
            "status",
            "confirmed_at",
            "subtotal_minor",
            "discount_minor",
            "total_minor",
        ]
    )
    return order


def qr_identifier(token):
    try:
        identifier = signing.Signer(salt="biletflow.admission.v1").unsign(token)
        return UUID(identifier)
    except (signing.BadSignature, ValueError) as exc:
        raise ValidationError({"qr_token": "Invalid admission token."}) from exc


def check_qr(ticket, token):
    if qr_identifier(token) != ticket.identifier:
        raise ValidationError({"qr_token": "Token belongs to a different ticket."})


@transaction.atomic
def check_in(ticket_id, user, token):
    initial = get_object_or_404(Ticket, pk=ticket_id)
    event = Event.objects.select_for_update().get(pk=initial.order_item.order.event_id)
    if not user.is_superuser and event.organizer.user_id != user.pk:
        from rest_framework.exceptions import NotFound

        raise NotFound()
    ticket = Ticket.objects.select_for_update().get(pk=ticket_id)
    check_qr(ticket, token)
    if ticket.status != "valid":
        raise Conflict("Ticket has already been checked in.")
    ticket.status = "checked_in"
    ticket.checked_in_at = timezone.now()
    ticket.checked_in_by = user
    ticket.save(update_fields=["status", "checked_in_at", "checked_in_by"])
    return ticket


def record_audit(event, actor, action, entity, description=""):
    # Append-only helper: every refund/cancel/redemption path writes through here so
    # the activity timeline in SRS 4.11 has real data from the moment features land.
    return AuditLog.objects.create(
        event=event,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        entity_type=type(entity).__name__,
        entity_id=entity.pk,
        description=description,
    )


def normalize_code(code):
    return " ".join(str(code).split()).upper()


def campaign_link_token():
    # Opaque, high-entropy and unrelated to the admission signer, so a Campaign QR can
    # never be mistaken for (or replayed as) an admission credential - SRS 4.14.
    return secrets.token_urlsafe(32)


def link_token_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def campaign_link(request, token):
    return request.build_absolute_uri(f"/c/{token}")


def discountable(order, campaign, subtotal):
    kinds = set(campaign.ticket_types.values_list("pk", flat=True))
    if not kinds:
        return subtotal
    return sum(
        item.unit_price_minor * item.quantity
        for item in order.items.all()
        if item.ticket_type_id in kinds
    )


def price_promo(order, subtotal, code_text):
    """Validate a promo code against an order and return (PromoCode, discount_minor).

    Raises rather than silently skipping the discount, so an expired or exhausted code
    fails the checkout with a clear message instead of charging full price quietly.
    """
    code = PromoCode.objects.filter(code=normalize_code(code_text)).first()
    if code is None or code.campaign.event_id != order.event_id:
        raise ValidationError({"promo_code": "Unknown code for this event."})
    campaign = code.campaign
    if not campaign.enabled:
        raise ValidationError({"promo_code": "This code is no longer available."})
    now = timezone.now()
    if campaign.starts_at and campaign.starts_at > now:
        raise ValidationError({"promo_code": "This code is not active yet."})
    if campaign.ends_at and campaign.ends_at <= now:
        raise ValidationError({"promo_code": "This code has expired."})
    if (
        campaign.max_redemptions is not None
        and campaign.redemptions.count() >= campaign.max_redemptions
    ):
        raise Conflict("This code has reached its redemption limit.")
    base = discountable(order, campaign, subtotal)
    if not base:
        raise ValidationError({"promo_code": "This code does not apply to these tickets."})
    if campaign.discount_type == "percent":
        discount = base * campaign.discount_value // 100
    else:
        discount = min(campaign.discount_value, base)
    return code, min(discount, subtotal)


def invalidate_tickets(order, status):
    return Ticket.objects.filter(order_item__order=order).update(status=status)


@transaction.atomic
def cancel_order(user, order_id):
    initial = get_object_or_404(Order, pk=order_id, purchaser=user)
    event = Event.objects.select_for_update().get(pk=initial.event_id)
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.status == "confirmed":
        # SRS 4.9 allows cancelling free registrations; paid orders must go through
        # the refund endpoint so a Refund row and its audit entry are always created.
        if order.total_minor:
            raise Conflict("Paid orders must be refunded, not cancelled.")
        invalidate_tickets(order, "cancelled")
        order.status = "cancelled"
        order.save(update_fields=["status"])
        record_audit(event, user, "order.cancelled", order, "Free registration cancelled.")
        return order
    if order.status != "pending":
        raise Conflict("Order is already cancelled or refunded.")
    order.status = "cancelled"
    order.save(update_fields=["status"])
    return order


@transaction.atomic
def refund_order(user, order_id):
    """Full refund of a confirmed paid order. Safe to call repeatedly."""
    initial = get_object_or_404(Order, pk=order_id)
    # Same lock order as checkout: the event first, then the order, then its tickets.
    event = Event.objects.select_for_update().get(pk=initial.event_id)
    if not user.is_superuser and event.organizer.user_id != user.pk:
        raise NotFound()
    order = Order.objects.select_for_update().get(pk=order_id)
    payment = Payment.objects.filter(order=order).first()
    if payment is None:
        raise Conflict("Free orders are cancelled rather than refunded.")
    existing = Refund.objects.filter(payment=payment).first()
    if existing is not None:
        # Idempotent, mirroring how checkout returns an already-confirmed order.
        return order, existing
    if order.status != "confirmed":
        raise Conflict("Only confirmed orders can be refunded.")
    tickets = Ticket.objects.select_for_update().filter(order_item__order=order)
    if tickets.filter(status="checked_in").exists():
        # ASSUMPTION (not stated in SRS 4.9): admission already granted is a delivered
        # service, so refunding it would invalidate a ticket whose holder is inside the
        # venue. Blocking keeps the check-in record and the refund record consistent.
        raise Conflict("Order has a checked-in ticket and cannot be refunded.")
    refund = Refund.objects.create(
        payment=payment, initiated_by=user, amount_minor=payment.amount_minor
    )
    invalidate_tickets(order, "refunded")
    order.status = "refunded"
    order.save(update_fields=["status"])
    record_audit(
        event, user, "order.refunded", order, f"Full refund of {payment.amount_minor} tiyn."
    )
    return order, refund


def campaign_active(campaign):
    now = timezone.now()
    return bool(
        campaign.enabled
        and (campaign.starts_at is None or campaign.starts_at <= now)
        and (campaign.ends_at is None or campaign.ends_at > now)
        and (
            campaign.max_redemptions is None
            or campaign.redemptions.count() < campaign.max_redemptions
        )
    )
