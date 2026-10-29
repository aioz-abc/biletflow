import hashlib
from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError

from accounts.models import User

from . import notifications
from .models import (
    AuditLog,
    Event,
    Order,
    OrderItem,
    Payment,
    PromoCode,
    PromoRedemption,
    Refund,
    SupportCase,
    SupportMessage,
    Ticket,
    TicketType,
)
from .permissions import can_check_in, can_handle_case, support_cases, visible_events


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
    if event.visibility == "private" and not (
        user.is_superuser or event.organizer.user_id == user.pk
    ):
        raise NotFound()
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
    record_audit(event, user, "order.created", order)
    return order


def processing_fee(amount_minor):
    """Simulated platform processing charge withheld from the organizer payout.

    The attendee pays the ticket total; the fee is reported to the organizer in the
    sales summary (SRS 4.6). Rounded half up to a whole tiyn.
    """
    return (amount_minor * settings.PROCESSING_FEE_BPS + 5000) // 10000


def ensure_checkout_available(user, event, order):
    if order.status != "pending" or order.expires_at <= timezone.now():
        raise Conflict("Order is cancelled or expired.")
    if (
        not event.published
        or not event.organizer.user.is_active
        or event.starts_at <= timezone.now()
        or (
            event.visibility == "private"
            and not (user.is_superuser or event.organizer.user_id == user.pk)
        )
    ):
        raise Conflict("Event is unavailable.")


def preview_order(user, order_id, promo_code=None):
    order = get_object_or_404(
        Order.objects.select_related("event__organizer__user"), pk=order_id, purchaser=user
    )
    ensure_checkout_available(user, order.event, order)
    subtotal = sum(item.unit_price_minor * item.quantity for item in order.items.all())
    discount = price_promo(order, subtotal, promo_code)[1] if promo_code else 0
    return {
        "subtotal_minor": subtotal,
        "discount_minor": discount,
        "total_minor": subtotal - discount,
        "currency": order.currency,
    }


@transaction.atomic
def checkout(user, order_id, outcome, promo_code=None):
    initial = get_object_or_404(Order, pk=order_id, purchaser=user)
    event = Event.objects.select_for_update().get(pk=initial.event_id)
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.status == "confirmed":
        return order
    ensure_checkout_available(user, event, order)
    if outcome == "failure":
        record_audit(event, user, "payment.failed", order, "Simulated payment failed.")
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
        record_audit(event, user, "promo.redeemed", redemption)
    if order.total_minor:
        payment = Payment.objects.create(
            order=order,
            amount_minor=order.total_minor,
            fee_minor=processing_fee(order.total_minor),
        )
        record_audit(event, user, "payment.completed", payment, f"{payment.amount_minor} tiyn.")
    Ticket.objects.bulk_create(
        [Ticket(order_item=item) for item in order.items.all() for _ in range(item.quantity)]
    )
    order.status = "confirmed"
    order.confirmed_at = timezone.now()
    # Email only after the transaction commits, so a rolled-back checkout never
    # tells the attendee they have a ticket (SRS 4.6: failed checkouts issue nothing).
    transaction.on_commit(lambda: notifications.send_order_confirmation(order.pk))
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
    if not can_check_in(user, event):
        raise NotFound()
    ticket = Ticket.objects.select_for_update().get(pk=ticket_id)
    check_qr(ticket, token)
    if ticket.status != "valid":
        raise Conflict("Ticket has already been checked in.")
    ticket.status = "checked_in"
    ticket.checked_in_at = timezone.now()
    ticket.checked_in_by = user
    ticket.save(update_fields=["status", "checked_in_at", "checked_in_by"])
    record_audit(event, user, "ticket.checked_in", ticket)
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


def describe_changes(instance, changes):
    value_fields = {
        "capacity",
        "quantity",
        "price_minor",
        "enabled",
        "discount_type",
        "discount_value",
        "visibility",
        "hidden",
    }
    return ", ".join(
        f"{field}: {getattr(instance, field)} -> {value}"
        if field in value_fields
        else f"{field} updated"
        for field, value in changes.items()
    )[:300]


def normalize_code(code):
    return " ".join(str(code).split()).upper()


def campaign_link_token(code):
    # Stable opaque token can be regenerated for a QR without storing bearer secrets.
    return salted_hmac("biletflow.campaign.v1", code).hexdigest()


def link_token_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def campaign_link(request, token):
    url = request.build_absolute_uri(f"/c/{token}")
    return url if settings.DEBUG else url.replace("http://", "https://", 1)


