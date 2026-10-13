from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import OrganizerProfile, User


class TicketingAPITests(TestCase):
    def test_event_admin_assignment_allows_scanning_only_for_its_event(self):
        event, kind = self.inventory()
        other_event, other_kind = self.inventory()
        staff = User.objects.create_user("scanner@example.com", "secret")
        self.client.force_authenticate(self.buyer)
        self.assertEqual(
            self.client.post(f"/api/events/{event}/staff", {"email": staff.email}).status_code,
            404,
        )
        order = self.reserve(event, kind).json()
        ticket = self.client.post(
            f"/api/orders/{order['id']}/checkout", {"outcome": "success"}
        ).json()["tickets"][0]
        second_order = self.reserve(other_event, other_kind).json()
        second_ticket = self.client.post(
            f"/api/orders/{second_order['id']}/checkout", {"outcome": "success"}
        ).json()["tickets"][0]
        self.client.force_authenticate(self.owner)
        created = self.client.post(f"/api/events/{event}/staff", {"email": staff.email})
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(self.client.get(f"/api/events/{event}/staff").json()["count"], 1)
        from ticketing.permissions import scan_events

        self.assertIn(event, list(scan_events(staff).values_list("pk", flat=True)), created.json())
        self.client.force_authenticate(staff)
        self.assertIn("event_admin", self.client.get("/api/auth/me").json()["roles"])
        verified = self.client.post("/api/tickets/verify", {"qr_token": ticket["qr_token"]})
        self.assertEqual(verified.status_code, 200, verified.content)
        self.assertEqual(
            self.client.post("/api/tickets/check-in", {"qr_token": ticket["qr_token"]}).status_code,
            200,
        )
        self.assertEqual(self.client.get(f"/api/events/{event}/attendees").status_code, 200)
        self.assertEqual(
            self.client.post(
                "/api/tickets/verify", {"qr_token": second_ticket["qr_token"]}
            ).status_code,
            404,
        )
        self.assertEqual(self.client.get(f"/api/events/{other_event}/attendees").status_code, 404)
        self.assertEqual(
            self.client.patch(f"/api/events/{event}", {"title": "No"}).status_code, 404
        )
        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.delete(f"/api/events/{event}/staff/{staff.pk}").status_code, 204
        )
        self.client.force_authenticate(staff)
        self.assertNotIn("event_admin", self.client.get("/api/auth/me").json()["roles"])
        self.assertEqual(self.client.get(f"/api/events/{event}/attendees").status_code, 404)

    def test_malformed_event_payload_and_attendee_cannot_create_event(self):
        self.assertEqual(self.client.post("/api/events", [{}], format="json").status_code, 400)
        self.client.force_authenticate(self.buyer)
        data = {
            "title": "Unauthorized",
            "venue": "Hall",
            "capacity": 10,
            "starts_at": (timezone.now() + timedelta(days=1)).isoformat(),
            "ends_at": (timezone.now() + timedelta(days=2)).isoformat(),
        }
        self.assertEqual(self.client.post("/api/events", data, format="json").status_code, 403)

    def test_hidden_types_sales_windows_and_event_capacity_across_types(self):
        from ticketing.models import TicketType

        event, kind = self.inventory()
        second = self.client.post(
            f"/api/events/{event}/ticket-types",
            {"name": "Extra", "price_minor": 100, "quantity": 2, "hidden": True},
            format="json",
        ).json()["id"]
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get(f"/api/events/{event}/ticket-types").json()["count"], 1)
        self.assertEqual(self.reserve(event, second).status_code, 404)
        TicketType.objects.filter(pk=second).update(
            hidden=False, sales_start=timezone.now() + timedelta(days=1)
        )
        self.assertEqual(self.reserve(event, second).status_code, 409)
        TicketType.objects.filter(pk=second).update(sales_start=None)
        self.assertEqual(self.reserve(event, kind, 2).status_code, 201)
        self.assertEqual(self.reserve(event, second).status_code, 409)

    def test_checkout_rejects_event_that_has_started_since_reservation(self):
        from ticketing.models import Event

        event, kind = self.inventory()
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind).json()
        Event.objects.filter(pk=event).update(starts_at=timezone.now() - timedelta(seconds=1))
        response = self.client.post(f"/api/orders/{order['id']}/checkout", {"outcome": "success"})
        self.assertEqual(response.status_code, 409)

    def test_scan_resolves_ticket_without_numeric_id(self):
        event, kind = self.inventory()
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind).json()
        ticket = self.client.post(
            f"/api/orders/{order['id']}/checkout", {"outcome": "success"}
        ).json()["tickets"][0]
        self.client.force_authenticate(self.owner)
        payload = {"qr_token": ticket["qr_token"]}
        result = self.client.post("/api/tickets/verify", payload)
        self.assertEqual(result.status_code, 200, result.content)
        self.assertEqual(result.json()["ticket"]["id"], ticket["id"])
        self.assertEqual(self.client.post("/api/tickets/check-in", payload).status_code, 200)

    def test_capacity_edits_cancel_and_price_snapshot(self):
        event, kind = self.inventory()
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind, 2).json()
        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.patch(f"/api/events/{event}", {"capacity": 1}).status_code, 409
        )
        self.assertEqual(
            self.client.patch(f"/api/ticket-types/{kind}", {"quantity": 1}).status_code, 409
        )
        self.assertEqual(
            self.client.patch(f"/api/ticket-types/{kind}", {"price_minor": 999}).status_code, 200
        )
        self.assertEqual(self.client.delete(f"/api/events/{event}").status_code, 409)
        self.client.force_authenticate(self.buyer)
        paid = self.client.post(
            f"/api/orders/{order['id']}/checkout", {"outcome": "success"}
        ).json()
        self.assertEqual(paid["total_minor"], 20000)
        self.assertEqual(self.client.post(f"/api/orders/{order['id']}/cancel").status_code, 409)

    def test_cancel_pending_order_releases_inventory(self):
        event, kind = self.inventory()
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind, 2).json()
        self.assertEqual(self.client.post(f"/api/orders/{order['id']}/cancel").status_code, 200)
        self.assertEqual(self.reserve(event, kind, 2).status_code, 201)
        self.assertEqual(
            self.client.post(
                f"/api/orders/{order['id']}/checkout", {"outcome": "success"}
            ).status_code,
            409,
        )

    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", "secret")
        OrganizerProfile.objects.create(
            user=self.owner, display_name="Host", contact_email=self.owner.email
        )
        self.buyer = User.objects.create_user("buyer@example.com", "secret")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def event(self, capacity=2):
        response = self.client.post(
            "/api/events",
            {
                "title": "Concert",
                "description": "Live music",
                "venue": "Almaty",
                "starts_at": (timezone.now() + timedelta(days=2)).isoformat(),
                "ends_at": (timezone.now() + timedelta(days=2, hours=2)).isoformat(),
                "capacity": capacity,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["id"]

    def inventory(self, price=10000):
        event = self.event()
        response = self.client.post(
            f"/api/events/{event}/ticket-types",
            {
                "name": "Standard",
                "price_minor": price,
                "quantity": 2,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(
            self.client.post(
                f"/api/events/{event}/publish", {"published": True}, format="json"
            ).status_code,
            200,
        )
        return event, response.json()["id"]

    def reserve(self, event, kind, quantity=1):
        return self.client.post(
            "/api/orders",
            {"event": event, "items": [{"ticket_type": kind, "quantity": quantity}]},
            format="json",
        )

    def test_purchase_qr_and_single_check_in(self):
        event, kind = self.inventory()
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind, 2)
        self.assertEqual(order.status_code, 201, order.content)
        self.assertEqual(order.json()["total_minor"], 20000)
        order_id = order.json()["id"]
        checkout = self.client.post(
            f"/api/orders/{order_id}/checkout", {"outcome": "success"}, format="json"
        )
        self.assertEqual(checkout.status_code, 200, checkout.content)
        tickets = checkout.json()["tickets"]
        self.assertEqual(len(tickets), 2)
        again = self.client.post(
            f"/api/orders/{order_id}/checkout", {"outcome": "success"}, format="json"
        )
        self.assertEqual([t["id"] for t in again.json()["tickets"]], [t["id"] for t in tickets])
        ticket = tickets[0]
        qr = self.client.get(f"/api/tickets/{ticket['id']}/qr")
        self.assertEqual(qr.status_code, 200)
        self.assertIn(b"<svg", qr.content)
        self.assertEqual(
            self.client.post(
                f"/api/tickets/{ticket['id']}/check-in", {"qr_token": ticket["qr_token"]}
            ).status_code,
            404,
        )
        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.post(
                f"/api/tickets/{ticket['id']}/verify", {"qr_token": "wrong"}
            ).status_code,
            400,
        )
        checked = self.client.post(
            f"/api/tickets/{ticket['id']}/check-in", {"qr_token": ticket["qr_token"]}
        )
        self.assertEqual(checked.status_code, 200, checked.content)
        self.assertEqual(
            self.client.post(
                f"/api/tickets/{ticket['id']}/check-in", {"qr_token": ticket["qr_token"]}
            ).status_code,
            409,
        )

    def test_inventory_expiry_failed_payment_and_scoped_access(self):
        from ticketing.models import Order

        event, kind = self.inventory()
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind, 2).json()
        self.assertEqual(self.reserve(event, kind).status_code, 409)
        failed = self.client.post(f"/api/orders/{order['id']}/checkout", {"outcome": "failure"})
        self.assertEqual(failed.status_code, 200)
        self.assertEqual(failed.json()["tickets"], [])
        Order.objects.filter(pk=order["id"]).update(
            expires_at=timezone.now() - timedelta(seconds=1)
        )
        self.assertEqual(
            self.client.post(
                f"/api/orders/{order['id']}/checkout", {"outcome": "success"}
            ).status_code,
            409,
        )
        self.assertEqual(self.reserve(event, kind, 2).status_code, 201)
        stranger = User.objects.create_user("stranger@example.com", "secret")
        self.client.force_authenticate(stranger)
        self.assertEqual(self.client.get(f"/api/orders/{order['id']}").status_code, 404)
        self.assertEqual(
            self.client.patch(f"/api/events/{event}", {"title": "Stolen"}).status_code, 404
        )
        self.assertEqual(self.client.get("/api/me/orders").json()["count"], 0)

    def test_public_visibility_and_invalid_payloads(self):
        event = self.event()
        self.assertEqual(
            self.client.patch(f"/api/events/{event}", {"capacity": 0}).status_code, 400
        )
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/events/{event}").status_code, 404)
        self.assertEqual(self.client.get("/api/events").json()["count"], 0)
        self.assertEqual(self.client.post("/api/events", {}).status_code, 401)

    def test_unlisted_and_private_events_are_hidden_from_the_public_list(self):
        event, kind = self.inventory()
        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.patch(f"/api/events/{event}", {"visibility": "unlisted"}).status_code, 200
        )
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/events").json()["count"], 0)
        self.assertEqual(self.client.get(f"/api/events/{event}").status_code, 200)
        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.patch(f"/api/events/{event}", {"visibility": "private"}).status_code, 200
        )
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/events/{event}").status_code, 404)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.reserve(event, kind).status_code, 404)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(f"/api/events/{event}").status_code, 200)

    def test_event_images_must_be_urls(self):
        event = self.event()
        self.assertEqual(
            self.client.patch(
                f"/api/events/{event}", {"images": ["not a URL"]}, format="json"
            ).status_code,
            400,
        )

    def test_private_event_blocks_checkout_of_existing_hold(self):
        event, kind = self.inventory()
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind).json()
        self.client.force_authenticate(self.owner)
        self.client.patch(f"/api/events/{event}", {"visibility": "private"})
        self.client.force_authenticate(self.buyer)
        self.assertEqual(
            self.client.post(
                f"/api/orders/{order['id']}/checkout", {"outcome": "success"}
            ).status_code,
            409,
        )

    def test_duplicate_copies_configuration_as_a_new_unpublished_draft(self):
        event, kind = self.inventory()
        self.client.force_authenticate(self.owner)
        response = self.client.post(f"/api/events/{event}/duplicate")
        self.assertEqual(response.status_code, 201, response.content)
        copy = response.json()
        self.assertNotEqual(copy["id"], event)
        self.assertFalse(copy["published"])
        self.assertEqual(copy["title"], "Copy of Concert")
        types = self.client.get(f"/api/events/{copy['id']}/ticket-types").json()["results"]
        self.assertEqual(len(types), 1)
        self.assertNotEqual(types[0]["id"], kind)
        self.assertEqual(types[0]["name"], "Standard")
        # Duplicating someone else's event is not allowed.
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.post(f"/api/events/{event}/duplicate").status_code, 404)

    def test_duplicate_accepts_maximum_length_title(self):
        event = self.event()
        self.client.patch(f"/api/events/{event}", {"title": "A" * 200})
        response = self.client.post(f"/api/events/{event}/duplicate")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertLessEqual(len(response.json()["title"]), 200)

    def test_free_checkout_and_client_price_rejection(self):
        event, kind = self.inventory(price=0)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(
            self.client.post(
                "/api/orders",
                {"event": event, "total_minor": 0, "items": [{"ticket_type": kind, "quantity": 1}]},
                format="json",
            ).status_code,
            400,
        )
        self.assertEqual(self.reserve(event, kind, 0).status_code, 400)
        order = self.reserve(event, kind).json()
        result = self.client.post(f"/api/orders/{order['id']}/checkout", {"outcome": "success"})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["total_minor"], 0)
        self.assertEqual(len(result.json()["tickets"]), 1)

    def campaign(self, event, **overrides):
        payload = {
            "name": "Launch",
            "discount_type": "percent",
            "discount_value": 10,
            **overrides,
        }
        response = self.client.post(f"/api/events/{event}/campaigns", payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_percent_promo_discounts_the_order_and_records_the_redemption(self):
        event, kind = self.inventory()
        promo = self.campaign(event)["codes"][0]["code"]
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind, 2).json()
        self.assertEqual(order["subtotal_minor"], 20000)
        paid = self.client.post(
            f"/api/orders/{order['id']}/checkout",
            {"outcome": "success", "promo_code": promo.lower()},
            format="json",
        ).json()
        self.assertEqual(paid["subtotal_minor"], 20000)
        self.assertEqual(paid["discount_minor"], 2000)
        self.assertEqual(paid["total_minor"], 18000)

    def test_disabled_expired_and_foreign_codes_fail_the_checkout(self):
        from ticketing.models import PromotionalCampaign

        event, kind = self.inventory()
        campaign = self.campaign(event)
        promo = campaign["codes"][0]["code"]
        other_event, other_kind = self.inventory()
        self.client.force_authenticate(self.buyer)

        # A code from a different event is rejected rather than silently ignored.
        foreign = self.reserve(other_event, other_kind).json()
        self.assertEqual(
            self.client.post(
                f"/api/orders/{foreign['id']}/checkout",
                {"outcome": "success", "promo_code": promo},
                format="json",
            ).status_code,
            400,
        )
        PromotionalCampaign.objects.filter(pk=campaign["id"]).update(
            ends_at=timezone.now() - timedelta(seconds=1)
        )
        order = self.reserve(event, kind).json()
        self.assertEqual(
            self.client.post(
                f"/api/orders/{order['id']}/checkout",
                {"outcome": "success", "promo_code": promo},
                format="json",
            ).status_code,
            400,
        )
        # An unknown code fails too, and the order is still pending afterwards.
        self.assertEqual(
            self.client.post(
                f"/api/orders/{order['id']}/checkout",
                {"outcome": "success", "promo_code": "NOPE"},
                format="json",
            ).status_code,
            400,
        )
        self.assertEqual(self.client.get(f"/api/orders/{order['id']}").json()["status"], "pending")

    def test_refund_invalidates_tickets_is_idempotent_and_is_audited(self):
        event, kind = self.inventory()
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind, 2).json()
        self.client.post(f"/api/orders/{order['id']}/checkout", {"outcome": "success"})
        # Attendees cannot refund their own order; SRS 4.9 gives this to organizers.
        self.assertEqual(self.client.post(f"/api/orders/{order['id']}/refund").status_code, 404)
        self.client.force_authenticate(self.owner)
        first = self.client.post(f"/api/orders/{order['id']}/refund")
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(first.json()["refund"]["amount_minor"], 20000)
        self.assertEqual(first.json()["order"]["status"], "refunded")
        tickets = self.client.get(f"/api/events/{event}/attendees").json()["results"]
        self.assertTrue(all(ticket["status"] == "refunded" for ticket in tickets))
        # Repeating the call returns the same refund instead of creating a second one.
        second = self.client.post(f"/api/orders/{order['id']}/refund")
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["refund"]["id"], first.json()["refund"]["id"])
        actions = [
            entry["action"]
            for entry in self.client.get(f"/api/events/{event}/audit-log").json()["results"]
        ]
        self.assertIn("order.refunded", actions)

    def test_refund_is_blocked_once_a_ticket_has_been_checked_in(self):
        event, kind = self.inventory()
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind).json()
        ticket = self.client.post(
            f"/api/orders/{order['id']}/checkout", {"outcome": "success"}
        ).json()["tickets"][0]
        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.post(
                f"/api/tickets/{ticket['id']}/check-in", {"qr_token": ticket["qr_token"]}
            ).status_code,
            200,
        )
        self.assertEqual(self.client.post(f"/api/orders/{order['id']}/refund").status_code, 409)

    def test_free_confirmed_order_can_be_cancelled_but_a_paid_one_cannot(self):
        event, kind = self.inventory(price=0)
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind).json()
        self.client.post(f"/api/orders/{order['id']}/checkout", {"outcome": "success"})
        self.assertEqual(self.client.post(f"/api/orders/{order['id']}/cancel").status_code, 200)
        self.assertEqual(
            self.client.get(f"/api/orders/{order['id']}").json()["tickets"][0]["status"],
            "cancelled",
        )

    def test_campaign_qr_link_resolves_but_is_never_admission(self):
        event, kind = self.inventory()
        created = self.campaign(event)
        token = created["campaign_link"].rsplit("/", 1)[1]
        self.client.force_authenticate(None)
        resolved = self.client.get(f"/api/campaign-links/{token}")
        self.assertEqual(resolved.status_code, 200, resolved.content)
        self.assertEqual(resolved.json()["event"], event)
        self.assertEqual(resolved.json()["promo_code"], created["codes"][0]["code"])
        # SRS 4.14: a Campaign QR must never be accepted as permission to enter.
        self.client.force_authenticate(self.owner)
        self.assertEqual(
            self.client.post("/api/tickets/check-in", {"qr_token": token}).status_code, 400
        )
        self.assertEqual(
            self.client.post("/api/tickets/verify", {"qr_token": token}).status_code, 400
        )

    def test_campaign_rejects_ticket_types_from_another_event(self):
        event, _kind = self.inventory()
        _other, other_kind = self.inventory()
        response = self.client.post(
            f"/api/events/{event}/campaigns",
            {
                "name": "Bad",
                "discount_type": "fixed",
                "discount_value": 500,
                "ticket_types": [other_kind],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)

    def test_campaign_qr_does_not_revoke_the_created_link(self):
        event, _kind = self.inventory()
        created = self.campaign(event)
        token = created["campaign_link"].rsplit("/", 1)[1]
        self.assertEqual(self.client.get(f"/api/campaigns/{created['id']}/qr").status_code, 200)
        self.assertEqual(self.client.get(f"/api/campaigns/{created['id']}/qr").status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/campaign-links/{token}").status_code, 200)

    def test_promo_preview_does_not_redeem_before_checkout(self):
        from ticketing.models import PromoRedemption

        event, kind = self.inventory()
        code = self.campaign(event)["codes"][0]["code"]
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind).json()
        response = self.client.post(
            f"/api/orders/{order['id']}/preview", {"promo_code": code}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["subtotal_minor"], 10000)
        self.assertEqual(response.json()["discount_minor"], 1000)
        self.assertEqual(response.json()["total_minor"], 9000)
        self.assertEqual(PromoRedemption.objects.count(), 0)
        paid = self.client.post(
            f"/api/orders/{order['id']}/checkout",
            {"outcome": "success", "promo_code": code},
        )
        self.assertEqual(paid.json()["total_minor"], 9000)

    def test_paid_checkout_is_recorded_in_event_audit_log(self):
        event, kind = self.inventory()
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind).json()
        self.client.post(f"/api/orders/{order['id']}/checkout", {"outcome": "failure"})
        self.client.post(f"/api/orders/{order['id']}/checkout", {"outcome": "success"})
        self.client.force_authenticate(self.owner)
        actions = [
            entry["action"]
            for entry in self.client.get(f"/api/events/{event}/audit-log").json()["results"]
        ]
        self.assertIn("payment.completed", actions)
        self.assertIn("payment.failed", actions)

    def test_checked_in_free_registration_cannot_be_cancelled(self):
        event, kind = self.inventory(price=0)
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind).json()
        ticket = self.client.post(
            f"/api/orders/{order['id']}/checkout", {"outcome": "success"}
        ).json()["tickets"][0]
        self.client.force_authenticate(self.owner)
        self.client.post(f"/api/tickets/{ticket['id']}/check-in", {"qr_token": ticket["qr_token"]})
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.post(f"/api/orders/{order['id']}/cancel").status_code, 409)

    def test_organizer_can_cancel_free_registration(self):
        event, kind = self.inventory(price=0)
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind).json()
        self.client.post(f"/api/orders/{order['id']}/checkout", {"outcome": "success"})
        self.client.force_authenticate(self.owner)
        response = self.client.post(f"/api/orders/{order['id']}/cancel")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["tickets"][0]["status"], "cancelled")

    def test_campaign_can_be_disabled_after_creation(self):
        event, kind = self.inventory()
        campaign = self.campaign(event)
        code = campaign["codes"][0]["code"]
        response = self.client.patch(
            f"/api/campaigns/{campaign['id']}", {"enabled": False}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        audit = self.client.get(f"/api/events/{event}/audit-log").json()["results"]
        self.assertIn("enabled: True -> False", audit[0]["description"])
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind).json()
        self.assertEqual(
            self.client.post(
                f"/api/orders/{order['id']}/checkout",
                {"outcome": "success", "promo_code": code},
            ).status_code,
            400,
        )

    def test_campaign_report_subtracts_refunds(self):
        event, kind = self.inventory()
        campaign = self.campaign(event)
        code = campaign["codes"][0]["code"]
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind).json()
        self.client.post(
            f"/api/orders/{order['id']}/checkout",
            {"outcome": "success", "promo_code": code},
        )
        self.client.force_authenticate(self.owner)
        self.client.post(f"/api/orders/{order['id']}/refund")
        report = self.client.get(f"/api/events/{event}/campaigns").json()["results"][0]["report"]
        self.assertEqual(report["refund_minor"], 9000)
        self.assertEqual(report["net_minor"], 0)
        self.assertEqual(report["tickets_sold"], 0)

    def test_event_with_campaign_cannot_be_deleted(self):
        event = self.event()
        self.campaign(event)
        self.assertEqual(self.client.delete(f"/api/events/{event}").status_code, 409)

    def test_campaign_link_opens_the_event_page(self):
        event, _kind = self.inventory()
        campaign = self.campaign(event)
        token = campaign["campaign_link"].rsplit("/", 1)[1]
        self.client.force_authenticate(None)
        response = self.client.get(f"/c/{token}")
        self.assertEqual(response.status_code, 302, response.content)
        self.assertIn(f"/events/{event}?promo_code=", response["Location"])

    def test_event_history_includes_sales_edits_redemption_and_check_in(self):
        event, kind = self.inventory()
        self.client.patch(f"/api/events/{event}", {"capacity": 3})
        self.client.patch(f"/api/ticket-types/{kind}", {"price_minor": 12000})
        self.client.post(f"/api/events/{event}/publish", {"published": False})
        self.client.post(f"/api/events/{event}/publish", {"published": True})
        code = self.campaign(event)["codes"][0]["code"]
        self.client.force_authenticate(self.buyer)
        order = self.reserve(event, kind).json()
        ticket = self.client.post(
            f"/api/orders/{order['id']}/checkout",
            {"outcome": "success", "promo_code": code},
        ).json()["tickets"][0]
        self.client.force_authenticate(self.owner)
        self.client.post(f"/api/tickets/{ticket['id']}/check-in", {"qr_token": ticket["qr_token"]})
        entries = self.client.get(f"/api/events/{event}/audit-log").json()["results"]
        actions = {entry["action"] for entry in entries}
        self.assertTrue(
            {
                "event.updated",
                "event.published",
                "ticket_type.updated",
                "promo.redeemed",
                "ticket.checked_in",
            }
            <= actions
        )
        self.assertTrue(
            any(
                entry["action"] == "event.updated" and "capacity: 2 -> 3" in entry["description"]
                for entry in entries
            )
        )
        self.assertTrue(
            any(
                entry["action"] == "ticket_type.updated"
                and "price_minor: 10000 -> 12000" in entry["description"]
                for entry in entries
            )
        )
