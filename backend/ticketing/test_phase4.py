from django.core import mail
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts.models import User
from ticketing.models import AuditLog, Event, Order, PromoCode, StaffAssignment, Ticket
from ticketing.test_phase3 import Phase3Helpers


class OrderClosedEmailTests(Phase3Helpers, TestCase):
    def test_refund_emails_the_buyer_once(self):
        event, kind = self.inventory(price=10000)
        order = self.buy(event, kind, quantity=2)
        mail.outbox.clear()
        self.client.force_authenticate(self.owner)
        for _ in range(2):  # the refund endpoint is idempotent; so is the email
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(f"/api/orders/{order['id']}/refund")
            self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["buyer@example.com"])
        self.assertIn("refund", message.subject)
        self.assertIn("200.00 KZT", message.body)
        for ticket in order["tickets"]:
            self.assertIn(ticket["identifier"], message.body)

    def test_cancelled_free_registration_is_emailed_but_pending_hold_is_not(self):
        event, kind = self.inventory(price=0)
        order = self.buy(event, kind)
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f"/api/orders/{order['id']}/cancel")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("cancelled", mail.outbox[0].subject)

        hold = self.client.post(
            "/api/orders",
            {"event": event, "items": [{"ticket_type": kind, "quantity": 1}]},
            format="json",
        ).json()
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f"/api/orders/{hold['id']}/cancel")
        self.assertEqual(len(mail.outbox), 1)


class AdminHelpers(Phase3Helpers):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_superuser("root@example.com", "secret")
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)

    def suspend_event(self, event, suspended=True, reason=""):
        return self.admin_client.post(
            f"/api/admin/events/{event}/suspend",
            {"suspended": suspended, "reason": reason},
            format="json",
        )


class EventSuspensionTests(AdminHelpers, TestCase):
    def test_only_platform_admin_can_suspend(self):
        event, _ = self.inventory()
        self.assertEqual(
            self.client.post(
                f"/api/admin/events/{event}/suspend", {"suspended": True}, format="json"
            ).status_code,
            403,
        )
        self.assertIsNone(Event.objects.get(pk=event).suspended_at)

    def test_suspended_event_is_hidden_and_closed_for_sales(self):
        event, kind = self.inventory()
        self.client.post(
            f"/api/events/{event}/campaigns",
            {"name": "Spring", "discount_type": "percent", "discount_value": 10},
            format="json",
        )
        self.client.force_authenticate(self.buyer)
        pending = self.client.post(
            "/api/orders",
            {"event": event, "items": [{"ticket_type": kind, "quantity": 1}]},
            format="json",
        ).json()

        response = self.suspend_event(event, reason="Reported as fraudulent")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIsNotNone(response.json()["suspended_at"])

        self.assertEqual(self.client.get("/api/events").json()["count"], 0)
        self.assertEqual(self.client.get(f"/api/events/{event}").status_code, 404)
        self.assertEqual(
            self.client.post(
                "/api/orders",
                {"event": event, "items": [{"ticket_type": kind, "quantity": 1}]},
                format="json",
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                f"/api/orders/{pending['id']}/checkout", {"outcome": "success"}, format="json"
            ).status_code,
            409,
        )
        self.client.force_authenticate(None)
        code = PromoCode.objects.get()
        from ticketing.services import campaign_link_token

        self.assertEqual(
            self.client.get(f"/api/campaign-links/{campaign_link_token(code.code)}").status_code,
            404,
        )

        # The organizer still sees the event and why, but cannot republish it.
        self.client.force_authenticate(self.owner)
        own = self.client.get(f"/api/events/{event}").json()
        self.assertEqual(own["suspension_reason"], "Reported as fraudulent")
        self.assertEqual(
            self.client.post(
                f"/api/events/{event}/publish", {"published": True}, format="json"
            ).status_code,
            409,
        )
        self.assertTrue(
            AuditLog.objects.filter(
                event_id=event, action="event.suspended", actor=self.admin
            ).exists()
        )

        self.assertEqual(self.suspend_event(event, suspended=False).status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/events").json()["count"], 1)

    def test_issued_tickets_still_check_in_on_a_suspended_event(self):
        event, kind = self.inventory()
        order = self.buy(event, kind)
        self.suspend_event(event)
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            "/api/tickets/check-in", {"qr_token": order["tickets"][0]["qr_token"]}
        )
        self.assertEqual(response.status_code, 200, response.content)


