import secrets
import uuid

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


def send_token_email(user, purpose):
    subject = (
        "BiletFlow email verification"
        if purpose == "email_verification"
        else "BiletFlow password reset"
    )
    body = f"uid={encoded_uid(user)}\ntoken={token_for(user, purpose)}\n"
    send_mail(subject, body, None, [user.email])
