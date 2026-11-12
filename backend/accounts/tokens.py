import secrets
import uuid
from urllib.parse import urlencode

from django.conf import settings
from django.core import signing
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.exceptions import ValidationError

from .models import User


def encoded_uid(user):
    return urlsafe_base64_encode(force_bytes(user.pk))


def token_for(user, purpose):
    nonce = getattr(user, f"{purpose}_nonce")
    return signing.TimestampSigner(salt=f"biletflow.{purpose}").sign(f"{user.pk}:{nonce}")


def verify_token(uid, token, purpose, max_age):
    try:
        pk = int(force_str(urlsafe_base64_decode(uid)))
        user = User.objects.select_for_update().get(pk=pk, is_active=True)
        nonce = signing.TimestampSigner(salt=f"biletflow.{purpose}").unsign(token, max_age=max_age)
        expected = f"{user.pk}:{getattr(user, f'{purpose}_nonce')}"
        if not secrets.compare_digest(expected, nonce):
            raise ValueError("Token was already used.")
        return user
    except (ValueError, TypeError, OverflowError, User.DoesNotExist, signing.BadSignature) as exc:
        raise ValidationError({"token": "Invalid or expired token."}) from exc


def rotate_nonce(user, purpose):
    field = f"{purpose}_nonce"
    setattr(user, field, uuid.uuid4())
    user.save(update_fields=[field])


def password_reset_link(uid, token):
    # Keep ":" unescaped: the reset page also accepts the whole email pasted in
    # and reads token= up to the first character outside [\w:-].
    query = urlencode({"uid": uid, "token": token}, safe=":")
    return f"{settings.FRONTEND_BASE_URL}/reset-password?{query}"


def send_token_email(user, purpose):
    uid, token = encoded_uid(user), token_for(user, purpose)
    codes = f"uid={uid}\ntoken={token}\n"
    if purpose == "email_verification":
        send_mail("BiletFlow email verification", codes, None, [user.email])
        return
    body = (
        "To choose a new BiletFlow password, open this link:\n"
        f"{password_reset_link(uid, token)}\n\n"
        "It works once and expires in 1 hour. If you did not ask for this, "
        "ignore this email; your password stays the same.\n\n"
        "If the link does not open, paste these lines on the reset page:\n"
        f"{codes}"
    )
    send_mail("BiletFlow password reset", body, None, [user.email])
