from django.contrib import admin
from django.urls import include, path

from accounts import views as auth

from .health import health

urlpatterns = [path("admin/", admin.site.urls), path("api/health", health)]
urlpatterns += [
    path("api/", include("ticketing.urls")),
    path("api/auth/register", auth.RegisterView.as_view()),
    path("api/auth/login", auth.LoginView.as_view()),
    path("api/auth/refresh", auth.RefreshView.as_view()),
    path("api/auth/logout", auth.LogoutView.as_view()),
    path("api/auth/me", auth.MeView.as_view()),
]
