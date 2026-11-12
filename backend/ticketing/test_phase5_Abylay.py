from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import OrganizerProfile, User
from ticketing.models import PromoRedemption, StaffAssignment
from ticketing.testing import activate_paid_sales


class Phase5BusinessLogicCoverageTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", "secret")
        OrganizerProfile.objects.create(
            user=self.owner, display_name="Host", contact_email=self.owner.email
        )
        self.buyer = User.objects.create_user("buyer1@example.com", "secret")
        self.second_buyer = User.objects.create_user("buyer2@example.com", "secret")
        self.staff = User.objects.create_user("doorstaff@example.com", "secret")

        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def create_event(self, capacity=2):
        response = self.client.post(
            "/api/events",
            {
                "title": "BiletFlow Summit",
                "description": "Integration test event",
                "venue": "Astana Arena",
                "starts_at": (timezone.now() + timedelta(days=3)).isoformat(),
                "ends_at": (timezone.now() + timedelta(days=3, hours=3)).isoformat(),
                "capacity": capacity,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["id"]

    def setup_inventory(self, capacity=2, quantity=2, price=10000):
        event_id = self.create_event(capacity=capacity)
        tt_response = self.client.post(
            f"/api/events/{event_id}/ticket-types",
            {
                "name": "General",
                "price_minor": price,
                "quantity": quantity,
            },
            format="json",
        )
        self.assertEqual(tt_response.status_code, 201, tt_response.content)
        self.assertEqual(
            self.client.post(
                f"/api/events/{event_id}/publish", {"published": True}, format="json"
            ).status_code,
            200,
        )
        if price > 0:
            activate_paid_sales(event_id)
        return event_id, tt_response.json()["id"]

    def reserve_for(self, user, event_id, items):
        client = APIClient()
        client.force_authenticate(user)
        return client.post(
            "/api/orders",
            {"event": event_id, "items": items},
            format="json",
        )

    def create_campaign(self, event_id, **overrides):
        payload = {
            "name": "LimitedPromo",
            "discount_type": "percent",
            "discount_value": 20,
            **overrides,
        }
        response = self.client.post(
            f"/api/events/{event_id}/campaigns", payload, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    # ------------------------------------------------------------------
    # 1. Seat & Ticket Double-Booking / Overselling Prevention
    # ------------------------------------------------------------------

    def test_competing_buyers_cannot_double_book_last_available_ticket(self):
        event_id, kind_id = self.setup_inventory(capacity=1, quantity=1)

        # First buyer reserves the sole remaining ticket
        first_res = self.reserve_for(
            self.buyer, event_id, [{"ticket_type": kind_id, "quantity": 1}]
        )
        self.assertEqual(first_res.status_code, 201)

        # Second buyer cannot reserve while first buyer's hold is active
        second_res = self.reserve_for(
            self.second_buyer, event_id, [{"ticket_type": kind_id, "quantity": 1}]
        )
        self.assertEqual(second_res.status_code, 409)

        # First buyer completes checkout; ticket remains permanently unavailable
        buyer_client = APIClient()
        buyer_client.force_authenticate(self.buyer)
        checkout = buyer_client.post(
            f"/api/orders/{first_res.json()['id']}/checkout",
            {"outcome": "success"},
            format="json",
        )
        self.assertEqual(checkout.status_code, 200)

        third_res = self.reserve_for(
            self.second_buyer, event_id, [{"ticket_type": kind_id, "quantity": 1}]
        )
        self.assertEqual(third_res.status_code, 409)

    def test_duplicate_line_items_and_cross_tier_reservations_cannot_exceed_limits(self):
        event_id, general_id = self.setup_inventory(capacity=3, quantity=2)
        vip_id = self.client.post(
            f"/api/events/{event_id}/ticket-types",
            {"name": "VIP", "price_minor": 25000, "quantity": 2},
            format="json",
        ).json()["id"]

        # Duplicate line items for the same ticket type in one payload -> 400
        duplicate_items = self.reserve_for(
            self.buyer,
            event_id,
            [
                {"ticket_type": general_id, "quantity": 1},
                {"ticket_type": general_id, "quantity": 1},
            ],
        )
        self.assertEqual(duplicate_items.status_code, 400)

        # Cross-tier reservation summing to 4 (> event capacity=3) -> 409
        oversell_event = self.reserve_for(
            self.buyer,
            event_id,
            [
                {"ticket_type": general_id, "quantity": 2},
                {"ticket_type": vip_id, "quantity": 2},
            ],
        )
        self.assertEqual(oversell_event.status_code, 409)

        # Reserving all 2 General tickets blocks a second buyer from reserving another -> 409
        full_tier = self.reserve_for(
            self.buyer,
            event_id,
            [{"ticket_type": general_id, "quantity": 2}],
        )
        self.assertEqual(full_tier.status_code, 201)

        exceed_tier = self.reserve_for(
            self.second_buyer,
            event_id,
            [{"ticket_type": general_id, "quantity": 1}],
        )
        self.assertEqual(exceed_tier.status_code, 409)

    # ------------------------------------------------------------------
    # 2. Promo-Code Redemption Limits
    # ------------------------------------------------------------------

    def test_promo_code_enforces_max_redemptions_across_buyers(self):
        event_id, kind_id = self.setup_inventory(capacity=5, quantity=5, price=10000)
        campaign = self.create_campaign(event_id, max_redemptions=1)
        code = campaign["codes"][0]["code"]

        order1 = self.reserve_for(
            self.buyer, event_id, [{"ticket_type": kind_id, "quantity": 1}]
        ).json()
        order2 = self.reserve_for(
            self.second_buyer, event_id, [{"ticket_type": kind_id, "quantity": 1}]
        ).json()

        buyer1 = APIClient()
        buyer1.force_authenticate(self.buyer)
        buyer2 = APIClient()
        buyer2.force_authenticate(self.second_buyer)

        # Both buyers preview before checkout; neither has redeemed yet
        self.assertEqual(
            buyer1.post(
                f"/api/orders/{order1['id']}/preview", {"promo_code": code}, format="json"
            ).status_code,
            200,
        )
        self.assertEqual(
            buyer2.post(
                f"/api/orders/{order2['id']}/preview", {"promo_code": code}, format="json"
            ).status_code,
            200,
        )

        # Buyer 1 completes checkout and consumes the single allowed redemption
        paid1 = buyer1.post(
            f"/api/orders/{order1['id']}/checkout",
            {"outcome": "success", "promo_code": code},
            format="json",
        )
        self.assertEqual(paid1.status_code, 200)
        self.assertEqual(paid1.json()["total_minor"], 8000)
        self.assertEqual(PromoRedemption.objects.count(), 1)

        # Buyer 2 is blocked at both preview and checkout once limit is reached
        self.assertEqual(
            buyer2.post(
                f"/api/orders/{order2['id']}/preview", {"promo_code": code}, format="json"
            ).status_code,
            409,
        )
        blocked_checkout = buyer2.post(
            f"/api/orders/{order2['id']}/checkout",
            {"outcome": "success", "promo_code": code},
            format="json",
        )
        self.assertEqual(blocked_checkout.status_code, 409)
        self.assertEqual(PromoRedemption.objects.count(), 1)

    def test_failed_payment_does_not_consume_promo_redemption_limit(self):
        event_id, kind_id = self.setup_inventory(capacity=4, quantity=4, price=10000)
        campaign = self.create_campaign(event_id, max_redemptions=1)
        code = campaign["codes"][0]["code"]

        order1 = self.reserve_for(
            self.buyer, event_id, [{"ticket_type": kind_id, "quantity": 1}]
        ).json()
        order2 = self.reserve_for(
            self.second_buyer, event_id, [{"ticket_type": kind_id, "quantity": 1}]
        ).json()

        buyer1 = APIClient()
        buyer1.force_authenticate(self.buyer)
        failed = buyer1.post(
            f"/api/orders/{order1['id']}/checkout",
            {"outcome": "failure", "promo_code": code},
            format="json",
        )
        self.assertEqual(failed.status_code, 200)
        self.assertEqual(PromoRedemption.objects.count(), 0)

        # Second buyer can still redeem the unused quota
        buyer2 = APIClient()
        buyer2.force_authenticate(self.second_buyer)
        succeeded = buyer2.post(
            f"/api/orders/{order2['id']}/checkout",
            {"outcome": "success", "promo_code": code},
            format="json",
        )
        self.assertEqual(succeeded.status_code, 200)
        self.assertEqual(succeeded.json()["total_minor"], 8000)
        self.assertEqual(PromoRedemption.objects.count(), 1)

    # ------------------------------------------------------------------
    # 3. QR Validation & Admission State Lifecycle
    # ------------------------------------------------------------------

    def test_qr_validation_rejects_tampered_mismatched_and_non_valid_tickets(self):
        event_id, kind_id = self.setup_inventory(capacity=5, quantity=5, price=10000)
        free_kind_id = self.client.post(
            f"/api/events/{event_id}/ticket-types",
            {"name": "Free", "price_minor": 0, "quantity": 2},
            format="json",
        ).json()["id"]

        StaffAssignment.objects.create(event_id=event_id, user=self.staff)
        door = APIClient()
        door.force_authenticate(self.staff)

        buyer_client = APIClient()
        buyer_client.force_authenticate(self.buyer)

        # Purchase two paid tickets in separate orders so one can be checked in and one refunded
        order_a = self.reserve_for(
            self.buyer, event_id, [{"ticket_type": kind_id, "quantity": 1}]
        ).json()
        ticket_a = buyer_client.post(
            f"/api/orders/{order_a['id']}/checkout", {"outcome": "success"}, format="json"
        ).json()["tickets"][0]

        order_b = self.reserve_for(
            self.buyer, event_id, [{"ticket_type": kind_id, "quantity": 1}]
        ).json()
        ticket_b = buyer_client.post(
            f"/api/orders/{order_b['id']}/checkout", {"outcome": "success"}, format="json"
        ).json()["tickets"][0]

        # 1. Tampered QR signature -> 400
        self.assertEqual(
            door.post("/api/tickets/verify", {"qr_token": "tampered.qr.token"}).status_code,
            400,
        )

        # 2. Valid token passed against a different ticket ID -> 400
        self.assertEqual(
            door.post(
                f"/api/tickets/{ticket_a['id']}/verify",
                {"qr_token": ticket_b["qr_token"]},
            ).status_code,
            400,
        )

        # 3. Valid ticket verifies true, checks in once, then reports valid=False & 409 on re-entry
        valid_res = door.post("/api/tickets/verify", {"qr_token": ticket_a["qr_token"]})
        self.assertEqual(valid_res.status_code, 200)
        self.assertTrue(valid_res.json()["valid"])

        self.assertEqual(
            door.post("/api/tickets/check-in", {"qr_token": ticket_a["qr_token"]}).status_code,
            200,
        )
        reverify = door.post("/api/tickets/verify", {"qr_token": ticket_a["qr_token"]}).json()
        self.assertFalse(reverify["valid"])
        self.assertEqual(reverify["ticket"]["status"], "checked_in")
        self.assertEqual(
            door.post("/api/tickets/check-in", {"qr_token": ticket_a["qr_token"]}).status_code,
            409,
        )

        # 4. Refunding order with a checked-in ticket is blocked (409); refunding order_b succeeds
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(f"/api/orders/{order_a['id']}/refund").status_code, 409)
        self.assertEqual(self.client.post(f"/api/orders/{order_b['id']}/refund").status_code, 200)

        refunded_verify = door.post(
            "/api/tickets/verify", {"qr_token": ticket_b["qr_token"]}
        ).json()
        self.assertFalse(refunded_verify["valid"])
        self.assertEqual(refunded_verify["ticket"]["status"], "refunded")
        self.assertEqual(
            door.post("/api/tickets/check-in", {"qr_token": ticket_b["qr_token"]}).status_code,
            409,
        )

        # 5. Cancelled free registration invalidates QR for check-in
        free_order = self.reserve_for(
            self.buyer, event_id, [{"ticket_type": free_kind_id, "quantity": 1}]
        ).json()
        free_ticket = buyer_client.post(
            f"/api/orders/{free_order['id']}/checkout", {"outcome": "success"}, format="json"
        ).json()["tickets"][0]
        self.assertEqual(
            buyer_client.post(f"/api/orders/{free_order['id']}/cancel").status_code, 200
        )
        cancelled_verify = door.post(
            "/api/tickets/verify", {"qr_token": free_ticket["qr_token"]}
        ).json()
        self.assertFalse(cancelled_verify["valid"])
        self.assertEqual(cancelled_verify["ticket"]["status"], "cancelled")
        self.assertEqual(
            door.post("/api/tickets/check-in", {"qr_token": free_ticket["qr_token"]}).status_code,
            409,
        )