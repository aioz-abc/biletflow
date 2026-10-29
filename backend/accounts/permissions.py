from rest_framework.permissions import BasePermission


class IsPlatformAdmin(BasePermission):
    """Platform Admin role (SRS 4.12). `user_payload` reports it as "platform_admin"."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user.is_authenticated and user.is_active and user.is_superuser)
