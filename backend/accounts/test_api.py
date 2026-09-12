from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User


class AuthAPITests(TestCase):
    def test_malformed_json_returns_validation_error(self):
        response = APIClient().post(
            "/api/auth/register", [{"email": "a@example.com"}], format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_register_login_rotate_logout_and_inactive_account(self):
        client = APIClient()
        data = {"email": " Person@Example.com ", "password": "Long-Secret!9823"}
        response = client.post("/api/auth/register", data, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["user"]["email"], "person@example.com")
        login = client.post("/api/auth/login", data, format="json")
        self.assertEqual(login.status_code, 200, login.content)
        tokens = login.json()
        client.credentials(HTTP_AUTHORIZATION="Bearer " + tokens["access"])
        self.assertEqual(client.get("/api/auth/me").status_code, 200)
        rotated = client.post("/api/auth/refresh", {"refresh": tokens["refresh"]})
        self.assertEqual(rotated.status_code, 200)
        self.assertEqual(
            client.post("/api/auth/refresh", {"refresh": tokens["refresh"]}).status_code, 401
        )
        refresh = rotated.json()["refresh"]
        self.assertEqual(client.post("/api/auth/logout", {"refresh": refresh}).status_code, 204)
        self.assertEqual(client.post("/api/auth/refresh", {"refresh": refresh}).status_code, 401)
        User.objects.update(is_active=False)
        self.assertEqual(client.get("/api/auth/me").status_code, 401)

    def test_registration_rejects_privileges_weak_passwords_and_duplicates(self):
        client = APIClient()
        data = {"email": "user@example.com", "password": "Long-Secret!9823"}
        self.assertEqual(
            client.post("/api/auth/register", {**data, "is_staff": True}).status_code, 400
        )
        self.assertEqual(
            client.post("/api/auth/register", {**data, "password": "123"}).status_code, 400
        )
        self.assertEqual(client.post("/api/auth/register", data).status_code, 201)
        self.assertEqual(
            client.post("/api/auth/register", {**data, "email": "USER@example.com"}).status_code,
            400,
        )
