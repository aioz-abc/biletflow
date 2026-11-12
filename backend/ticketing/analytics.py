"""Organizer analytics for one event (SRS 4.15, docs/ANALYTICS_REQUIREMENTS.md).

Cash-flow rules agreed with Aizhan and Mirat: a sale, its discount, its fee and its
tickets land on ``Order.confirmed_at``; a refund and the reversal of its fee land on
``Refund.created_at``. Days are calendar days in TIME_ZONE (Asia/Almaty), ``from``
inclusive and ``to`` exclusive. Every figure is summed from per-line movements, so
the daily, ticket-type and campaign rows reconcile with the totals by construction.
"""

from collections import defaultdict
from datetime import date, timedelta

from django.conf import settings
from django.db.models import Count, F, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import OrderItem
from .services import reserved, split_by_weight

MAX_DAYS = 366
COUNTS = ("issued_tickets",)
MONEY = (
    "sales_before_discount_minor",
    "discount_minor",
    "collected_minor",
    "refunded_minor",
    "net_receipts_minor",
    "fees_minor",
)


def parse_filters(event, params):
    start, end = params.get("from") or None, params.get("to") or None
    if (start is None) != (end is None):
        raise ValidationError({"from": "Send both from and to, or neither."})
    if start is not None:
        try:
            start, end = date.fromisoformat(start), date.fromisoformat(end)
        except ValueError as exc:
            raise ValidationError({"from": "Dates must be YYYY-MM-DD."}) from exc
        if end <= start:
            raise ValidationError({"to": "Must be after from."})
        if (end - start).days > MAX_DAYS:
            raise ValidationError({"to": f"The interval is limited to {MAX_DAYS} days."})
    kind = params.get("ticket_type") or None
    if kind is not None:
        kind = event.ticket_types.filter(pk=kind).first() if kind.isdigit() else None
        if kind is None:
            raise ValidationError({"ticket_type": "Not a ticket type of this event."})
    return start, end, kind


def confirmed_lines(event):
    """Every line of every order that was ever confirmed, with its share of the fee."""
    lines = list(
        OrderItem.objects.filter(order__event=event, order__confirmed_at__isnull=False)
        .annotate(
            active=Count("tickets", filter=Q(tickets__status__in=["valid", "checked_in"])),
            checked_in=Count("tickets", filter=Q(tickets__status="checked_in")),
        )
        .values(
            "pk",
            "order_id",
            "ticket_type_id",
            "quantity",
            "unit_price_minor",
            "discount_minor",
            "active",
            "checked_in",
            confirmed_at=F("order__confirmed_at"),
            fee_minor=F("order__payment__fee_minor"),
            refunded_at=F("order__payment__refund__created_at"),
            campaign_id=F("order__redemption__campaign_id"),
        )
    )
    by_order = defaultdict(list)
    for line in lines:
        line["collected_minor"] = (
            line["unit_price_minor"] * line["quantity"] - line["discount_minor"]
        )
        by_order[line["order_id"]].append(line)
    # The order-level fee is split by each line's collected amount (agreed rule 5).
    for order_lines in by_order.values():
        shares = split_by_weight(
            {line["pk"]: line["collected_minor"] for line in order_lines},
            order_lines[0]["fee_minor"] or 0,
        )
        for line in order_lines:
            line["fee_share_minor"] = shares[line["pk"]]
    return lines


def movements(line):
    """(day, amounts) for the sale and, if refunded, the refund of one line."""
    day = timezone.localtime(line["confirmed_at"]).date()
    before = line["unit_price_minor"] * line["quantity"]
    yield (
        day,
        {
            "issued_tickets": line["quantity"],
            "sales_before_discount_minor": before,
            "discount_minor": line["discount_minor"],
            "collected_minor": line["collected_minor"],
            "fees_minor": line["fee_share_minor"],
        },
    )
    if line["refunded_at"] is not None:
        yield (
            timezone.localtime(line["refunded_at"]).date(),
            {"refunded_minor": line["collected_minor"], "fees_minor": -line["fee_share_minor"]},
        )


def blank():
    return dict.fromkeys(COUNTS + MONEY, 0)


def add(bucket, amounts):
    for key, value in amounts.items():
        bucket[key] += value
    bucket["net_receipts_minor"] = bucket["collected_minor"] - bucket["refunded_minor"]


