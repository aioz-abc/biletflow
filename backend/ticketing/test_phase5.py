from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from ticketing.models import AuditLog, PaidSalesActivation, StaffAssignment, Ticket
from ticketing.test_phase3 import Phase3Helpers


class AttendeeDetailsTests(Phase3Helpers, TestCase):
    def checkout(self, event, kind, quantity, attendees=None):
        self.client.force_authenticate(self.buyer)
        order = self.client.post(
            "/api/orders",
            {"event": event, "items": [{"ticket_type": kind, "quantity": quantity}]},
            format="json",
        ).json()
        payload = {"outcome": "success"} | ({"attendees": attendees} if attendees else {})
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(f"/api/orders/{order['id']}/checkout", payload, format="json")

    def test_each_ticket_carries_its_holder_and_the_rest_default_to_the_buyer(self):
        self.buyer.first_name, self.buyer.last_name = "Aru", "Buyer"
        self.buyer.save()
        event, kind = self.inventory()
        response = self.checkout(
            event, kind, 3, [{"ticket_type": kind, "name": "Dana Friend", "email": "d@example.com"}]
        )
        self.assertEqual(response.status_code, 200, response.content)
        holders = [(t["attendee_name"], t["attendee_email"]) for t in response.json()["tickets"]]
        self.assertEqual(
            holders,
            [
                ("Dana Friend", "d@example.com"),
                ("Aru Buyer", "buyer@example.com"),
                ("Aru Buyer", "buyer@example.com"),
            ],
        )
        self.assertIn("Dana Friend", mail.outbox[-1].body)

        # The door sees who the ticket belongs to.
        staff = User.objects.create_user("door@example.com", "secret")
        StaffAssignment.objects.create(event_id=event, user=staff)
        door = APIClient()
        door.force_authenticate(staff)
        scanned = door.post(
            "/api/tickets/verify", {"qr_token": response.json()["tickets"][0]["qr_token"]}
        ).json()
        self.assertEqual(scanned["ticket"]["attendee_name"], "Dana Friend")

    def test_more_attendees_than_tickets_or_a_foreign_type_is_rejected(self):
        event, kind = self.inventory()
        too_many = [{"ticket_type": kind, "name": n} for n in ("A", "B")]
        self.assertEqual(self.checkout(event, kind, 1, too_many).status_code, 400)
        foreign = [{"ticket_type": kind + 999, "name": "A"}]
        self.assertEqual(self.checkout(event, kind, 1, foreign).status_code, 400)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_purchaser_can_rename_a_valid_ticket_only(self):
        event, kind = self.inventory()
        ticket = self.checkout(event, kind, 1).json()["tickets"][0]
        url = f"/api/tickets/{ticket['id']}"
        renamed = self.client.patch(url, {"name": "New Holder"}, format="json")
        self.assertEqual(renamed.status_code, 200, renamed.content)
        self.assertEqual(renamed.json()["attendee_name"], "New Holder")
        self.assertTrue(AuditLog.objects.filter(action="ticket.attendee_updated").exists())

        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.patch(url, {"name": "X"}, format="json").status_code, 404)
        self.client.post("/api/tickets/check-in", {"qr_token": ticket["qr_token"]})
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.patch(url, {"name": "Late"}, format="json").status_code, 409)

    def test_pdf_ticket_prints_the_attendee_name(self):
        event, kind = self.inventory()
        ticket = self.checkout(event, kind, 1, [{"ticket_type": kind, "name": "Printed Name"}])
        ticket = ticket.json()["tickets"][0]
        pdf = self.client.get(f"/api/tickets/{ticket['id']}/pdf")
        self.assertEqual(pdf.status_code, 200)
        self.assertIn(b"Printed Name", pdf.content)


