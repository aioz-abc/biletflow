import tempfile
from pathlib import Path
from unittest.mock import patch

from django.db import OperationalError
from django.test import SimpleTestCase, TestCase, override_settings

from config.database import database_from_url


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


class DatabaseUrlTests(SimpleTestCase):
    def test_heroku_url_becomes_tls_postgres_settings(self):
        db = database_from_url("postgres://u%40x:p%2Fw@host.example:6543/name")
        self.assertEqual(
            (db["USER"], db["PASSWORD"], db["HOST"], db["PORT"], db["NAME"]),
            ("u@x", "p/w", "host.example", "6543", "name"),
        )
        self.assertEqual(db["OPTIONS"]["sslmode"], "require")

    def test_other_schemes_are_refused(self):
        with self.assertRaises(ValueError):
            database_from_url("mysql://u:p@h/n")


class FrontendAppTests(TestCase):
    def test_app_routes_get_index_html_but_api_does_not(self):
        with tempfile.TemporaryDirectory() as dist:
            Path(dist, "index.html").write_text("<div id=root></div>")
            with override_settings(FRONTEND_DIST=Path(dist)):
                for path in ("/", "/events/5", "/admin/login", "/organizer/events/1/activation"):
                    response = self.client.get(path)
                    self.assertEqual(response.status_code, 200, path)
                    self.assertIn(b"id=root", b"".join(response.streaming_content))
                self.assertEqual(self.client.get("/api/unknown").status_code, 404)

    def test_without_a_build_app_routes_are_404(self):
        with override_settings(FRONTEND_DIST=Path("/nonexistent")):
            self.assertEqual(self.client.get("/events/5").status_code, 404)
