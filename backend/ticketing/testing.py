from django.conf import settings
from django.utils import timezone

from .models import PaidSalesActivation


def activate_paid_sales(event_id):
    """Test shortcut: give an event a completed simulated paid-sales activation.

    The activation flow itself is covered in test_phase5; other tests only need
    paid tickets to be sellable (SRS 4.5 blocks them otherwise).
    """
    now = timezone.now()
    PaidSalesActivation.objects.update_or_create(
        event_id=event_id,
        defaults={
            "identity_verified_at": now,
            "payout_reference": "SIM-TEST",
            "terms_accepted_at": now,
            "fee_minor": settings.PAID_SALES_ACTIVATION_FEE_MINOR,
            "activated_at": now,
        },
    )
