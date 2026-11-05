from django.test import TestCase

from accounts.models import User
from ticketing.test_phase3 import Phase3Helpers


class PrintableTicketTests(Phase3Helpers, TestCase):
    def test_buyer_downloads_canonical_ticket_pdf(self):
        event, kind = self.inventory()
        order = self.buy(event, kind)
        ticket = order["tickets"][0]

        response = self.client.get(f"/api/tickets/{ticket['id']}/pdf")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn(f"biletflow-ticket-{ticket['id']}.pdf", response["Content-Disposition"])
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertTrue(response.content.startswith(b"%PDF-"))
        self.assertIn(b"ADMISSION TICKET", response.content)
        self.assertIn(str(ticket["identifier"]).encode(), response.content)
        self.assertGreater(len(response.content), 4000)

    def test_unrelated_attendee_cannot_download_ticket_pdf(self):
        event, kind = self.inventory()
        ticket = self.buy(event, kind)["tickets"][0]
        stranger = User.objects.create_user("stranger@example.com", "secret")
        self.client.force_authenticate(stranger)

        self.assertEqual(self.client.get(f"/api/tickets/{ticket['id']}/pdf").status_code, 404)

    def test_campaign_qr_is_labelled_as_campaign_link(self):
        event, _ = self.inventory()
        campaign = self.client.post(
            f"/api/events/{event}/campaigns",
            {"name": "Launch", "discount_type": "percent", "discount_value": 10},
            format="json",
        ).json()

        response = self.client.get(f"/api/campaigns/{campaign['id']}/qr")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/svg+xml")
        self.assertEqual(response["X-BiletFlow-QR-Kind"], "campaign-link")
        self.assertIn(b"<svg", response.content)
