from datetime import timedelta
from uuid import UUID

from django.core import signing
from django.db import transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from .models import Event, Order, OrderItem, Payment, Ticket, TicketType


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
def checkout(user, order_id, outcome):
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
    if order.total_minor:
        Payment.objects.create(order=order, amount_minor=order.total_minor)
    Ticket.objects.bulk_create(
        [Ticket(order_item=item) for item in order.items.all() for _ in range(item.quantity)]
    )
    order.status = "confirmed"
    order.confirmed_at = timezone.now()
    order.save(update_fields=["status", "confirmed_at"])
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
