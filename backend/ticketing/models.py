import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Event(models.Model):
    organizer = models.ForeignKey("accounts.OrganizerProfile", on_delete=models.PROTECT)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    venue = models.CharField(max_length=300)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    capacity = models.PositiveIntegerField()
    published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["starts_at", "pk"]
        constraints = [
            models.CheckConstraint(condition=Q(capacity__gt=0), name="event_capacity_positive"),
            models.CheckConstraint(
                condition=Q(ends_at__gt=F("starts_at")), name="event_dates_valid"
            ),
        ]


class TicketType(models.Model):
    event = models.ForeignKey(Event, on_delete=models.PROTECT, related_name="ticket_types")
    name = models.CharField(max_length=120)
    price_minor = models.PositiveBigIntegerField(default=0)
    quantity = models.PositiveIntegerField()
    max_per_order = models.PositiveIntegerField(default=10)
    sales_start = models.DateTimeField(null=True, blank=True)
    sales_end = models.DateTimeField(null=True, blank=True)
    hidden = models.BooleanField(default=False)

    class Meta:
        ordering = ["pk"]
        constraints = [
            models.CheckConstraint(condition=Q(max_per_order__gt=0), name="type_limit_positive"),
            models.CheckConstraint(
                condition=Q(sales_start__isnull=True)
                | Q(sales_end__isnull=True)
                | Q(sales_end__gt=F("sales_start")),
                name="type_dates_valid",
            ),
        ]


class Order(models.Model):
    purchaser = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    event = models.ForeignKey(Event, on_delete=models.PROTECT, related_name="orders")
    status = models.CharField(
        max_length=12,
        choices=[(v, v) for v in ("pending", "confirmed", "cancelled")],
        default="pending",
    )
    total_minor = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="KZT", editable=False)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True)

    class Meta:
        ordering = ["-created_at", "-pk"]


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="items")
    ticket_type = models.ForeignKey(TicketType, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    unit_price_minor = models.PositiveBigIntegerField()

    class Meta:
        ordering = ["pk"]
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gt=0), name="item_quantity_positive"),
            models.UniqueConstraint(fields=["order", "ticket_type"], name="one_type_per_order"),
        ]


class Payment(models.Model):
    order = models.OneToOneField(Order, on_delete=models.PROTECT, related_name="payment")
    amount_minor = models.PositiveBigIntegerField()
    simulation_reference = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)


class Ticket(models.Model):
    order_item = models.ForeignKey(OrderItem, on_delete=models.PROTECT, related_name="tickets")
    identifier = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(
        max_length=12, choices=[(v, v) for v in ("valid", "checked_in")], default="valid"
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    checked_in_at = models.DateTimeField(null=True)
    checked_in_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)

    class Meta:
        ordering = ["pk"]
