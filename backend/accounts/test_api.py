import re

from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User


class AuthAPITests(TestCase):
    def test_verification_token_is_bound_to_its_account_and_purpose(self):
        from accounts.tokens import encoded_uid, token_for

        first = User.objects.create_user("first@example.com", "Long-Secret!9823")
        second = User.objects.create_user("second@example.com", "Long-Secret!9823")
        client = APIClient()
        self.assertEqual(
            client.post(
                "/api/auth/verify-email",
                {"uid": encoded_uid(second), "token": token_for(first, "email_verification")},
            ).status_code,
            400,
        )
        self.assertEqual(
            client.post(
                "/api/auth/verify-email",
                {"uid": encoded_uid(first), "token": token_for(first, "password_reset")},
            ).status_code,
            400,
        )

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_email_verification_is_single_use_and_reissue_invalidates_old_link(self):
        client = APIClient()
        email = "verify@example.com"
        password = "Long-Secret!9823"
        response = client.post("/api/auth/register", {"email": email, "password": password})
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(len(mail.outbox), 1)
        first = dict(re.findall(r"^(uid|token)=(.+)$", mail.outbox[-1].body, re.MULTILINE))
        token = client.post("/api/auth/login", {"email": email, "password": password}).json()
        client.credentials(HTTP_AUTHORIZATION="Bearer " + token["access"])
        self.assertEqual(client.post("/api/auth/verify-email/request").status_code, 200)
        second = dict(re.findall(r"^(uid|token)=(.+)$", mail.outbox[-1].body, re.MULTILINE))
        client.credentials()
        self.assertEqual(client.post("/api/auth/verify-email", first).status_code, 400)
        self.assertEqual(client.post("/api/auth/verify-email", second).status_code, 200)
        self.assertEqual(client.post("/api/auth/verify-email", second).status_code, 400)
        self.assertTrue(User.objects.get(email=email).email_verified_at)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        FRONTEND_BASE_URL="https://biletflow.example",
    )
    def test_password_reset_email_links_to_the_frontend_reset_page(self):
        from urllib.parse import parse_qs, urlsplit

        client = APIClient()
        email = "link@example.com"
        client.post("/api/auth/register", {"email": email, "password": "Long-Secret!9823"})
        mail.outbox.clear()
        self.assertEqual(client.post("/api/auth/reset-password", {"email": email}).status_code, 200)
        body = mail.outbox[-1].body

        link = re.search(r"^https://\S+$", body, re.MULTILINE).group(0)
        parts = urlsplit(link)
        self.assertEqual(
            f"{parts.scheme}://{parts.netloc}{parts.path}",
            "https://biletflow.example/reset-password",
        )
        from_link = {k: v[0] for k, v in parse_qs(parts.query).items()}
        from_lines = dict(re.findall(r"^(uid|token)=(.+)$", body, re.MULTILINE))
        self.assertEqual(from_link, from_lines)

        # The reset page also accepts the whole email pasted in. It takes the
        # first uid=/token= it finds, which is now the link's, so those must
        # read the same as the lines below.
        pasted = {
            "uid": re.search(r"\buid=([\w-]+)", body).group(1),
            "token": re.search(r"\btoken=([\w:-]+)", body).group(1),
        }
        self.assertEqual(pasted, from_lines)

        self.assertEqual(
            client.post(
                "/api/auth/reset-password/confirm",
                {**from_link, "new_password": "Different-Secret!7381"},
            ).status_code,
            200,
        )

    def test_password_reset_is_generic_single_use_and_revokes_existing_tokens(self):
        client = APIClient()
        email = "reset@example.com"
        old_password = "Long-Secret!9823"
        new_password = "Different-Secret!7381"
        self.assertEqual(
            client.post(
                "/api/auth/register", {"email": email, "password": old_password}
            ).status_code,
            201,
        )
        tokens = client.post("/api/auth/login", {"email": email, "password": old_password}).json()
        self.assertEqual(
            client.post("/api/auth/reset-password", {"email": "missing@example.com"}).status_code,
            200,
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(client.post("/api/auth/reset-password", {"email": email}).status_code, 200)
        first = dict(re.findall(r"^(uid|token)=(.+)$", mail.outbox[-1].body, re.MULTILINE))
        self.assertEqual(client.post("/api/auth/reset-password", {"email": email}).status_code, 200)
        second = dict(re.findall(r"^(uid|token)=(.+)$", mail.outbox[-1].body, re.MULTILINE))
        self.assertEqual(
            client.post(
                "/api/auth/reset-password/confirm", {**first, "new_password": new_password}
            ).status_code,
            400,
        )
        self.assertEqual(
            client.post(
                "/api/auth/reset-password/confirm", {**second, "new_password": new_password}
            ).status_code,
            200,
        )
        self.assertEqual(
            client.post(
                "/api/auth/reset-password/confirm", {**second, "new_password": new_password}
            ).status_code,
            400,
        )
        client.credentials(HTTP_AUTHORIZATION="Bearer " + tokens["access"])
        self.assertEqual(client.get("/api/auth/me").status_code, 401)
        client.credentials()
        self.assertEqual(
            client.post("/api/auth/refresh", {"refresh": tokens["refresh"]}).status_code, 401
        )
        self.assertEqual(
            client.post("/api/auth/login", {"email": email, "password": old_password}).status_code,
            401,
        )
        self.assertEqual(
            client.post("/api/auth/login", {"email": email, "password": new_password}).status_code,
            200,
        )

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
