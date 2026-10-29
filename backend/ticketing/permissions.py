from django.db.models import Q
from rest_framework.permissions import BasePermission

from .models import Event


def can_check_in(user, event):
    return (
        user.is_authenticated
        and user.is_active
        and (
            user.is_superuser
            or event.organizer.user_id == user.pk
            or event.staff_assignments.filter(user=user, can_check_in=True).exists()
        )
    )


def scan_events(user):
    if not user.is_authenticated or not user.is_active:
        return Event.objects.none()
    if user.is_superuser:
        return Event.objects.all()
    return Event.objects.filter(
        Q(organizer__user=user)
        | Q(staff_assignments__user=user, staff_assignments__can_check_in=True)
    ).distinct()


class CanCheckInEvent(BasePermission):
    def has_object_permission(self, request, view, event):
        return can_check_in(request.user, event)