def resolve_campaign_link(token):
    code = get_object_or_404(
        PromoCode.objects.select_related("campaign__event__organizer__user"),
        link_token_digest=link_token_digest(token),
    )
    event = code.campaign.event
    if not event.published or event.visibility == "private" or not event.organizer.user.is_active:
        raise NotFound()
    return code


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
    initial = get_object_or_404(Order, pk=order_id)
    event = Event.objects.select_for_update().get(pk=initial.event_id)
    if user.pk != initial.purchaser_id and not (
        user.is_superuser or event.organizer.user_id == user.pk
    ):
        raise NotFound()
    order = Order.objects.select_for_update().get(pk=order_id)
    if order.status == "confirmed":
        # SRS 4.9 allows cancelling free registrations; paid orders must go through
        # the refund endpoint so a Refund row and its audit entry are always created.
        if order.total_minor:
            raise Conflict("Paid orders must be refunded, not cancelled.")
        if Ticket.objects.filter(order_item__order=order, status="checked_in").exists():
            raise Conflict("Checked-in registrations cannot be cancelled.")
        invalidate_tickets(order, "cancelled")
        order.status = "cancelled"
        order.save(update_fields=["status"])
        record_audit(event, user, "order.cancelled", order, "Free registration cancelled.")
        return order
    if order.status != "pending":
        raise Conflict("Order is already cancelled or refunded.")
    order.status = "cancelled"
    order.save(update_fields=["status"])
    record_audit(event, user, "order.cancelled", order, "Pending reservation cancelled.")
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


