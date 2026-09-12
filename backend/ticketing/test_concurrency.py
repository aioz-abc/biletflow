from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

from django.db import close_old_connections
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import OrganizerProfile, User
from ticketing.models import Event, Order, Payment, Ticket, TicketType
from ticketing.serializers import qr_token
from ticketing.services import reserve


class ConcurrentSalesTests(TransactionTestCase):
    def test_refresh_token_is_consumed_only_once_under_concurrency(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        token = str(RefreshToken.for_user(self.user))
        self.assertEqual(self.race("/api/auth/refresh", {"refresh": token}), [200, 401])

    def setUp(self):
        self.user = User.objects.create_user("concurrent@example.com", "secret")
        profile = OrganizerProfile.objects.create(
            user=self.user, display_name="Host", contact_email=self.user.email
        )
        self.event = Event.objects.create(
            organizer=profile,
            title="Small event",
            venue="Hall",
            starts_at=timezone.now() + timedelta(days=1),
            ends_at=timezone.now() + timedelta(days=2),
            capacity=1,
            published=True,
        )
        self.kind = TicketType.objects.create(
            event=self.event, name="Standard", quantity=1, price_minor=100
        )

    def race(self, path, payload):
        barrier = Barrier(2)

        def request():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(User.objects.get(pk=self.user.pk))
                barrier.wait(timeout=10)
                return client.post(path, payload, format="json").status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            return sorted(executor.map(lambda _: request(), range(2)))

    def test_last_ticket_can_only_be_reserved_once(self):
        self.assertEqual(
            self.race(
                "/api/orders",
                {"event": self.event.pk, "items": [{"ticket_type": self.kind.pk, "quantity": 1}]},
            ),
            [201, 409],
        )
        self.assertEqual(Order.objects.count(), 1)

    def test_concurrent_checkout_and_check_in_are_atomic(self):
        order = reserve(self.user, self.event.pk, [{"ticket_type": self.kind.pk, "quantity": 1}])
        self.assertEqual(
            self.race(f"/api/orders/{order.pk}/checkout", {"outcome": "success"}), [200, 200]
        )
        self.assertEqual(Payment.objects.count(), 1)
        self.assertEqual(Ticket.objects.count(), 1)
        ticket = Ticket.objects.get()
        self.assertEqual(
            self.race(f"/api/tickets/{ticket.pk}/check-in", {"qr_token": qr_token(ticket)}),
            [200, 409],
        )
