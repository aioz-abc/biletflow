from unittest.mock import patch

from django.db import OperationalError
from django.test import TestCase


class HealthTests(TestCase):
    def test_health_reports_a_working_database_without_login(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "database": "ok"})

    def test_database_failure_returns_503_without_connection_details(self):
        with patch("config.health.connection.cursor", side_effect=OperationalError("private-host")):
            response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable", "database": "unavailable"})
        self.assertNotContains(response, "private-host", status_code=503)
