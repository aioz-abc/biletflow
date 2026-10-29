"""Simulated attendee email (SRS 4.4 and 4.7).

Local development and CI use Django's console/locmem email backends, so these
messages are printed to the web container log instead of being delivered.
"""

from io import BytesIO

import qrcode
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone
from django.utils.html import escape
from qrcode.image.svg import SvgPathImage

from .models import Order, SupportCase, Ticket


def ticket_qr_svg(token):
    output = BytesIO()
    qrcode.make(token, image_factory=SvgPathImage).save(output)
    return output.getvalue()


def money(minor, currency):
    return f"{minor / 100:,.2f} {currency}".replace(",", " ")


def send_order_confirmation(order_id):
    from .serializers import qr_token

    order = Order.objects.select_related("event", "purchaser").get(pk=order_id)
    if order.status != "confirmed":
        return
    event = order.event
    tickets = list(
        Ticket.objects.filter(order_item__order=order)
        .select_related("order_item__ticket_type")
        .order_by("pk")
    )
    starts = timezone.localtime(event.starts_at).strftime("%d.%m.%Y %H:%M")
    kind = "Free registration" if order.total_minor == 0 else "Simulated payment"
    lines = [
        f"Your BiletFlow order #{order.pk} is confirmed.",
        "",
        f"Event: {event.title}",
        f"When: {starts}",
        f"Venue: {event.venue}",
        f"{kind}: {money(order.total_minor, order.currency)}"
        + (
            f" (discount {money(order.discount_minor, order.currency)})"
            if order.discount_minor
            else ""
        ),
        "",
        "Tickets (each QR code is also attached as an SVG file):",
    ]
    for ticket in tickets:
        lines.append(f"- {ticket.order_item.ticket_type.name} · ticket {ticket.identifier}")
    lines += [
        "",
        f"All tickets are in your account: {settings.FRONTEND_BASE_URL}/tickets",
        "Demo environment: no real money was charged.",
    ]
    html_items = "".join(
        f"<li>{escape(t.order_item.ticket_type.name)} · <code>{t.identifier}</code></li>"
        for t in tickets
    )
    html = (
        f"<p>Your BiletFlow order #{order.pk} is confirmed.</p>"
        f"<p><b>{escape(event.title)}</b><br>{starts}<br>{escape(event.venue)}</p>"
        f"<ul>{html_items}</ul>"
        "<p>QR codes are attached. Demo environment: no real money was charged.</p>"
    )
    message = EmailMultiAlternatives(
        subject=f"BiletFlow: your tickets for {event.title}",
        body="\n".join(lines) + "\n",
        to=[order.purchaser.email],
    )
    message.attach_alternative(html, "text/html")
    for ticket in tickets:
        svg = ticket_qr_svg(qr_token(ticket))
        message.attach(f"ticket-{ticket.identifier}.svg", svg, "image/svg+xml")
    message.send()


def send_support_notification(case_id, recipient, summary):
    """Email for new replies, assignment and status changes on a support case (SRS 4.13)."""
    case = SupportCase.objects.select_related("event").get(pk=case_id)
    context = f"Event: {case.event.title}\n" if case.event else "Platform support\n"
    EmailMultiAlternatives(
        subject=f"BiletFlow support #{case.pk}: {summary}",
        body=(
            f'{summary} on support case #{case.pk} "{case.subject}".\n\n'
            f"{context}Status: {case.status}\n\n"
            f"Open the conversation: {settings.FRONTEND_BASE_URL}/support/{case.pk}\n"
        ),
        to=[recipient],
    ).send()