class UserSuspensionTests(AdminHelpers, TestCase):
    def login(self, email):
        return APIClient().post(
            "/api/auth/login", {"email": email, "password": "secret"}, format="json"
        )

    def test_suspended_user_loses_access_and_sessions(self):
        tokens = self.login("buyer@example.com").json()
        response = self.admin_client.post(
            f"/api/admin/users/{self.buyer.pk}/suspend", {"suspended": True}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.json()["is_active"])

        self.assertEqual(self.login("buyer@example.com").status_code, 401)
        session = APIClient()
        session.credentials(HTTP_AUTHORIZATION="Bearer " + tokens["access"])
        self.assertEqual(session.get("/api/auth/me").status_code, 401)
        self.assertEqual(
            APIClient()
            .post("/api/auth/refresh", {"refresh": tokens["refresh"]}, format="json")
            .status_code,
            401,
        )

        self.admin_client.post(
            f"/api/admin/users/{self.buyer.pk}/suspend", {"suspended": False}, format="json"
        )
        self.assertEqual(self.login("buyer@example.com").status_code, 200)

    def test_suspended_organizer_events_disappear(self):
        self.inventory()
        self.admin_client.post(
            f"/api/admin/users/{self.owner.pk}/suspend", {"suspended": True}, format="json"
        )
        self.assertEqual(APIClient().get("/api/events").json()["count"], 0)

    def test_admins_cannot_be_suspended_and_others_cannot_suspend(self):
        self.assertEqual(
            self.admin_client.post(
                f"/api/admin/users/{self.admin.pk}/suspend", {"suspended": True}, format="json"
            ).status_code,
            403,
        )
        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.post(
                f"/api/admin/users/{self.buyer.pk}/suspend", {"suspended": True}, format="json"
            ).status_code,
            403,
        )
        self.assertEqual(self.client.get("/api/admin/users").status_code, 403)

    def test_admin_can_search_users(self):
        data = self.admin_client.get("/api/admin/users", {"search": "BUYER"}).json()
        self.assertEqual([u["email"] for u in data["results"]], ["buyer@example.com"])
        self.assertEqual(data["results"][0]["roles"], ["attendee"])


class ScannerQueryBudgetTests(Phase3Helpers, TestCase):
    """Guards the SRS ~2 s check-in target against N+1 regressions on the scanner path."""

    def scan(self, client, path, token):
        with CaptureQueriesContext(connection) as queries:
            response = client.post(path, {"qr_token": token}, format="json")
        return response, len(queries)

    def test_verify_and_check_in_use_a_fixed_number_of_queries(self):
        event, kind = self.inventory()
        tickets = self.buy(event, kind, quantity=3)["tickets"]
        staff = User.objects.create_user("door@example.com", "secret")
        StaffAssignment.objects.create(event_id=event, user=staff)
        door = APIClient()
        door.force_authenticate(staff)

        response, verify = self.scan(door, "/api/tickets/verify", tickets[0]["qr_token"])
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(verify, 3)
        response, check_in = self.scan(door, "/api/tickets/check-in", tickets[0]["qr_token"])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "checked_in")
        self.assertLessEqual(check_in, 6)
        response, _ = self.scan(door, "/api/tickets/check-in", tickets[0]["qr_token"])
        self.assertEqual(response.status_code, 409)

        ticket = Ticket.objects.get(identifier=tickets[0]["identifier"])
        self.assertEqual(ticket.checked_in_by, staff)
        self.assertEqual(
            AuditLog.objects.filter(action="ticket.checked_in", entity_id=ticket.pk).count(), 1
        )
        self.assertEqual(Order.objects.get().status, "confirmed")
