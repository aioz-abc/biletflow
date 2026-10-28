from datetime import timedelta
from io import StringIO

from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import OrganizerProfile, User
from ticketing.models import Event, Order, Payment, PromoCode, Ticket


class Phase3Helpers:
    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", "secret")
        OrganizerProfile.objects.create(
            user=self.owner, display_name="Host", contact_email=self.owner.email
        )
        self.buyer = User.objects.create_user("buyer@example.com", "secret")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def inventory(self, price=10000, quantity=5):
        start = timezone.now() + timedelta(days=2)
        event = self.client.post(
            "/api/events",
            {
                "title": "Concert",
                "venue": "Almaty",
                "starts_at": start.isoformat(),
                "ends_at": (start + timedelta(hours=2)).isoformat(),
                "capacity": 10,
            },
            format="json",
        ).json()["id"]
        kind = self.client.post(
            f"/api/events/{event}/ticket-types",
            {"name": "Standard", "price_minor": price, "quantity": quantity},
            format="json",
        ).json()["id"]
        self.client.post(f"/api/events/{event}/publish", {"published": True}, format="json")
        return event, kind

    def buy(self, event, kind, quantity=1, outcome="success"):
        self.client.force_authenticate(self.buyer)
        order = self.client.post(
            "/api/orders",
            {"event": event, "items": [{"ticket_type": kind, "quantity": quantity}]},
            format="json",
        ).json()
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/orders/{order['id']}/checkout", {"outcome": outcome}, format="json"
            )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()


class OrderConfirmationEmailTests(Phase3Helpers, TestCase):
    def test_paid_checkout_emails_tickets_with_qr_attachments(self):
        event, kind = self.inventory()
        order = self.buy(event, kind, quantity=2)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["buyer@example.com"])
        self.assertIn("Concert", message.subject)
        for ticket in order["tickets"]:
            self.assertIn(ticket["identifier"], message.body)
        self.assertIn("no real money", message.body)
        self.assertEqual(len(message.attachments), 2)
        name, content, mimetype = message.attachments[0]
        self.assertTrue(name.endswith(".svg"))
        self.assertEqual(mimetype, "image/svg+xml")
        self.assertIn(b"<svg", content)
        self.assertEqual(message.alternatives[0][1], "text/html")

    def test_free_registration_is_emailed(self):
        event, kind = self.inventory(price=0)
        self.buy(event, kind)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Free registration", mail.outbox[0].body)

    def test_failed_or_repeated_checkout_sends_nothing_new(self):
        event, kind = self.inventory()
        self.buy(event, kind, outcome="failure")
        self.assertEqual(len(mail.outbox), 0)
        order = Order.objects.get()
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f"/api/orders/{order.pk}/checkout", {"outcome": "success"})
        with self.captureOnCommitCallbacks(execute=True):
            again = self.client.post(f"/api/orders/{order.pk}/checkout", {"outcome": "success"})
        self.assertEqual(again.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)


class TicketTypeStatsTests(Phase3Helpers, TestCase):
    def test_organizer_sees_inventory_breakdown_and_buyers_do_not(self):
        event, kind = self.inventory(quantity=5)
        first = self.buy(event, kind, quantity=2)
        self.buy(event, kind)  # becomes the refunded order below
        self.client.post(
            "/api/orders",
            {"event": event, "items": [{"ticket_type": kind, "quantity": 1}]},
            format="json",
        )  # pending hold
        self.client.force_authenticate(self.owner)
        refund_order = Order.objects.filter(status="confirmed").order_by("-pk").first()
        self.assertEqual(self.client.post(f"/api/orders/{refund_order.pk}/refund").status_code, 200)
        self.assertEqual(
            self.client.post(
                "/api/tickets/check-in", {"qr_token": first["tickets"][0]["qr_token"]}
            ).status_code,
            200,
        )
        stats = self.client.get(f"/api/events/{event}/ticket-types").json()["results"][0]["stats"]
        self.assertEqual(
            stats,
            {
                "quantity": 5,
                "available": 2,
                "reserved": 1,
                "sold": 2,
                "checked_in": 1,
                "refunded": 1,
                "cancelled": 0,
            },
        )
        self.client.force_authenticate(self.buyer)
        public = self.client.get(f"/api/events/{event}/ticket-types").json()["results"][0]
        self.assertIsNone(public["stats"])
        self.assertEqual(public["available"], 2)
        self.client.force_authenticate(None)
        anonymous = self.client.get(f"/api/events/{event}/ticket-types").json()["results"][0]
        self.assertIsNone(anonymous["stats"])


@override_settings(PROCESSING_FEE_BPS=300)
class SalesSummaryTests(Phase3Helpers, TestCase):
    def test_summary_reports_gross_fees_refunds_and_payout(self):
        event, kind = self.inventory(price=10000)
        self.buy(event, kind, quantity=2)  # 20000, fee 600
        self.buy(event, kind)  # 10000, fee 300, refunded below
        self.client.force_authenticate(self.owner)
        refunded = Order.objects.filter(total_minor=10000).get()
        self.client.post(f"/api/orders/{refunded.pk}/refund")
        free_event, free_kind = self.inventory(price=0)
        self.buy(free_event, free_kind)

        self.client.force_authenticate(self.owner)
        response = self.client.get(f"/api/events/{event}/sales")
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        self.assertTrue(data["simulated"])
        self.assertEqual(data["paid_orders"], 2)
        self.assertEqual(data["refunded_orders"], 1)
        self.assertEqual(data["gross_minor"], 30000)
        self.assertEqual(data["refunds_minor"], 10000)
        self.assertEqual(data["fees_minor"], 600)
        self.assertEqual(data["estimated_payout_minor"], 19400)
        self.assertEqual(data["ticket_types"][0]["sold"], 2)
        self.assertEqual(data["ticket_types"][0]["sales_before_discount_minor"], 20000)
        self.assertEqual(Payment.objects.order_by("pk").first().fee_minor, 600)

        free = self.client.get(f"/api/events/{free_event}/sales").json()
        self.assertEqual(free["free_registrations"], 1)
        self.assertEqual(free["gross_minor"], 0)

    def test_summary_is_owner_only(self):
        event, _ = self.inventory()
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get(f"/api/events/{event}/sales").status_code, 404)


@override_settings(DEBUG=True)
class SeedDemoTests(TestCase):
    def test_seed_is_repeatable_and_runs_the_real_checkout(self):
        call_command("seed_demo", stdout=StringIO())
        call_command("seed_demo", stdout=StringIO())
        self.assertEqual(Event.objects.filter(title__startswith="[Demo]").count(), 3)
        self.assertEqual(Order.objects.filter(status="confirmed").count(), 2)
        self.assertEqual(Ticket.objects.count(), 3)
        self.assertTrue(PromoCode.objects.filter(code="DEMO10").exists())
        self.assertTrue(User.objects.get(email="demo-admin@biletflow.local").is_superuser)
        self.assertFalse(User.objects.get(email="demo-attendee@biletflow.local").is_staff)
        paid = Order.objects.get(discount_minor__gt=0)
        self.assertEqual(paid.total_minor, 1440000)

    @override_settings(DEBUG=False)
    def test_default_password_is_refused_outside_debug(self):
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command("seed_demo", stdout=StringIO())
