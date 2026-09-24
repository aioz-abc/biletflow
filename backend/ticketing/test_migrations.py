from datetime import timedelta

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

from accounts.models import OrganizerProfile, User


class ExistingOrdersMigrationTests(TransactionTestCase):
    before = ("ticketing", "0002_event_category_images_visibility")
    after = ("ticketing", "0003_refunds_promo_campaigns_audit")
    latest = ("ticketing", "0004_staffassignment")

    def tearDown(self):
        MigrationExecutor(connection).migrate([self.latest])
        super().tearDown()

    def test_existing_order_subtotal_preserves_original_total(self):
        executor = MigrationExecutor(connection)
        executor.migrate([self.before])
        apps = executor.loader.project_state([self.before]).apps
        Event = apps.get_model("ticketing", "Event")
        Order = apps.get_model("ticketing", "Order")
        user = User.objects.create(email="host@example.com", password="unused")
        organizer = OrganizerProfile.objects.create(
            user=user, display_name="Host", contact_email=user.email
        )
        now = timezone.now()
        event = Event.objects.create(
            organizer_id=organizer.pk,
            title="Concert",
            venue="Hall",
            starts_at=now + timedelta(days=1),
            ends_at=now + timedelta(days=1, hours=2),
            capacity=10,
        )
        order = Order.objects.create(
            purchaser_id=user.pk,
            event_id=event.pk,
            status="confirmed",
            total_minor=9000,
            expires_at=now + timedelta(minutes=15),
        )
        executor = MigrationExecutor(connection)
        executor.migrate([self.after])
        migrated = executor.loader.project_state([self.after]).apps.get_model("ticketing", "Order")
        self.assertEqual(migrated.objects.get(pk=order.pk).subtotal_minor, 9000)
