from django.core import mail
from django.test import TestCase

from accounts.models import OrganizerProfile, User
from ticketing.models import AuditLog, StaffAssignment, SupportCase

from .test_phase3 import Phase3Helpers


class SupportHelpers(Phase3Helpers):
    def setUp(self):
        super().setUp()
        self.event, kind = self.inventory()
        self.order = self.buy(self.event, kind)
        self.ticket = self.order["tickets"][0]["id"]

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client

    def open_case(self, user=None, **context):
        payload = {"category": "ticket_delivery", "subject": "No QR", "message": "Help"}
        payload.update(context)
        with self.captureOnCommitCallbacks(execute=True):
            return self.as_user(user or self.buyer).post(
                "/api/support-cases", payload, format="json"
            )

    def staff(self, email, **flags):
        user = User.objects.create_user(email, "secret")
        StaffAssignment.objects.create(event_id=self.event, user=user, **flags)
        return user


class OpenSupportCaseTests(SupportHelpers, TestCase):
    def test_ticket_context_fills_order_and_event(self):
        mail.outbox.clear()
        response = self.open_case(ticket=self.ticket)
        self.assertEqual(response.status_code, 201, response.content)
        case = response.json()
        self.assertEqual(case["kind"], "attendee")
        self.assertEqual(case["status"], "open")
        self.assertEqual(
            (case["event"], case["order"], case["ticket"]),
            (self.event, self.order["id"], self.ticket),
        )
        self.assertEqual([m["body"] for m in case["messages"]], ["Help"])
        self.assertTrue(AuditLog.objects.filter(action="support.opened").exists())
        self.assertEqual(mail.outbox[-1].to, ["owner@example.com"])

    def test_other_users_ticket_or_order_is_not_found(self):
        stranger = User.objects.create_user("stranger@example.com", "secret")
        self.assertEqual(self.open_case(stranger, ticket=self.ticket).status_code, 404)
        self.assertEqual(self.open_case(stranger, order=self.order["id"]).status_code, 404)

    def test_mismatched_context_is_rejected(self):
        self.as_user(self.owner)
        other_event, _ = self.inventory()
        response = self.open_case(order=self.order["id"], event=other_event)
        self.assertEqual(response.status_code, 400)

    def test_attendee_needs_context_and_organizer_gets_platform_case(self):
        self.assertEqual(self.open_case().status_code, 400)
        self.assertEqual(self.open_case(self.owner, category="seating").status_code, 400)
        response = self.open_case(self.owner, category="activation")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["kind"], "platform")
        self.assertIsNone(response.json()["event"])

    def test_unknown_fields_are_rejected(self):
        self.assertEqual(self.open_case(event=self.event, status="resolved").status_code, 400)


class SupportAccessTests(SupportHelpers, TestCase):
    def setUp(self):
        super().setUp()
        self.case = self.open_case(event=self.event).json()["id"]
        self.url = f"/api/support-cases/{self.case}"

    def test_case_visibility_follows_event_relationship(self):
        stranger = User.objects.create_user("stranger@example.com", "secret")
        scanner = self.staff("scanner@example.com")
        helper = self.staff("helper@example.com", can_manage_support=True)
        self.assertEqual(self.as_user(stranger).get(self.url).status_code, 404)
        self.assertEqual(self.as_user(scanner).get(self.url).status_code, 404)
        self.assertEqual(self.as_user(helper).get(self.url).status_code, 200)
        self.assertEqual(self.as_user(self.owner).get(self.url).status_code, 200)
        self.assertEqual(self.as_user(self.buyer).get(self.url).status_code, 200)

    def test_platform_cases_are_hidden_from_other_organizers(self):
        platform = self.open_case(self.owner, category="technical").json()["id"]
        rival = User.objects.create_user("rival@example.com", "secret")
        OrganizerProfile.objects.create(user=rival, display_name="R", contact_email=rival.email)
        admin = User.objects.create_superuser("admin@example.com", "secret")
        self.assertEqual(self.as_user(rival).get(f"/api/support-cases/{platform}").status_code, 404)
        self.assertEqual(self.as_user(admin).get(f"/api/support-cases/{platform}").status_code, 200)

    def test_inbox_lists_and_filters_cases(self):
        response = self.as_user(self.owner).get("/api/support-cases?status=open")
        self.assertEqual([c["id"] for c in response.json()["results"]], [self.case])
        response = self.as_user(self.owner).get("/api/support-cases?assigned=me")
        self.assertEqual(response.json()["results"], [])
        response = self.as_user(self.owner).get("/api/support-cases?event=abc")
        self.assertEqual(response.status_code, 400)


class SupportConversationTests(SupportHelpers, TestCase):
    def setUp(self):
        super().setUp()
        self.case = self.open_case(ticket=self.ticket).json()["id"]
        self.url = f"/api/support-cases/{self.case}"

    def reply(self, user, body):
        with self.captureOnCommitCallbacks(execute=True):
            return self.as_user(user).post(f"{self.url}/messages", {"body": body}, format="json")

    def patch(self, user, payload):
        with self.captureOnCommitCallbacks(execute=True):
            return self.as_user(user).patch(self.url, payload, format="json")

    def test_staff_reply_notifies_requester_and_polling_returns_new_messages(self):
        first = self.as_user(self.buyer).get(f"{self.url}/messages").json()[-1]["id"]
        mail.outbox.clear()
        self.assertEqual(self.reply(self.owner, "Resent it").status_code, 201)
        self.assertEqual(mail.outbox[-1].to, ["buyer@example.com"])
        newer = self.as_user(self.buyer).get(f"{self.url}/messages?after={first}").json()
        self.assertEqual([m["body"] for m in newer], ["Resent it"])

    def test_requester_reply_moves_waiting_case_back_in_progress(self):
        self.assertEqual(
            self.patch(self.owner, {"status": "waiting_for_customer"}).status_code, 200
        )
        self.reply(self.buyer, "Still nothing")
        self.assertEqual(SupportCase.objects.get(pk=self.case).status, "in_progress")
        actions = AuditLog.objects.filter(action="support.status_changed")
        self.assertEqual(
            list(actions.values_list("description", flat=True)),
            ["waiting_for_customer -> in_progress", "open -> waiting_for_customer"],
        )

    def test_only_support_side_can_assign_and_change_status(self):
        self.assertEqual(self.patch(self.buyer, {"status": "resolved"}).status_code, 403)
        scanner = self.staff("scanner@example.com")
        helper = self.staff("helper@example.com", can_manage_support=True)
        self.assertEqual(self.patch(self.owner, {"assigned_to": scanner.pk}).status_code, 400)
        mail.outbox.clear()
        response = self.patch(self.owner, {"assigned_to": helper.pk, "status": "in_progress"})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["assigned_to_email"], "helper@example.com")
        self.assertEqual(
            sorted(m.to[0] for m in mail.outbox), ["buyer@example.com", "helper@example.com"]
        )
        self.assertEqual(self.patch(helper, {"assigned_to": None}).status_code, 200)
        self.assertEqual(self.patch(self.owner, {}).status_code, 400)

    def test_resolved_case_rejects_new_messages(self):
        self.patch(self.owner, {"status": "resolved"})
        self.assertEqual(self.reply(self.buyer, "One more thing").status_code, 409)
