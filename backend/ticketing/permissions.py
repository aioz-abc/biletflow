from django.db.models import Q
from rest_framework.permissions import BasePermission

from .models import Event, SupportCase


def visible_events(user):
    # Private events are only ever visible to their owner/admin, even by direct
    # link; unlisted events are reachable by ID/QR but excluded from the public
    # listing (see EventList.get_queryset).
    public = Q(
        published=True, organizer__user__is_active=True, visibility__in=["public", "unlisted"]
    )
    if user.is_authenticated:
        if user.is_superuser:
            return Event.objects.all()
        public |= Q(organizer__user=user)
    return Event.objects.filter(public)


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


def support_cases(user):
    # SRS 4.13: access follows role and relationship to the case's event. Attendee
    # cases are shared with the organizer and support-enabled Event Admins; platform
    # cases only with the requesting organizer and Platform Admins.
    if not user.is_authenticated or not user.is_active:
        return SupportCase.objects.none()
    if user.is_superuser:
        return SupportCase.objects.all()
    return SupportCase.objects.filter(
        Q(requester=user)
        | Q(kind="attendee", event__organizer__user=user)
        | Q(
            kind="attendee",
            event__staff_assignments__user=user,
            event__staff_assignments__can_manage_support=True,
        )
    ).distinct()


def can_handle_case(user, case):
    """True for the support side of a case: who may reply as staff, assign or set status."""
    if not user.is_active:
        return False
    if user.is_superuser:
        return True
    return case.kind == "attendee" and (
        case.event.organizer.user_id == user.pk
        or case.event.staff_assignments.filter(user=user, can_manage_support=True).exists()
    )
