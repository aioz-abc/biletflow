from collections.abc import Mapping

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .models import OrganizerProfile, User


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, Mapping):
            return super().to_internal_value(data)
        unknown = set(data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError({key: "Unknown field." for key in unknown})
        return super().to_internal_value(data)


def user_payload(user):
    profile = getattr(user, "organizer_profile", None)
    roles = ["attendee"]
    if profile:
        roles.append("organizer")
    if user.is_superuser:
        roles.append("platform_admin")
    return {
        "id": user.pk,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email_verified": bool(user.email_verified_at),
        "roles": roles,
        "organizer_profile": {
            "id": profile.pk,
            "display_name": profile.display_name,
            "contact_email": profile.contact_email,
            "contact_phone": profile.contact_phone,
        }
        if profile
        else None,
    }


class ProfileSerializer(StrictSerializer):
    display_name = serializers.CharField(max_length=200)
    contact_email = serializers.EmailField()
    contact_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)


class RegisterSerializer(StrictSerializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    account_type = serializers.ChoiceField(choices=["attendee", "organizer"], default="attendee")
    organizer_profile = ProfileSerializer(required=False)

    def validate(self, attrs):
        attrs["email"] = User.objects.normalize_email(attrs["email"])
        if User.objects.filter(email__iexact=attrs["email"]).exists():
            raise serializers.ValidationError({"email": "Email already registered."})
        organizer = attrs["account_type"] == "organizer"
        if organizer != ("organizer_profile" in attrs):
            raise serializers.ValidationError(
                "Organizer registration requires a profile; attendee must omit it."
            )
        try:
            validate_password(
                attrs["password"],
                User(
                    email=attrs["email"],
                    first_name=attrs.get("first_name", ""),
                    last_name=attrs.get("last_name", ""),
                ),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages}) from exc
        return attrs

    def create(self, validated_data):
        validated_data.pop("account_type")
        profile = validated_data.pop("organizer_profile", None)
        try:
            with transaction.atomic():
                user = User.objects.create_user(**validated_data)
                if profile:
                    OrganizerProfile.objects.create(user=user, **profile)
                return user
        except IntegrityError as exc:
            raise serializers.ValidationError({"email": "Email already registered."}) from exc


class LoginSerializer(StrictSerializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(email=attrs["email"], password=attrs["password"])
        if user is None:
            raise AuthenticationFailed("Invalid credentials.")
        refresh = RefreshToken.for_user(user)
        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": user_payload(user),
        }


class ActiveRefreshSerializer(TokenRefreshSerializer):
    @transaction.atomic
    def validate(self, attrs):
        token = self.token_class(attrs["refresh"])
        # Re-validate the token after acquiring the account lock so rotation is single-use.
        user = User.objects.select_for_update().filter(pk=token["user_id"]).first()
        if user is None or not user.is_active:
            raise AuthenticationFailed("Account unavailable.")
        return super().validate(attrs)


class LogoutSerializer(StrictSerializer):
    refresh = serializers.CharField()
