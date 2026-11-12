"""Shared settings for the local Docker demo, PostgreSQL-backed CI and Heroku."""

import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

from .database import database_from_url

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.environ.get("DJANGO_DEBUG", "0").lower() in {"1", "true"}
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
if not DEBUG and SECRET_KEY.startswith("django-insecure-"):
    raise ImproperlyConfigured("Set a private DJANGO_SECRET_KEY when DEBUG is disabled.")

ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
if not DEBUG and not FRONTEND_BASE_URL.startswith("https://"):
    raise ImproperlyConfigured("Set an HTTPS FRONTEND_BASE_URL when DEBUG is disabled.")
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "accounts",
    "ticketing",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
if not DEBUG:
    # Serves collected static files and the built React app (WHITENOISE_ROOT).
    # In development Vite serves the frontend and runserver the static files.
    MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")
ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]
WSGI_APPLICATION = "config.wsgi.application"
if os.environ.get("DATABASE_URL"):
    # Heroku Postgres provides one URL; it requires TLS.
    DATABASES = {"default": database_from_url(os.environ["DATABASE_URL"])}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("POSTGRES_DB", "biletflow"),
            "USER": os.environ.get("POSTGRES_USER", "biletflow"),
            "PASSWORD": os.environ["POSTGRES_PASSWORD"],
            "HOST": os.environ.get("POSTGRES_HOST", "db"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
            "OPTIONS": {"connect_timeout": 5},
        }
    }
AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"auth": "60/min"},
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "CHECK_REVOKE_TOKEN": True,
}
LANGUAGE_CODE = "ru"
LANGUAGES = [("kk", "Kazakh"), ("ru", "Russian"), ("en", "English")]
TIME_ZONE = "Asia/Almaty"
USE_I18N = True
USE_TZ = True
APPEND_SLASH = False
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": (
            "django.contrib.staticfiles.storage.StaticFilesStorage"
            if DEBUG
            else "whitenoise.storage.CompressedManifestStaticFilesStorage"
        )
    },
}
# The production image copies `npm run build` output here; Django then serves the
# React app from the same origin as /api (see config.urls.frontend_app).
FRONTEND_DIST = Path(os.environ.get("FRONTEND_DIST", BASE_DIR / "frontend_dist"))
WHITENOISE_ROOT = FRONTEND_DIST if FRONTEND_DIST.is_dir() else None
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
DEFAULT_FROM_EMAIL = "BiletFlow Demo <noreply@example.com>"
# Simulated processing fee in basis points (300 = 3%), withheld from organizer payouts.
PROCESSING_FEE_BPS = int(os.environ.get("PROCESSING_FEE_BPS", "300"))
# One-time simulated Paid Sales Activation Fee per event, in tiyn (SRS 3.3): 5 000 KZT.
PAID_SALES_ACTIVATION_FEE_MINOR = int(os.environ.get("PAID_SALES_ACTIVATION_FEE_MINOR", "500000"))
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
# Behind Heroku's router TLS ends before Django; trust its forwarded scheme.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = not DEBUG and os.environ.get("DJANGO_SSL_REDIRECT", "1") == "1"
CSRF_TRUSTED_ORIGINS = [FRONTEND_BASE_URL]
