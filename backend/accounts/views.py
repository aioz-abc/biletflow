import uuid

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework import serializers as drf_serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .models import User
from .serializers import (
    ActiveRefreshSerializer,
    LoginSerializer,
    LogoutSerializer,
    RegisterSerializer,
    ResetConfirmSerializer,
    ResetRequestSerializer,
    UIDTokenSerializer,
    user_payload,
)
from .tokens import rotate_nonce, send_token_email, verify_token


class PublicAuthView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_scope = "auth"

    def get_authenticate_header(self, request):
        return 'Bearer realm="api"'


class RegisterView(PublicAuthView):
    serializer_class = RegisterSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        send_token_email(user, "email_verification")
        return Response({"user": user_payload(user)}, status=201)


class VerifyEmailView(PublicAuthView):
    serializer_class = UIDTokenSerializer

    @transaction.atomic
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = verify_token(
            **serializer.validated_data, purpose="email_verification", max_age=86400
        )
        if user.email_verified_at:
            raise drf_serializers.ValidationError({"token": "Invalid or expired token."})
        user.email_verified_at = timezone.now()
        user.email_verification_nonce = uuid.uuid4()
        user.save(update_fields=["email_verified_at", "email_verification_nonce"])
        return Response({"detail": "Email verified."})


class ResendEmailVerificationView(generics.GenericAPIView):
    throttle_scope = "auth"

    @transaction.atomic
    def post(self, request):
        user = User.objects.select_for_update().get(pk=request.user.pk)
        if not user.email_verified_at:
            rotate_nonce(user, "email_verification")
            send_token_email(user, "email_verification")
        return Response({"detail": "If verification is needed, an email has been sent."})


class ResetPasswordView(PublicAuthView):
    serializer_class = ResetRequestSerializer

    @transaction.atomic
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = (
            User.objects.select_for_update()
            .filter(email__iexact=serializer.validated_data["email"], is_active=True)
            .first()
        )
        if user:
            rotate_nonce(user, "password_reset")
            send_token_email(user, "password_reset")
        return Response({"detail": "If the account exists, a reset email has been sent."})


class ResetPasswordConfirmView(PublicAuthView):
    serializer_class = ResetConfirmSerializer

    @transaction.atomic
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = verify_token(data["uid"], data["token"], "password_reset", 3600)
        try:
            validate_password(data["new_password"], user)
        except DjangoValidationError as exc:
            raise drf_serializers.ValidationError({"new_password": exc.messages}) from exc
        user.set_password(data["new_password"])
        user.password_reset_nonce = uuid.uuid4()
        user.save(update_fields=["password", "password_reset_nonce"])
        return Response({"detail": "Password reset. Sign in again."})


class LoginView(PublicAuthView):
    serializer_class = LoginSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data)


class RefreshView(TokenRefreshView):
    serializer_class = ActiveRefreshSerializer
    throttle_scope = "auth"


class LogoutView(PublicAuthView):
    serializer_class = LogoutSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError as exc:
            raise InvalidToken(str(exc)) from exc
        return Response(status=204)


class MeView(APIView):
    def get(self, request):
        return Response(user_payload(request.user))
