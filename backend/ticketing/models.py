import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Event(models.Model):
    organizer = models.ForeignKey("accounts.OrganizerProfile", on_delete=models.PROTECT)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    venue = models.CharField(max_length=300)
    category = models.CharField(max_length=50, blank=True)
    images = models.JSONField(default=list, blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    capacity = models.PositiveIntegerField()
    visibility = models.CharField(
        max_length=10,
        choices=[(v, v) for v in ("public", "unlisted", "private")],
        default="public",
    )
    refund_policy = models.TextField(blank=True)
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
        choices=[(v, v) for v in ("pending", "confirmed", "cancelled", "refunded")],
        default="pending",
    )
    subtotal_minor = models.PositiveBigIntegerField(default=0)
    discount_minor = models.PositiveBigIntegerField(default=0)
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
        max_length=12,
        choices=[(v, v) for v in ("valid", "checked_in", "cancelled", "refunded")],
        default="valid",
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    checked_in_at = models.DateTimeField(null=True)
    checked_in_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)

    class Meta:
        ordering = ["pk"]


class Refund(models.Model):
    # OneToOne on Payment enforces "at most one refund per payment" in the DB itself,
    # so a duplicate refund cannot be created even under concurrent requests.
    payment = models.OneToOneField(Payment, on_delete=models.PROTECT, related_name="refund")
    initiated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    amount_minor = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-pk"]


class PromotionalCampaign(models.Model):
    event = models.ForeignKey(Event, on_delete=models.PROTECT, related_name="campaigns")
    name = models.CharField(max_length=120)
    discount_type = models.CharField(max_length=7, choices=[(v, v) for v in ("percent", "fixed")])
    discount_value = models.PositiveBigIntegerField()
    # Empty means the campaign applies to every ticket type on the event (SRS 4.14).
    ticket_types = models.ManyToManyField(TicketType, blank=True, related_name="campaigns")
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    max_redemptions = models.PositiveIntegerField(null=True, blank=True)
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.CheckConstraint(
                condition=Q(discount_value__gt=0), name="campaign_discount_positive"
            ),
            models.CheckConstraint(
                condition=Q(discount_type="fixed") | Q(discount_value__lte=100),
                name="campaign_percent_within_range",
            ),
            models.CheckConstraint(
                condition=Q(starts_at__isnull=True)
                | Q(ends_at__isnull=True)
                | Q(ends_at__gt=F("starts_at")),
                name="campaign_dates_valid",
            ),
        ]


class PromoCode(models.Model):
    campaign = models.ForeignKey(
        PromotionalCampaign, on_delete=models.PROTECT, related_name="codes"
    )
    # Stored already normalized (upper-cased, trimmed) so uniqueness and lookup are
    # both effectively case-insensitive without a functional index.
    code = models.CharField(max_length=32, unique=True)
    # SHA-256 of the campaign-link token. The raw token is shown once at creation and
    # travels only inside the Campaign QR link; the digest is what we can look up.
    link_token_digest = models.CharField(max_length=64, unique=True)

    class Meta:
        ordering = ["pk"]


class PromoRedemption(models.Model):
    # OneToOne on Order enforces "an order cannot redeem twice" at the DB level.
    order = models.OneToOneField(Order, on_delete=models.PROTECT, related_name="redemption")
    campaign = models.ForeignKey(
        PromotionalCampaign, on_delete=models.PROTECT, related_name="redemptions"
    )
    promo_code = models.ForeignKey(PromoCode, on_delete=models.PROTECT, related_name="redemptions")
    discount_minor = models.PositiveBigIntegerField()
    redeemed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-redeemed_at", "-pk"]


class AuditLog(models.Model):
    # Append-only: product code never updates or deletes rows here (SRS 4.9 / 4.11).
    event = models.ForeignKey(Event, on_delete=models.PROTECT, related_name="audit_entries")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT)
    action = models.CharField(max_length=50)
    entity_type = models.CharField(max_length=50)
    entity_id = models.PositiveBigIntegerField()
    description = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
