from datetime import timedelta
from types import SimpleNamespace

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import SimpleTestCase, TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import OrganizerProfile, User
from ticketing.models import OrderItem, PromotionalCampaign
from ticketing.services import allocate_discount


def line(pk, kind, price, quantity=1):
    return SimpleNamespace(pk=pk, ticket_type_id=kind, unit_price_minor=price, quantity=quantity)


class AllocateDiscountTests(SimpleTestCase):
    def test_only_covered_lines_share_the_discount(self):
        items = [line(1, kind=10, price=30000), line(2, kind=20, price=10000, quantity=2)]
        self.assertEqual(allocate_discount(items, {10}, 3000), {1: 3000, 2: 0})

    def test_empty_kinds_means_every_line_in_proportion(self):
        items = [line(1, kind=10, price=10000), line(2, kind=20, price=30000)]
        self.assertEqual(allocate_discount(items, set(), 4000), {1: 1000, 2: 3000})

    def test_leftover_tiyn_go_to_largest_remainder_and_shares_add_up(self):
        # 1000 × 10000/30000 = 333.33 and 1000 × 20000/30000 = 666.67.
        items = [line(1, kind=10, price=10000), line(2, kind=20, price=20000)]
        self.assertEqual(allocate_discount(items, set(), 1000), {1: 333, 2: 667})

    def test_equal_remainders_go_to_the_lower_line_id(self):
        items = [line(7, kind=10, price=100), line(3, kind=20, price=100), line(5, 30, 100)]
        shares = allocate_discount(items, set(), 100)
        self.assertEqual(shares, {3: 34, 5: 33, 7: 33})

    def test_no_discount_or_no_covered_lines_gives_zero(self):
        items = [line(1, kind=10, price=10000)]
        self.assertEqual(allocate_discount(items, set(), 0), {1: 0})
        self.assertEqual(allocate_discount(items, {99}, 500), {1: 0})

    def test_shares_always_add_up_and_never_exceed_the_line(self):
        items = [line(1, 10, 997, 3), line(2, 20, 1, 1), line(3, 30, 4999, 7), line(4, 40, 13)]
        subtotal = sum(i.unit_price_minor * i.quantity for i in items)
        for discount in (1, 2, 3, 999, 12345, subtotal - 1, subtotal):
            shares = allocate_discount(items, set(), discount)
            self.assertEqual(sum(shares.values()), discount)
            for item in items:
                self.assertLessEqual(shares[item.pk], item.unit_price_minor * item.quantity)


class CheckoutStoresItemDiscountTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", "secret")
        OrganizerProfile.objects.create(
            user=self.owner, display_name="Host", contact_email=self.owner.email
        )
        self.buyer = User.objects.create_user("buyer@example.com", "secret")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        response = self.client.post(
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
        self.vip = self.ticket_type("VIP", 30000)
        self.general = self.ticket_type("General", 10000)
        self.client.post(f"/api/events/{self.event}/publish", {"published": True}, format="json")

    def ticket_type(self, name, price):
        response = self.client.post(
            f"/api/events/{self.event}/ticket-types",
            {"name": name, "price_minor": price, "quantity": 5},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["id"]

    def campaign(self, **overrides):
        self.client.force_authenticate(self.owner)
        payload = {"name": "Launch", "discount_type": "percent", "discount_value": 10}
        response = self.client.post(
            f"/api/events/{self.event}/campaigns", {**payload, **overrides}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def buy(self, code):
        self.client.force_authenticate(self.buyer)
        order = self.client.post(
            "/api/orders",
            {
                "event": self.event,
                "items": [
                    {"ticket_type": self.vip, "quantity": 1},
                    {"ticket_type": self.general, "quantity": 2},
                ],
            },
            format="json",
        ).json()
        response = self.client.post(
            f"/api/orders/{order['id']}/checkout",
            {"outcome": "success", "promo_code": code},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def item_discounts(self, order):
        return dict(
            OrderItem.objects.filter(order_id=order["id"]).values_list(
                "ticket_type_id", "discount_minor"
            )
        )

    def test_vip_only_code_discounts_only_the_vip_line(self):
        campaign = self.campaign(ticket_types=[self.vip])
        paid = self.buy(campaign["codes"][0]["code"])
        self.assertEqual(paid["discount_minor"], 3000)
        self.assertEqual(self.item_discounts(paid), {self.vip: 3000, self.general: 0})
        listed = {item["ticket_type"]: item["discount_minor"] for item in paid["items"]}
        self.assertEqual(listed, {self.vip: 3000, self.general: 0})

    def test_fixed_code_for_every_type_splits_by_subtotal_and_adds_up(self):
        # Lines are 30000 and 20000; 1000 splits 600 / 400.
        campaign = self.campaign(discount_type="fixed", discount_value=1000)
        paid = self.buy(campaign["codes"][0]["code"])
        self.assertEqual(self.item_discounts(paid), {self.vip: 600, self.general: 400})
        self.assertEqual(sum(self.item_discounts(paid).values()), paid["discount_minor"])

    def test_editing_the_campaign_later_does_not_move_a_stored_discount(self):
        campaign = self.campaign(ticket_types=[self.vip])
        paid = self.buy(campaign["codes"][0]["code"])
        PromotionalCampaign.objects.get(pk=campaign["id"]).ticket_types.set([self.general])
        self.assertEqual(self.item_discounts(paid), {self.vip: 3000, self.general: 0})

    def test_order_without_a_code_has_no_line_discount(self):
        self.client.force_authenticate(self.buyer)
        order = self.client.post(
            "/api/orders",
            {"event": self.event, "items": [{"ticket_type": self.vip, "quantity": 1}]},
            format="json",
        ).json()
        self.client.post(f"/api/orders/{order['id']}/checkout", {"outcome": "success"})
        self.assertEqual(self.item_discounts(order), {self.vip: 0})


class ItemDiscountBackfillTests(TransactionTestCase):
    before = ("ticketing", "0007_event_suspension")
    after = ("ticketing", "0008_orderitem_discount")

    def tearDown(self):
        MigrationExecutor(connection).migrate([self.after])
        super().tearDown()

    def test_existing_redemptions_are_split_across_their_campaign_types(self):
        executor = MigrationExecutor(connection)
        executor.migrate([self.before])
        apps = executor.loader.project_state([self.before]).apps
        model = lambda name: apps.get_model("ticketing", name)  # noqa: E731
        user = User.objects.create(email="host@example.com", password="unused")
        organizer = OrganizerProfile.objects.create(
            user=user, display_name="Host", contact_email=user.email
        )
        now = timezone.now()
        event = model("Event").objects.create(
            organizer_id=organizer.pk,
            title="Concert",
            venue="Hall",
            starts_at=now + timedelta(days=1),
            ends_at=now + timedelta(days=1, hours=2),
            capacity=10,
        )
        vip = model("TicketType").objects.create(
            event=event, name="VIP", price_minor=30000, quantity=5
        )
        general = model("TicketType").objects.create(
            event=event, name="General", price_minor=10000, quantity=5
        )

        def order(discount):
            created = model("Order").objects.create(
                purchaser_id=user.pk,
                event=event,
                status="confirmed",
                subtotal_minor=50000,
                discount_minor=discount,
                total_minor=50000 - discount,
                expires_at=now,
            )
            for kind, quantity in ((vip, 1), (general, 2)):
                model("OrderItem").objects.create(
                    order=created,
                    ticket_type=kind,
                    quantity=quantity,
                    unit_price_minor=kind.price_minor,
                )
            return created

        def redeem(created, kinds, discount, suffix):
            campaign = model("PromotionalCampaign").objects.create(
                event=event, name=suffix, discount_type="fixed", discount_value=discount
            )
            campaign.ticket_types.set(kinds)
            code = model("PromoCode").objects.create(
                campaign=campaign, code=suffix, link_token_digest=suffix * 8
            )
            model("PromoRedemption").objects.create(
                order=created, campaign=campaign, promo_code=code, discount_minor=discount
            )

        vip_only = order(3000)
        redeem(vip_only, [vip], 3000, "VIPO")
        everyone = order(1000)
        redeem(everyone, [], 1000, "ALL1")
        # The campaign's types were edited after use, and none of this order's lines
        # match any more: the discount is spread over every line, not dropped.
        drifted = order(500)
        other = model("TicketType").objects.create(
            event=event, name="Other", price_minor=1, quantity=1
        )
        redeem(drifted, [other], 500, "DRFT")
        no_code = order(0)

        executor = MigrationExecutor(connection)
        executor.migrate([self.after])
        migrated = executor.loader.project_state([self.after]).apps.get_model(
            "ticketing", "OrderItem"
        )

        def shares(created):
            return dict(
                migrated.objects.filter(order_id=created.pk).values_list(
                    "ticket_type_id", "discount_minor"
                )
            )

        self.assertEqual(shares(vip_only), {vip.pk: 3000, general.pk: 0})
        self.assertEqual(shares(everyone), {vip.pk: 600, general.pk: 400})
        self.assertEqual(shares(drifted), {vip.pk: 300, general.pk: 200})
        self.assertEqual(shares(no_code), {vip.pk: 0, general.pk: 0})
