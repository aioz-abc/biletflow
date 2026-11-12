import os
from urllib.parse import unquote, urlsplit


def database_from_url(url):
    """Django settings for a ``postgres://user:password@host:port/name`` URL (Heroku)."""
    parts = urlsplit(url)
    if parts.scheme not in {"postgres", "postgresql"}:
        raise ValueError(f"Unsupported database URL scheme: {parts.scheme}")
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parts.path.lstrip("/")),
        "USER": unquote(parts.username or ""),
        "PASSWORD": unquote(parts.password or ""),
        "HOST": parts.hostname or "",
        "PORT": str(parts.port or 5432),
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": {
            "connect_timeout": 5,
            "sslmode": os.environ.get("DATABASE_SSLMODE", "require"),
        },
    }
