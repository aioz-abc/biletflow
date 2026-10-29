# Mirat — Phase 2: Admin auth & shell

Period: September 15–28, 2026. Implemented and checked September 24.
Report 2 deliverable: a platform administrator can log in and see an empty
admin dashboard with navigation.

## Completed

- Replaced the Phase 1 disabled login and public admin demo with real auth.
- Integrated the existing backend: POST `/api/auth/login`, GET `/api/auth/me`,
  POST `/api/auth/refresh`, POST `/api/auth/logout` (no trailing slashes).
- Guarded `/admin` and `/admin/*` before rendering the dashboard; only the
  server's `platform_admin` role grants access. Attendee, organizer, and
  event-admin roles are rejected and their new refresh token is revoked.
- Added overview/users/events/orders navigation with explicit empty states.
  Fake statistics and records are removed from the admin dashboard.
- Added loading, invalid-login, insufficient-role, rate-limit, server/network
  failure, and logout-failure messages, labelled fields and responsive layout.
- Restore sessions on reload; recheck privileges on focus and every minute.
  A 401 triggers one refresh, storing both rotated tokens, then retries `/me`.
  Concurrent checks share one request flow. Failed auth clears the session.
- Store only JWTs in per-tab sessionStorage (memory fallback if unavailable).
  Never store passwords or treat stored roles as authorization. Logout clears
  local credentials even if the backend cannot confirm revocation.
- Added auth regression tests and frontend CI (lint, tests, production build).

## Implementation location and scope

The current integration uses `frontend/src/mirat/` inside the team's existing
React/Tailwind app. This follows the actual Phase 1 implementation and
`FRONTEND_INTEGRATION.md`, superseding the original proposed `admin/` folder.
Work is based on `dev`, where the backend Phase 2 auth implementation exists;
`main` still contains the early planning baseline.

Organizer campaign/analytics/history pages remain labelled Phase 1 prototypes.
Real moderation, analytics, promo codes, audit history and PDF tickets are later
phase tasks. Frontend guards do not replace backend permission checks. Tokens
in sessionStorage remain accessible to same-origin JavaScript; avoid unsafe
HTML and maintain the site's XSS protections. Other frontend account flows
currently maintain their own sessions; this change does not alter them.

## Run and demonstrate

1. From the repository root: `docker compose up --build -d --wait`.
2. Create a private local demo admin with
   `docker compose exec web python manage.py createsuperuser`.
   Choose your own email/password; no credentials are committed. The current
   backend grants `platform_admin` to superusers, not merely staff users.
3. In `frontend/`, run `npm ci` and `npm run dev` (Node 24 recommended).
4. Open the Vite address at `/admin`. It displays login without exposing the
   dashboard. Log in with the admin account and show the four shell sections.
5. Reload to demonstrate session restoration. Log out, then revisit `/admin`
   to demonstrate route protection. Try an attendee/organizer account to
   demonstrate role denial; try a wrong password to show validation feedback.
6. Run `npm run lint`, `npm test`, and `npm run build` in `frontend/`.

Vite proxies `/api` to `http://127.0.0.1:8000`; override with
`BILETFLOW_API_TARGET` when needed. Production requires an `/api` reverse proxy
and frontend history fallback. Serve Django's own admin separately so its
`/admin` route does not conflict with the React portal.

## Validation

- Frontend lint and production build passed.
- Automated auth tests cover role denial, credentials, server errors, refresh
  rotation/deduplication, invalid sessions, logout and pending-check races.
- Codex browser checks passed: real admin login, wrong-password feedback,
  attendee rejection, users/events navigation, session restoration on reload,
  logout and direct `/admin/users` protection. No browser errors were recorded.
- Live HTTP checks against Django passed: admin login, invalid credentials,
  attendee denial, refresh-token rotation and logout blacklisting.
- Browser layout was visually inspected at the available viewport. A dedicated
  mobile-device check remains part of the demo rehearsal.
- Docker/PostgreSQL execution was unavailable on this machine. Browser checks
  use the unchanged Django auth implementation and migrations with a temporary
  SQLite database outside the repository; this does not validate PostgreSQL
  concurrency or deployment behavior.

## September 28 hand-in

Use this report and demonstrate the login → empty shell → logout flow above.
Run the Docker/PostgreSQL environment check on the team's normal setup before
presenting. No report submission or teammate approval is implied by this file.
