from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .forms import AccountChangeForm, AccountCreationForm
from .models import OrganizerProfile, User


@admin.register(User)
class AccountAdmin(UserAdmin):
    form = AccountChangeForm
    add_form = AccountCreationForm
    list_display = ("email", "first_name", "last_name", "is_active", "is_staff")
    search_fields = ("email", "first_name", "last_name")
    ordering = ("email",)
    readonly_fields = ("date_joined", "last_login")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "email_verified_at")}),
        (
            "Permissions",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("Dates", {"fields": ("date_joined", "last_login")}),
    )
    add_fieldsets = (
        (None, {"fields": ("email", "password1", "password2", "first_name", "last_name")}),
    )


@admin.register(OrganizerProfile)
class OrganizerProfileAdmin(admin.ModelAdmin):
    list_display = ("display_name", "user", "contact_email")
    search_fields = ("display_name", "user__email", "contact_email")
    autocomplete_fields = ("user",)
    readonly_fields = ("created_at", "updated_at")