def percent(part, whole):
    return round(part * 100 / whole, 1) if whole else 0


def held(event, kind=None):
    pending = OrderItem.objects.filter(
        order__event=event, order__status="pending", order__expires_at__gt=timezone.now()
    )
    if kind is not None:
        pending = pending.filter(ticket_type=kind)
    return pending.aggregate(total=Sum("quantity"))["total"] or 0


def event_analytics(event, params):
    start, end, kind = parse_filters(event, params)
    lines = confirmed_lines(event)
    scoped = [line for line in lines if kind is None or line["ticket_type_id"] == kind.pk]

    totals = blank()
    daily = defaultdict(blank)
    types = {t.pk: t for t in event.ticket_types.all()}
    type_rows = {pk: blank() for pk in types if kind is None or pk == kind.pk}
    campaigns = {c.pk: c for c in event.campaigns.all()}
    campaign_rows = {pk: blank() | {"orders": set(), "active": 0} for pk in campaigns}
    for line in scoped:
        for day, amounts in movements(line):
            if start is not None and not start <= day < end:
                continue
            buckets = [totals, daily[day], type_rows[line["ticket_type_id"]]]
            if line["campaign_id"] is not None:
                buckets.append(campaign_rows[line["campaign_id"]])
            for bucket in buckets:
                add(bucket, amounts)
            if line["campaign_id"] is not None and "issued_tickets" in amounts:
                campaign_rows[line["campaign_id"]]["orders"].add(line["order_id"])
                campaign_rows[line["campaign_id"]]["active"] += line["active"]

    # Every day of the interval, zero days included. All-time spans first..last activity.
    if start is None:
        start, end = (min(daily), max(daily) + timedelta(days=1)) if daily else (None, None)
    series = []
    if start is not None:
        series = [
            {"date": (start + timedelta(days=n)).isoformat(), **daily[start + timedelta(days=n)]}
            for n in range((end - start).days)
        ]

    active = sum(line["active"] for line in lines)
    checked_in = sum(line["checked_in"] for line in lines)
    inventory = {
        "capacity": event.capacity,
        "active_tickets": active,
        "reserved_tickets": held(event),
        "remaining": max(0, event.capacity - reserved(event.pk)),
        "checked_in": checked_in,
        "check_in_percent": percent(checked_in, active),
        "ticket_type": None,
    }
    if kind is not None:
        # Kept apart from the whole-event figures so a type's quota is never
        # presented as event capacity (acceptance case 10).
        type_active = sum(line["active"] for line in scoped)
        type_checked_in = sum(line["checked_in"] for line in scoped)
        inventory["ticket_type"] = {
            "id": kind.pk,
            "name": kind.name,
            "quantity": kind.quantity,
            "active_tickets": type_active,
            "reserved_tickets": held(event, kind),
            "type_remaining": max(0, kind.quantity - reserved(event.pk, kind.pk)),
            "checked_in": type_checked_in,
            "check_in_percent": percent(type_checked_in, type_active),
        }

    per_type = defaultdict(lambda: {"active": 0, "checked_in": 0})
    for line in lines:
        per_type[line["ticket_type_id"]]["active"] += line["active"]
        per_type[line["ticket_type_id"]]["checked_in"] += line["checked_in"]
    return {
        "event": event.pk,
        "currency": "KZT",
        "timezone": settings.TIME_ZONE,
        "simulated": True,
        "as_of": timezone.now().isoformat(),
        "filters": {
            "from": params.get("from") or None,
            "to": params.get("to") or None,
            "ticket_type": kind.pk if kind else None,
        },
        "inventory": inventory,
        "totals": totals,
        "daily": series,
        "ticket_types": [
            {
                "id": pk,
                "name": types[pk].name,
                "price_minor": types[pk].price_minor,
                **row,
                "active_tickets": per_type[pk]["active"],
                "checked_in": per_type[pk]["checked_in"],
            }
            for pk, row in type_rows.items()
        ],
        "campaign_scope": (
            "Orders that redeemed the campaign's code; sales on the confirmation day, "
            "refunds on the refund day; active_tickets is current."
        ),
        "campaigns": [
            {
                "id": pk,
                "name": campaigns[pk].name,
                "redemptions": len(row.pop("orders")),
                "active_tickets": row.pop("active"),
                **row,
            }
            for pk, row in campaign_rows.items()
        ],
    }