def ticket_type_stats(kind):
    """Inventory breakdown for one ticket type (SRS 4.3), as seen by its organizer."""
    tickets = Ticket.objects.filter(order_item__ticket_type=kind).aggregate(
        valid=Count("pk", filter=Q(status="valid")),
        checked_in=Count("pk", filter=Q(status="checked_in")),
        refunded=Count("pk", filter=Q(status="refunded")),
        cancelled=Count("pk", filter=Q(status="cancelled")),
    )
    held = (
        OrderItem.objects.filter(
            ticket_type=kind, order__status="pending", order__expires_at__gt=timezone.now()
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )
    sold = tickets["valid"] + tickets["checked_in"]
    return {
        "quantity": kind.quantity,
        "available": max(
            0,
            min(kind.quantity - held - sold, kind.event.capacity - reserved(kind.event_id)),
        ),
        "reserved": held,
        "sold": sold,
        "checked_in": tickets["checked_in"],
        "refunded": tickets["refunded"],
        "cancelled": tickets["cancelled"],
    }


def sales_summary(event):
    """Organizer sales report for one event (SRS 4.6). All money is simulated."""
    payments = Payment.objects.filter(order__event=event).select_related("order")
    refunded = Refund.objects.filter(payment__order__event=event)
    totals = payments.aggregate(
        gross=Sum("amount_minor"),
        discounts=Sum("order__discount_minor"),
        fees=Sum("fee_minor", filter=Q(refund__isnull=True)),
        count=Count("pk"),
    )
    refunds_minor = refunded.aggregate(total=Sum("amount_minor"))["total"] or 0
    gross = totals["gross"] or 0
    fees = totals["fees"] or 0
    by_type = []
    for kind in event.ticket_types.all():
        stats = ticket_type_stats(kind)
        revenue = (
            OrderItem.objects.filter(ticket_type=kind, order__status="confirmed").aggregate(
                total=Sum(F("unit_price_minor") * F("quantity"))
            )["total"]
            or 0
        )
        by_type.append(
            {
                "ticket_type": kind.pk,
                "name": kind.name,
                "price_minor": kind.price_minor,
                **stats,
                "sales_before_discount_minor": revenue,
            }
        )
    return {
        "event": event.pk,
        "currency": "KZT",
        "simulated": True,
        "processing_fee_bps": settings.PROCESSING_FEE_BPS,
        "paid_orders": totals["count"],
        "free_registrations": event.orders.filter(status="confirmed", total_minor=0).count(),
        "refunded_orders": refunded.count(),
        "gross_minor": gross,
        "discounts_minor": totals["discounts"] or 0,
        "refunds_minor": refunds_minor,
        "fees_minor": fees,
        "estimated_payout_minor": gross - refunds_minor - fees,
        "ticket_types": by_type,
    }


def support_context(user, event_id=None, order_id=None, ticket_id=None):
    """Resolve and authorize the event/order/ticket a case is opened from (SRS 4.13).

    The most specific link fills in the broader ones, so a case opened from a ticket
    page always carries its order and event too. Mismatched links are rejected.
    """
    ticket = order = event = None
    if ticket_id is not None:
        ticket = get_object_or_404(
            Ticket.objects.select_related("order_item__order"),
            pk=ticket_id,
            order_item__order__purchaser=user,
        )
        if order_id is not None and order_id != ticket.order_item.order_id:
            raise ValidationError({"ticket": "Ticket does not belong to this order."})
        order_id = ticket.order_item.order_id
    if order_id is not None:
        order = get_object_or_404(
            Order.objects.select_related("event"), pk=order_id, purchaser=user
        )
        if event_id is not None and event_id != order.event_id:
            raise ValidationError({"order": "Order does not belong to this event."})
        event = order.event
    elif event_id is not None:
        event = get_object_or_404(visible_events(user), pk=event_id)
    return event, order, ticket


@transaction.atomic
def open_support_case(user, data):
    event, order, ticket = support_context(
        user, data.get("event"), data.get("order"), data.get("ticket")
    )
    if event is not None:
        kind, categories = "attendee", SupportCase.ATTENDEE_CATEGORIES
    elif getattr(user, "organizer_profile", None) is not None:
        kind, categories = "platform", SupportCase.PLATFORM_CATEGORIES
    else:
        raise ValidationError({"event": "Open a case from an event, order or ticket."})
    if data["category"] not in categories:
        raise ValidationError({"category": f"Not a {kind} support category."})
    case = SupportCase.objects.create(
        requester=user,
        kind=kind,
        category=data["category"],
        subject=data["subject"],
        event=event,
        order=order,
        ticket=ticket,
    )
    SupportMessage.objects.create(case=case, author=user, body=data["message"])
    if event is not None:
        record_audit(event, user, "support.opened", case, f"Category: {case.category}.")
        notify_support(case, event.organizer.contact_email, "New support case")
    return case


def handled_case(user, case_id):
    # select_for_update cannot be combined with the DISTINCT in support_cases().
    get_object_or_404(support_cases(user), pk=case_id)
    return (
        SupportCase.objects.select_for_update(of=("self",))
        .select_related("event__organizer")
        .get(pk=case_id)
    )


@transaction.atomic
def post_support_message(user, case_id, body):
    case = handled_case(user, case_id)
    if case.status == "resolved":
        raise Conflict("Case is resolved; open a new case instead.")
    message = SupportMessage.objects.create(case=case, author=user, body=body)
    from_requester = user.pk == case.requester_id
    if from_requester and case.status == "waiting_for_customer":
        change_status(case, user, "in_progress")
    case.save(update_fields=["status", "updated_at"])
    if not from_requester:
        notify_support(case, case.requester.email, "New reply")
    elif case.assigned_to_id and case.assigned_to_id != user.pk:
        notify_support(case, case.assigned_to.email, "New reply")
    elif case.kind == "attendee":
        notify_support(case, case.event.organizer.contact_email, "New reply")
    return message


def change_status(case, actor, status):
    old, case.status = case.status, status
    if case.event_id:
        record_audit(case.event, actor, "support.status_changed", case, f"{old} -> {status}")


@transaction.atomic
def update_support_case(user, case_id, data):
    case = handled_case(user, case_id)
    if not can_handle_case(user, case):
        raise PermissionDenied("Only support staff can change status or assignment.")
    if "assigned_to" in data:
        assignee = data["assigned_to"]
        if assignee is not None:
            assignee = User.objects.filter(pk=assignee, is_active=True).first()
            if assignee is None or not can_handle_case(assignee, case):
                raise ValidationError({"assigned_to": "User cannot handle this case."})
        case.assigned_to = assignee
        if case.event_id:
            record_audit(
                case.event,
                user,
                "support.assigned",
                case,
                f"Assigned to {assignee.email}." if assignee else "Unassigned.",
            )
        if assignee and assignee.pk != user.pk:
            notify_support(case, assignee.email, "Case assigned to you")
    if "status" in data and data["status"] != case.status:
        change_status(case, user, data["status"])
        notify_support(case, case.requester.email, f"Status changed to {case.status}")
    case.save(update_fields=["status", "assigned_to", "updated_at"])
    return case


def notify_support(case, recipient, summary):
    transaction.on_commit(
        lambda: notifications.send_support_notification(case.pk, recipient, summary)
    )
