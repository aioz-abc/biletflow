"""Phase 6 stabilization: edge cases in checkout, refunds and promo codes."""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import OrganizerProfile, User
from ticketing.models import Event, PromotionalCampaign
from ticketing.testing import activate_paid_sales


class Phase6Base(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", "secret")
        OrganizerProfile.objects.create(
            user=self.owner, display_name="Host", contact_email=self.owner.email
        )
        self.buyer = User.objects.create_user("buyer@example.com", "secret")
        self.organizer = APIClient()
        self.organizer.force_authenticate(self.owner)
        self.attendee = APIClient()
        self.attendee.force_authenticate(self.buyer)
        response = self.organizer.post(
            "/api/events",
            {
                "title": "Concert",
                "description": "Live music",
                "venue": "Almaty",
                "starts_at": (timezone.now() + timedelta(days=2)).isoformat(),
                "ends_at": (timezone.now() + timedelta(days=2, hours=2)).isoformat(),
                "capacity": 10,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.event = response.json()["id"]
        self.paid = self.ticket_type("Paid", 10000)
        self.free = self.ticket_type("Free", 0)
        self.organizer.post(f"/api/events/{self.event}/publish", {"published": True}, format="json")
        activate_paid_sales(self.event)

    def ticket_type(self, name, price, **extra):
        response = self.organizer.post(
            f"/api/events/{self.event}/ticket-types",
            {"name": name, "price_minor": price, "quantity": 5, **extra},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["id"]

    def buy(self, kind, quantity=1, **checkout):
        order = self.attendee.post(
            "/api/orders",
            {"event": self.event, "items": [{"ticket_type": kind, "quantity": quantity}]},
            format="json",
        )
        self.assertEqual(order.status_code, 201, order.content)
        order_id = order.json()["id"]
        response = self.attendee.post(
            f"/api/orders/{order_id}/checkout", {"outcome": "success", **checkout}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def campaign(self, **fields):
        response = self.organizer.post(
            f"/api/events/{self.event}/campaigns",
            {"name": "Spring", "discount_type": "percent", "discount_value": 10, **fields},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def start_event(self):
        # The API refuses past start dates, so move the clock the direct way.
        Event.objects.filter(pk=self.event).update(
            starts_at=timezone.now() - timedelta(minutes=5),
            ends_at=timezone.now() + timedelta(hours=2),
        )


class TicketTypeValidationTests(Phase6Base):
    def test_ticket_type_sale_cannot_open_after_the_event_starts(self):
        response = self.organizer.post(
            f"/api/events/{self.event}/ticket-types",
            {
                "name": "Late",
                "price_minor": 0,
                "quantity": 5,
                "sales_start": (timezone.now() + timedelta(days=3)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("sales_start", response.json())

    def test_moving_sales_start_past_the_event_start_is_rejected(self):
        response = self.organizer.patch(
            f"/api/ticket-types/{self.free}",
            {"sales_start": (timezone.now() + timedelta(days=5)).isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)

    def test_sales_start_before_the_event_is_still_accepted(self):
        response = self.organizer.patch(
            f"/api/ticket-types/{self.free}",
            {"sales_start": (timezone.now() + timedelta(days=1)).isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)


class CancellationTests(Phase6Base):
    def test_attendee_cannot_cancel_free_registration_after_start(self):
        order = self.buy(self.free)
        self.start_event()
        response = self.attendee.post(f"/api/orders/{order['id']}/cancel")
        self.assertEqual(response.status_code, 409, response.content)
        tickets = self.attendee.get(f"/api/orders/{order['id']}").json()["tickets"]
        self.assertEqual(tickets[0]["status"], "valid")

    def test_organizer_can_still_cancel_after_start(self):
        order = self.buy(self.free)
        self.start_event()
        response = self.organizer.post(f"/api/orders/{order['id']}/cancel")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "cancelled")

    def test_attendee_can_cancel_before_start(self):
        order = self.buy(self.free)
        response = self.attendee.post(f"/api/orders/{order['id']}/cancel")
        self.assertEqual(response.status_code, 200, response.content)

    def test_holder_can_still_change_after_start_until_check_in(self):
        # Passing a ticket on at the door is legitimate; only check-in closes it.
        order = self.buy(self.free)
        self.start_event()
        ticket = order["tickets"][0]["id"]
        response = self.attendee.patch(
            f"/api/tickets/{ticket}", {"name": "Friend", "email": ""}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)


class PromoTests(Phase6Base):
    def test_fully_discounted_paid_order_is_not_a_free_registration(self):
        code = self.campaign(discount_value=100)["codes"][0]["code"]
        order = self.buy(self.paid, promo_code=code)
        self.assertEqual(order["total_minor"], 0)
        summary = self.organizer.get(f"/api/events/{self.event}/sales").json()
        self.assertEqual(summary["free_registrations"], 0, summary)

    def test_refunded_order_frees_its_promo_redemption(self):
        code = self.campaign(max_redemptions=1)["codes"][0]["code"]
        first = self.buy(self.paid, promo_code=code)
        refund = self.organizer.post(f"/api/orders/{first['id']}/refund")
        self.assertEqual(refund.status_code, 200, refund.content)
        order = self.attendee.post(
            "/api/orders",
            {"event": self.event, "items": [{"ticket_type": self.paid, "quantity": 1}]},
            format="json",
        ).json()
        preview = self.attendee.post(
            f"/api/orders/{order['id']}/preview", {"promo_code": code}, format="json"
        )
        self.assertEqual(preview.status_code, 200, preview.content)
        report = self.organizer.get(f"/api/events/{self.event}/campaigns").json()
        rows = report["results"] if isinstance(report, dict) else report
        # Reporting still shows the undone redemption; only the limit ignores it.
        self.assertEqual(rows[0]["report"]["redemptions"], 1)

    def test_active_redemptions_still_hit_the_limit(self):
        code = self.campaign(max_redemptions=1)["codes"][0]["code"]
        self.buy(self.paid, promo_code=code)
        order = self.attendee.post(
            "/api/orders",
            {"event": self.event, "items": [{"ticket_type": self.paid, "quantity": 1}]},
            format="json",
        ).json()
        response = self.attendee.post(
            f"/api/orders/{order['id']}/checkout",
            {"outcome": "success", "promo_code": code},
            format="json",
        )
        self.assertEqual(response.status_code, 409, response.content)

    def test_campaign_limit_cannot_drop_below_redemptions(self):
        campaign = self.campaign(max_redemptions=3)
        code = campaign["codes"][0]["code"]
        self.buy(self.paid, promo_code=code)
        self.buy(self.paid, promo_code=code)
        response = self.organizer.patch(
            f"/api/campaigns/{campaign['id']}", {"max_redemptions": 1}, format="json"
        )
        self.assertEqual(response.status_code, 400, response.content)
        ok = self.organizer.patch(
            f"/api/campaigns/{campaign['id']}", {"max_redemptions": 2}, format="json"
        )
        self.assertEqual(ok.status_code, 200, ok.content)

    def test_campaign_on_free_ticket_types_only_is_rejected(self):
        response = self.organizer.post(
            f"/api/events/{self.event}/campaigns",
            {
                "name": "Free",
                "discount_type": "percent",
                "discount_value": 10,
                "ticket_types": [self.free],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(PromotionalCampaign.objects.count(), 0)

    def test_campaign_mixing_free_and_paid_types_is_accepted(self):
        self.campaign(ticket_types=[self.free, self.paid])

    def test_price_change_after_sales_keeps_the_order_price(self):
        order = self.buy(self.paid)
        self.organizer.patch(
            f"/api/ticket-types/{self.paid}", {"price_minor": 50000}, format="json"
        )
        summary = self.organizer.get(f"/api/events/{self.event}/sales").json()
        self.assertEqual(summary["gross_minor"], order["total_minor"])


class EventOrdersTests(Phase6Base):
    def orders(self, client=None):
        response = (client or self.organizer).get(f"/api/events/{self.event}/orders")
        return response

    def test_lists_orders_with_the_allowed_action(self):
        paid = self.buy(self.paid, quantity=2)
        free = self.buy(self.free)
        rows = {row["id"]: row for row in self.orders().json()["results"]}
        self.assertEqual(rows[paid["id"]]["action"], "refund")
        self.assertEqual(rows[paid["id"]]["tickets"], 2)
        self.assertEqual(rows[paid["id"]]["purchaser_email"], "buyer@example.com")
        self.assertEqual(rows[free["id"]]["action"], "cancel")

    def test_refunded_and_checked_in_orders_have_no_action(self):
        paid = self.buy(self.paid)
        self.organizer.post(f"/api/orders/{paid['id']}/refund")
        free = self.buy(self.free)
        ticket = free["tickets"][0]
        checked = self.organizer.post(
            f"/api/tickets/{ticket['id']}/check-in", {"qr_token": ticket["qr_token"]}, format="json"
        )
        self.assertEqual(checked.status_code, 200, checked.content)
        rows = {row["id"]: row for row in self.orders().json()["results"]}
        self.assertEqual(rows[paid["id"]]["status"], "refunded")
        self.assertIsNone(rows[paid["id"]]["action"])
        self.assertEqual(rows[free["id"]]["checked_in"], 1)
        self.assertIsNone(rows[free["id"]]["action"])

    def test_fully_discounted_paid_order_is_cancelled_not_refunded(self):
        code = self.campaign(discount_value=100)["codes"][0]["code"]
        order = self.buy(self.paid, promo_code=code)
        row = self.orders().json()["results"][0]
        self.assertEqual((row["id"], row["action"]), (order["id"], "cancel"))

    def test_pending_reservations_are_left_out(self):
        self.attendee.post(
            "/api/orders",
            {"event": self.event, "items": [{"ticket_type": self.free, "quantity": 1}]},
            format="json",
        )
        self.assertEqual(self.orders().json()["count"], 0)

    def test_only_the_organizer_sees_the_list(self):
        self.assertEqual(self.orders(self.attendee).status_code, 404)
