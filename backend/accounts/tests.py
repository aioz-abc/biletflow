from django.contrib.auth import authenticate, get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from .forms import AccountCreationForm
from .models import OrganizerProfile

User = get_user_model()


class UserTests(TestCase):
    def test_email_is_the_normalized_login_and_password_is_hashed(self):
        user = User.objects.create_user("  Nursat@Example.COM  ", password="Example-pass-2026!")
        self.assertEqual(user.email, "nursat@example.com")
        self.assertTrue(user.check_password("Example-pass-2026!"))
        self.assertNotEqual(user.password, "Example-pass-2026!")

    def test_email_login_is_case_insensitive_and_inactive_users_cannot_login(self):
        user = User.objects.create_user("nursat@example.com", password="Example-pass-2026!")
        self.assertEqual(
            authenticate(email="  NURSAT@EXAMPLE.COM ", password="Example-pass-2026!"), user
        )
        user.is_active = False
        user.save(update_fields=["is_active"])
        self.assertIsNone(authenticate(email=user.email, password="Example-pass-2026!"))

    def test_invalid_email_cannot_be_created(self):
        for email in ("", "   ", "missing-at-sign"):
            with self.subTest(email=email), self.assertRaises((ValueError, ValidationError)):
                User.objects.create_user(email)
        self.assertEqual(User.objects.count(), 0)

    def test_database_rejects_case_variant_even_when_save_is_bypassed(self):
        User.objects.create_user("nursat@example.com")
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.bulk_create([User(email="NURSAT@example.com", password="!")])

    def test_direct_save_normalizes_email(self):
        user = User(email="  Direct@Example.COM  ")
        user.set_unusable_password()
        user.save()
        user.refresh_from_db()
        self.assertEqual(user.email, "direct@example.com")

    def test_user_is_unverified_and_has_no_admin_privileges_by_default(self):
        user = User.objects.create_user("attendee@example.com")
        self.assertIsNone(user.email_verified_at)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertFalse(user.has_usable_password())

    def test_regular_user_creation_rejects_privileged_flags(self):
        for flag in ("is_staff", "is_superuser"):
            with self.subTest(flag=flag), self.assertRaises(ValueError):
                User.objects.create_user("attendee@example.com", **{flag: True})

    def test_superuser_provisioning_requires_both_admin_flags(self):
        admin = User.objects.create_superuser("admin@example.com", "Example-pass-2026!")
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)
        self.assertTrue(admin.check_password("Example-pass-2026!"))
        for flag in ("is_staff", "is_superuser"):
            with self.subTest(flag=flag), self.assertRaises(ValueError):
                User.objects.create_superuser("other@example.com", **{flag: False})

    def test_organizer_profile_is_optional_and_unique_per_user(self):
        user = User.objects.create_user("organizer@example.com")
        self.assertFalse(OrganizerProfile.objects.filter(user=user).exists())
        profile = OrganizerProfile.objects.create(
            user=user, display_name="Student Events", contact_email="events@example.com"
        )
        self.assertEqual(user.organizer_profile, profile)
        with self.assertRaises(IntegrityError), transaction.atomic():
            OrganizerProfile.objects.create(
                user=user, display_name="Duplicate", contact_email="events@example.com"
            )

    def test_admin_creation_form_uses_email_and_hashes_password(self):
        form = AccountCreationForm(
            data={
                "email": "AdminCreated@Example.COM",
                "password1": "Example-pass-2026!",
                "password2": "Example-pass-2026!",
            }
        )
        self.assertTrue(form.is_valid(), form.errors)
        user = form.save()
        self.assertEqual(user.email, "admincreated@example.com")
        self.assertTrue(user.check_password("Example-pass-2026!"))

    def test_custom_user_admin_add_and_edit_pages_render(self):
        admin = User.objects.create_superuser("admin@example.com", "Example-pass-2026!")
        self.client.force_login(admin)
        self.assertEqual(self.client.get("/admin/accounts/user/add/").status_code, 200)
        self.assertEqual(
            self.client.get(f"/admin/accounts/user/{admin.pk}/change/").status_code, 200
        )
