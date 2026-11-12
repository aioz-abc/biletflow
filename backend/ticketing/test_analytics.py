"""Acceptance cases 1-10 of docs/ANALYTICS_REQUIREMENTS.md for /events/{id}/analytics."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import OrganizerProfile, User
from ticketing.models import Order, Refund, StaffAssignment
from ticketing.testing import activate_paid_sales

ALMATY = ZoneInfo("Asia/Almaty")


def almaty(year, month, day, hour=12, minute=0, second=0):
    return datetime(year, month, day, hour, minute, second, tzinfo=ALMATY)


@override_settings(PROCESSING_FEE_BPS=300)
class AnalyticsTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", "secret")
        OrganizerProfile.objects.create(
            user=self.owner, display_name="Host", contact_email=self.owner.email
        )
        self.buyer = User.objects.create_user("buyer@example.com", "secret")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        start = timezone.now() + timedelta(days=30)
        self.event = self.client.post(
            "/api/events",
            {
                "title": "Concert",
                "venue": "Almaty",
                "starts_at": start.isoformat(),
                "ends_at": (start + timedelta(hours=2)).isoformat(),
                "capacity": 20,
            },
            format="json",
        ).json()["id"]
        self.vip = self.kind("VIP", 30000, 5)
        self.general = self.kind("General", 10000, 10)
        self.free = self.kind("Free", 0, 5)
        self.client.post(f"/api/events/{self.event}/publish", {"published": True}, format="json")
        activate_paid_sales(self.event)

    def kind(self, name, price, quantity):
        return self.client.post(
            f"/api/events/{self.event}/ticket-types",
            {"name": name, "price_minor": price, "quantity": quantity},
            format="json",
        ).json()["id"]

    def buy(self, items, code=None, outcome="success", at=None):
        client = APIClient()
        client.force_authenticate(self.buyer)
        order = client.post(
            "/api/orders",
            {
                "event": self.event,
                "items": [{"ticket_type": k, "quantity": q} for k, q in items.items()],
            },
            format="json",
        ).json()
        payload = {"outcome": outcome} | ({"promo_code": code} if code else {})
        response = client.post(f"/api/orders/{order['id']}/checkout", payload, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        if at is not None:
            Order.objects.filter(pk=order["id"]).update(confirmed_at=at)
        return order["id"]

    def refund(self, order, at=None):
        response = self.client.post(f"/api/orders/{order}/refund")
        self.assertEqual(response.status_code, 200, response.content)
        if at is not None:
            Refund.objects.filter(payment__order_id=order).update(created_at=at)

    def analytics(self, client=None, **params):
        response = (client or self.client).get(f"/api/events/{self.event}/analytics", params)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def assert_reconciles(self, data):
        for key, total in data["totals"].items():
            self.assertEqual(sum(day[key] for day in data["daily"]), total, key)

    def test_case_1_empty_event_gives_zeros_and_a_complete_series(self):
        data = self.analytics(**{"from": "2026-11-01", "to": "2026-11-08"})
        self.assertEqual(len(data["daily"]), 7)
        self.assertEqual(data["daily"][0]["date"], "2026-11-01")
        self.assertEqual(data["daily"][-1]["date"], "2026-11-07")
        self.assertTrue(all(v == 0 for v in data["totals"].values()))
        self.assertTrue(all(day["collected_minor"] == 0 for day in data["daily"]))
        self.assertEqual(data["inventory"]["remaining"], 20)
        self.assertTrue(data["simulated"])
        self.assertEqual(self.analytics()["daily"], [])

    def test_case_2_free_tickets_change_counts_not_money(self):
        self.buy({self.free: 2})
        data = self.analytics()
        self.assertEqual(data["totals"]["issued_tickets"], 2)
        self.assertEqual(data["totals"]["collected_minor"], 0)
        self.assertEqual(data["totals"]["fees_minor"], 0)
        self.assertEqual(data["inventory"]["active_tickets"], 2)
        self.assertEqual(data["inventory"]["remaining"], 18)

    def test_case_3_mixed_order_with_promo_reconciles_to_the_order(self):
        self.client.force_authenticate(self.owner)
        code = self.client.post(
            f"/api/events/{self.event}/campaigns",
            {"name": "Launch", "discount_type": "fixed", "discount_value": 1000},
            format="json",
        ).json()["codes"][0]["code"]
        order = Order.objects.get(pk=self.buy({self.vip: 1, self.general: 2}, code=code))
        data = self.analytics()
        totals = data["totals"]
        self.assertEqual(totals["sales_before_discount_minor"], order.subtotal_minor)
        self.assertEqual(totals["discount_minor"], order.discount_minor)
        self.assertEqual(totals["collected_minor"], order.total_minor)
        self.assertEqual(totals["fees_minor"], order.payment.fee_minor)  # 3% of 49000
        rows = {row["id"]: row for row in data["ticket_types"]}
        self.assertEqual(rows[self.vip]["discount_minor"], 600)
        self.assertEqual(rows[self.general]["discount_minor"], 400)
        # The 1470 fee splits by collected amount: 29400 / 19600.
        fees = (rows[self.vip]["fees_minor"], rows[self.general]["fees_minor"])
        self.assertEqual(fees, (882, 588))
        for key in totals:
            self.assertEqual(sum(row[key] for row in data["ticket_types"]), totals[key], key)
        campaign = data["campaigns"][0]
        self.assertEqual(campaign["redemptions"], 1)
        self.assertEqual(campaign["active_tickets"], 3)
        self.assertEqual(campaign["collected_minor"], order.total_minor)
        self.assert_reconciles(data)

    def test_case_4_failed_checkout_and_expired_hold_add_no_sales(self):
        self.buy({self.vip: 1}, outcome="failure")
        Order.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
        data = self.analytics()
        self.assertEqual(data["totals"]["issued_tickets"], 0)
        self.assertEqual(data["totals"]["collected_minor"], 0)
        self.assertEqual(data["inventory"]["reserved_tickets"], 0)
        self.assertEqual(data["inventory"]["remaining"], 20)

    def test_case_5_refund_lands_on_its_own_day(self):
        order = self.buy({self.vip: 1}, at=almaty(2026, 11, 1))
        self.refund(order, at=almaty(2026, 11, 3))
        data = self.analytics(**{"from": "2026-11-01", "to": "2026-11-05"})
        days = {day["date"]: day for day in data["daily"]}
        self.assertEqual(days["2026-11-01"]["collected_minor"], 30000)
        self.assertEqual(days["2026-11-01"]["fees_minor"], 900)
        self.assertEqual(days["2026-11-03"]["refunded_minor"], 30000)
        self.assertEqual(days["2026-11-03"]["fees_minor"], -900)
        self.assertEqual(data["totals"]["net_receipts_minor"], 0)
        self.assertEqual(data["totals"]["issued_tickets"], 1)  # historical issue stays
        self.assertEqual(data["inventory"]["active_tickets"], 0)
        self.assertEqual(data["inventory"]["remaining"], 20)
        self.assert_reconciles(data)

        refund_only = self.analytics(**{"from": "2026-11-03", "to": "2026-11-04"})["totals"]
        self.assertEqual(refund_only["collected_minor"], 0)
        self.assertEqual(refund_only["net_receipts_minor"], -30000)

    def test_case_6_inventory_matches_checkout_accounting(self):
        # Concurrent double-selling is covered by test_concurrency; here the
        # snapshot uses the same reserved() helper, so it never goes negative.
        self.buy({self.vip: 2})
        client = APIClient()
        client.force_authenticate(self.buyer)
        client.post(
            "/api/orders",
            {"event": self.event, "items": [{"ticket_type": self.general, "quantity": 3}]},
            format="json",
        )
        inventory = self.analytics()["inventory"]
        self.assertEqual(inventory["active_tickets"], 2)
        self.assertEqual(inventory["reserved_tickets"], 3)
        self.assertEqual(inventory["remaining"], 15)

    def test_case_7_foreign_organizer_staff_and_attendee_get_nothing(self):
        rival = User.objects.create_user("rival@example.com", "secret")
        OrganizerProfile.objects.create(user=rival, display_name="R", contact_email=rival.email)
        staff = User.objects.create_user("door@example.com", "secret")
        StaffAssignment.objects.create(event_id=self.event, user=staff)
        for user in (rival, staff, self.buyer):
            client = APIClient()
            client.force_authenticate(user)
            self.assertEqual(
                client.get(f"/api/events/{self.event}/analytics").status_code, 404, user.email
            )
        self.assertEqual(APIClient().get(f"/api/events/{self.event}/analytics").status_code, 401)
        admin = APIClient()
        admin.force_authenticate(User.objects.create_superuser("root@example.com", "secret"))
        self.analytics(client=admin)

    def test_case_8_midnight_in_almaty_assigns_each_sale_once(self):
        self.buy({self.general: 1}, at=almaty(2026, 11, 1, 23, 59, 59))
        self.buy({self.general: 2}, at=almaty(2026, 11, 2, 0, 0, 0))
        first = self.analytics(**{"from": "2026-11-01", "to": "2026-11-02"})
        second = self.analytics(**{"from": "2026-11-02", "to": "2026-11-03"})
        self.assertEqual(first["totals"]["issued_tickets"], 1)
        self.assertEqual(second["totals"]["issued_tickets"], 2)
        both = self.analytics(**{"from": "2026-11-01", "to": "2026-11-03"})
        self.assertEqual([d["issued_tickets"] for d in both["daily"]], [1, 2])

    def test_case_9_all_time_figures_reconcile_with_the_sales_summary(self):
        self.client.force_authenticate(self.owner)
        code = self.client.post(
            f"/api/events/{self.event}/campaigns",
            {"name": "Ten", "discount_type": "percent", "discount_value": 10},
            format="json",
        ).json()["codes"][0]["code"]
        self.buy({self.vip: 1, self.general: 1}, code=code)
        self.refund(self.buy({self.general: 3}))
        self.buy({self.free: 1})
        data = self.analytics()["totals"]
        sales = self.client.get(f"/api/events/{self.event}/sales").json()
        self.assertEqual(data["collected_minor"], sales["gross_minor"])
        self.assertEqual(data["discount_minor"], sales["discounts_minor"])
        self.assertEqual(data["refunded_minor"], sales["refunds_minor"])
        self.assertEqual(data["fees_minor"], sales["fees_minor"])
        self.assertEqual(
            data["net_receipts_minor"] - data["fees_minor"], sales["estimated_payout_minor"]
        )

    def test_case_10_type_filter_keeps_event_capacity_separate(self):
        self.buy({self.vip: 2, self.general: 1})
        data = self.analytics(ticket_type=self.vip)
        self.assertEqual(data["filters"]["ticket_type"], self.vip)
        self.assertEqual(data["inventory"]["capacity"], 20)
        self.assertEqual(data["inventory"]["remaining"], 17)
        kind = data["inventory"]["ticket_type"]
        self.assertEqual((kind["quantity"], kind["type_remaining"]), (5, 3))
        self.assertEqual(data["totals"]["issued_tickets"], 2)
        self.assertEqual(data["totals"]["collected_minor"], 60000)
        self.assertEqual([row["id"] for row in data["ticket_types"]], [self.vip])
        self.assertIsNone(self.analytics()["inventory"]["ticket_type"])

    def test_invalid_filters_are_rejected(self):
        other = self.client.post(
            "/api/events",
            {
                "title": "Other",
                "venue": "Hall",
                "starts_at": (timezone.now() + timedelta(days=3)).isoformat(),
                "ends_at": (timezone.now() + timedelta(days=4)).isoformat(),
                "capacity": 5,
            },
            format="json",
        ).json()["id"]
        foreign = self.client.post(
            f"/api/events/{other}/ticket-types",
            {"name": "X", "price_minor": 0, "quantity": 1},
            format="json",
        ).json()["id"]
        for params in (
            {"from": "2026-11-01"},
            {"from": "2026-11-05", "to": "2026-11-01"},
            {"from": "2026-11-01", "to": "2026-11-01"},
            {"from": "2025-01-01", "to": "2026-11-01"},
            {"from": "01.11.2026", "to": "2026-11-02"},
            {"ticket_type": foreign},
            {"ticket_type": "abc"},
        ):
            response = self.client.get(f"/api/events/{self.event}/analytics", params)
            self.assertEqual(response.status_code, 400, params)
