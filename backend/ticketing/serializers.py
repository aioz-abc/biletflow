from collections.abc import Mapping

from django.core import signing
from django.utils import timezone
from rest_framework import serializers

from accounts.serializers import StrictSerializer

from .models import (
    AuditLog,
    Event,
    Order,
    OrderItem,
    PromoCode,
    PromotionalCampaign,
    Refund,
    Ticket,
    TicketType,
)


class StrictModelSerializer(serializers.ModelSerializer):
    def to_internal_value(self, data):
        if not isinstance(data, Mapping):
            return super().to_internal_value(data)
        writable = {name for name, field in self.fields.items() if not field.read_only}
        unknown = set(data) - writable
        if unknown:
            raise serializers.ValidationError(
                {key: "Unknown or read-only field." for key in unknown}
            )
        return super().to_internal_value(data)


class EventSerializer(StrictModelSerializer):
    capacity = serializers.IntegerField(min_value=1, max_value=1000000)
    images = serializers.ListField(
        child=serializers.URLField(max_length=500), required=False, max_length=10
    )

    class Meta:
        model = Event
        fields = [
            "id",
            "organizer",
            "title",
            "description",
            "venue",
            "category",
            "images",
            "starts_at",
            "ends_at",
            "capacity",
            "visibility",
            "refund_policy",
            "published",
        ]
        read_only_fields = ["id", "organizer", "published"]

    def validate(self, attrs):
        start = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        end = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"ends_at": "Must be after starts_at."})
        if "starts_at" in attrs and start <= timezone.now():
            raise serializers.ValidationError({"starts_at": "Must be in the future."})
        return attrs


class TicketTypeSerializer(StrictModelSerializer):
    price_minor = serializers.IntegerField(min_value=0, max_value=1000000000, required=False)
    quantity = serializers.IntegerField(min_value=0, max_value=1000000)
    max_per_order = serializers.IntegerField(min_value=1, max_value=100, required=False)
    available = serializers.SerializerMethodField()

    class Meta:
        model = TicketType
        fields = [
            "id",
            "event",
            "name",
            "price_minor",
            "quantity",
            "max_per_order",
            "sales_start",
            "sales_end",
            "hidden",
            "available",
        ]
        read_only_fields = ["id", "event", "available"]

    def get_available(self, obj):
        from .services import reserved

        return max(
            0,
            min(
                obj.quantity - reserved(obj.event_id, obj.pk),
                obj.event.capacity - reserved(obj.event_id),
            ),
        )

    def validate(self, attrs):
        start = attrs.get("sales_start", getattr(self.instance, "sales_start", None))
        end = attrs.get("sales_end", getattr(self.instance, "sales_end", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"sales_end": "Must be after sales_start."})
        return attrs


def qr_token(ticket):
    return signing.Signer(salt="biletflow.admission.v1").sign(str(ticket.identifier))


class TicketSerializer(serializers.ModelSerializer):
    qr_token = serializers.SerializerMethodField()
    event = serializers.IntegerField(source="order_item.order.event_id")
    ticket_type = serializers.IntegerField(source="order_item.ticket_type_id")

    class Meta:
        model = Ticket
        fields = [
            "id",
            "identifier",
            "event",
            "ticket_type",
            "status",
            "issued_at",
            "checked_in_at",
            "qr_token",
        ]

    def get_qr_token(self, obj):
        return qr_token(obj)


class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["ticket_type", "quantity", "unit_price_minor"]


class OrderSerializer(serializers.ModelSerializer):
    items = ItemSerializer(many=True)
    tickets = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "event",
            "status",
            "subtotal_minor",
            "discount_minor",
            "total_minor",
            "currency",
            "expires_at",
            "created_at",
            "confirmed_at",
            "items",
            "tickets",
        ]

    def get_status(self, obj):
        return (
            "expired"
            if obj.status == "pending" and obj.expires_at <= timezone.now()
            else obj.status
        )

    def get_tickets(self, obj):
        return TicketSerializer(
            Ticket.objects.filter(order_item__order=obj).select_related("order_item__order"),
            many=True,
        ).data


class ReserveItemSerializer(StrictSerializer):
    ticket_type = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=100)


class ReserveSerializer(StrictSerializer):
    event = serializers.IntegerField(min_value=1)
    items = ReserveItemSerializer(many=True, allow_empty=False, max_length=20)

    def validate_items(self, items):
        if len({item["ticket_type"] for item in items}) != len(items):
            raise serializers.ValidationError("Duplicate ticket types.")
        if sum(item["quantity"] for item in items) > 100:
            raise serializers.ValidationError("At most 100 tickets per order.")
        return items


class CheckoutSerializer(StrictSerializer):
    outcome = serializers.ChoiceField(choices=["success", "failure"])
    promo_code = serializers.CharField(max_length=32, required=False, allow_blank=False)


class PublishSerializer(StrictSerializer):
    published = serializers.BooleanField()


class QRSerializer(StrictSerializer):
    qr_token = serializers.CharField(max_length=256)


class RefundSerializer(serializers.ModelSerializer):
    order = serializers.IntegerField(source="payment.order_id", read_only=True)

    class Meta:
        model = Refund
        fields = ["id", "order", "amount_minor", "initiated_by", "created_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "id",
            "event",
            "actor",
            "action",
            "entity_type",
            "entity_id",
            "description",
            "created_at",
        ]


class PromoCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PromoCode
        fields = ["id", "code"]


class CampaignSerializer(StrictModelSerializer):
    discount_value = serializers.IntegerField(min_value=1, max_value=1000000000)
    codes = PromoCodeSerializer(many=True, read_only=True)
    report = serializers.SerializerMethodField()

    class Meta:
        model = PromotionalCampaign
        fields = [
            "id",
            "event",
            "name",
            "discount_type",
            "discount_value",
            "ticket_types",
            "starts_at",
            "ends_at",
            "max_redemptions",
            "enabled",
            "created_at",
            "codes",
            "report",
        ]
        read_only_fields = ["id", "event", "created_at", "codes", "report"]

    def validate(self, attrs):
        start = attrs.get("starts_at", getattr(self.instance, "starts_at", None))
        end = attrs.get("ends_at", getattr(self.instance, "ends_at", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"ends_at": "Must be after starts_at."})
        if attrs.get("discount_type") == "percent" and attrs["discount_value"] > 100:
            raise serializers.ValidationError({"discount_value": "Percent cannot exceed 100."})
        event = self.context.get("event")
        kinds = attrs.get("ticket_types") or []
        if event and any(kind.event_id != event.pk for kind in kinds):
            raise serializers.ValidationError(
                {"ticket_types": "Ticket types must belong to this event."}
            )
        return attrs

    def get_report(self, obj):
        # SRS 4.14 campaign reporting: redemptions, orders, tickets sold, gross, discount, net.
        redemptions = list(obj.redemptions.select_related("order"))
        orders = [r.order for r in redemptions]
        gross = sum(order.subtotal_minor for order in orders)
        discount = sum(r.discount_minor for r in redemptions)
        return {
            "redemptions": len(redemptions),
            "orders": len({order.pk for order in orders}),
            "tickets_sold": Ticket.objects.filter(order_item__order__in=orders).count(),
            "gross_minor": gross,
            "discount_minor": discount,
            "net_minor": gross - discount,
        }


class CampaignLinkSerializer(StrictSerializer):
    token = serializers.CharField(max_length=128)