class PaidSalesActivationTests(Phase3Helpers, TestCase):
    def setUp(self):
        super().setUp()
        start = timezone.now() + timedelta(days=5)
        self.event = self.client.post(
            "/api/events",
            {
                "title": "Paid gig",
                "venue": "Almaty",
                "starts_at": start.isoformat(),
                "ends_at": (start + timedelta(hours=2)).isoformat(),
                "capacity": 10,
            },
            format="json",
        ).json()["id"]
        self.paid = self.client.post(
            f"/api/events/{self.event}/ticket-types",
            {"name": "Standard", "price_minor": 10000, "quantity": 5},
            format="json",
        ).json()["id"]
        self.free = self.client.post(
            f"/api/events/{self.event}/ticket-types",
            {"name": "Guest list", "price_minor": 0, "quantity": 5},
            format="json",
        ).json()["id"]
        self.client.post(f"/api/events/{self.event}/publish", {"published": True}, format="json")
        self.url = f"/api/events/{self.event}/activation"

    def reserve(self, kind, event=None):
        client = APIClient()
        client.force_authenticate(self.buyer)
        return client.post(
            "/api/orders",
            {"event": event or self.event, "items": [{"ticket_type": kind, "quantity": 1}]},
            format="json",
        )

    def activate(self, **steps):
        return self.client.post(self.url, steps, format="json")

    def test_paid_tickets_are_blocked_until_the_checklist_and_fee_are_done(self):
        self.assertEqual(self.reserve(self.paid).status_code, 409)
        self.assertEqual(self.reserve(self.free).status_code, 201)

        state = self.client.get(self.url).json()
        self.assertEqual(state["status"], "not_started")
        self.assertTrue(state["simulated"])
        self.assertEqual(state["fee_minor"], 500000)
        self.assertEqual(
            {item["step"]: item["done"] for item in state["checklist"]},
            {
                "paid_ticket_type": True,
                "identity_verified": False,
                "payout_account": False,
                "terms_accepted": False,
                "fee_paid": False,
            },
        )

        early = self.activate(pay_fee="success")
        self.assertEqual(early.status_code, 409)
        self.assertIn("identity_verified", early.json()["detail"])

        state = self.activate(identity_confirmed=True, payout_reference="SIM-PAYOUT-1").json()
        self.assertEqual(state["status"], "in_progress")
        failed = self.activate(accept_terms=True, pay_fee="failure").json()
        self.assertEqual(failed["status"], "in_progress")
        self.assertEqual(self.reserve(self.paid).status_code, 409)

        active = self.activate(pay_fee="success").json()
        self.assertEqual(active["status"], "active")
        self.assertTrue(active["sales_open"])
        self.assertIsNotNone(active["fee_reference"])
        self.assertEqual(self.reserve(self.paid).status_code, 201)
        again = self.activate(pay_fee="success").json()
        self.assertEqual(again["fee_reference"], active["fee_reference"])

        actions = set(AuditLog.objects.filter(event_id=self.event).values_list("action", flat=True))
        self.assertTrue(
            {
                "activation.identity_verified",
                "activation.payout_connected",
                "activation.terms_accepted",
                "activation.fee_failed",
                "activation.activated",
            }
            <= actions
        )

    def test_activation_applies_only_to_its_event(self):
        self.activate(
            identity_confirmed=True, payout_reference="SIM-1", accept_terms=True, pay_fee="success"
        )
        other, kind = self.inventory()
        PaidSalesActivation.objects.filter(event_id=other).delete()
        self.assertEqual(self.reserve(kind, event=other).status_code, 409)

    def test_free_only_event_cannot_be_activated_and_real_numbers_are_refused(self):
        self.client.patch(f"/api/ticket-types/{self.paid}", {"price_minor": 0}, format="json")
        response = self.activate(
            identity_confirmed=True, payout_reference="SIM-1", accept_terms=True, pay_fee="success"
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("paid_ticket_type", response.json()["detail"])
        card = self.activate(payout_reference="4400 4301 2345 6789")
        self.assertEqual(card.status_code, 400)

    def test_only_the_owner_sees_or_changes_activation(self):
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.activate(identity_confirmed=True).status_code, 404)

    def test_platform_admin_can_suspend_paid_sales(self):
        state = self.activate(
            identity_confirmed=True, payout_reference="SIM-1", accept_terms=True, pay_fee="success"
        ).json()
        hold = self.reserve(self.paid).json()
        admin = APIClient()
        admin.force_authenticate(User.objects.create_superuser("root@example.com", "secret"))
        listed = admin.get("/api/admin/activations", {"status": "active"}).json()["results"]
        self.assertEqual([row["event_title"] for row in listed], ["Paid gig"])

        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.post(
                f"/api/admin/activations/{state['id']}/suspend", {"suspended": True}
            ).status_code,
            403,
        )
        suspended = admin.post(
            f"/api/admin/activations/{state['id']}/suspend",
            {"suspended": True, "reason": "Chargeback pattern"},
            format="json",
        ).json()
        self.assertEqual(suspended["status"], "suspended")
        self.assertEqual(self.reserve(self.paid).status_code, 409)
        self.assertEqual(self.reserve(self.free).status_code, 201)  # free sales continue
        buyer = APIClient()
        buyer.force_authenticate(self.buyer)
        self.assertEqual(
            buyer.post(f"/api/orders/{hold['id']}/checkout", {"outcome": "success"}).status_code,
            409,
        )
        reason = self.client.get(self.url).json()["suspension_reason"]
        self.assertEqual(reason, "Chargeback pattern")

        admin.post(f"/api/admin/activations/{state['id']}/suspend", {"suspended": False})
        self.assertEqual(self.reserve(self.paid).status_code, 201)
