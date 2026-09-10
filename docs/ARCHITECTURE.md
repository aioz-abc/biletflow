# Backend foundation — Phase 1

Scope: Nursat's deliverables for September 14, 2026. This is the backend
foundation, not the implementation of the team's later ticketing features.

## Stack decision

Use Python 3.11, Django 5.2 LTS, Django REST Framework 3.16, PostgreSQL 16,
and Docker Compose. This implements the stack already recorded in the team
plans; the course SRS permits both Django and FastAPI and does not mandate
Django. Team familiarity should be confirmed by the teammates; it is not
assumed as a fact about everybody's experience.

Django supplies migrations, password hashing, sessions, model validation,
and an internal admin interface. That reduces setup for a data-heavy
ten-week project. PostgreSQL provides relational constraints and transactions
for inventory and promo limits. One backend and one database keep local
deployment straightforward. FastAPI is a valid alternative, but would require
separate choices for the ORM, migrations, and internal administration.

This is one Django application deployment, with domain apps added when their
features start. `accounts` owns user/profile models; `config` owns settings,
routing and health. Web, admin and mobile clients consume the same REST API.
No queue, Redis, microservices or real payment integration is needed for Phase 1.

## Account and access design

- Use a custom User from the first migration, identified by email.
- BiletFlow treats email addresses as case-insensitive, trims surrounding
  whitespace and stores lowercase addresses. The database independently
  enforces case-insensitive uniqueness.
- Passwords use Django's password hashing. Email verification is tracked
  separately from `is_active`, which is reserved for account suspension.
- An account can be an attendee and organizer at the same time. An optional
  one-to-one OrganizerProfile represents organizer capability.
- Event Admin capability will come from a StaffAssignment for a particular
  event. It does not grant access to other organizers' events.
- For the academic MVP, Platform Admin maps to a Django superuser.
  `is_staff` alone grants only entry to internal Django admin, subject to
  model permissions; it is not a platform-wide business role.
- Future API serializers must allowlist input fields. Users must never be
  allowed to set their own staff/superuser or verification flags.

JWT access/refresh authentication is the Phase 2 API design for all three
clients. Access lasts 15 minutes, refresh lasts 7 days with rotation and
blacklisting. Logout revokes refresh credentials; an existing access token
can live until expiry. Live account status and event ownership still need
checking on protected requests. Django admin uses its own session and CSRF.
These API flows and object permissions are documented, not implemented here.

## Operational boundaries

Docker Compose is for local development/course demonstration. It binds the
web server only to localhost, keeps PostgreSQL off host ports, persists its
data in a named volume, and waits for database readiness before migration.
The included development secrets and Django development server are not a
production deployment. Deployment with TLS, private secrets, backups,
restoration checks and a production server belongs to a later phase.

`GET /api/health` checks database connectivity. It exposes only readiness
status and returns 503 without internal exception details on database failure.
Automated checks use a real PostgreSQL database, including migration and
case-insensitive uniqueness checks.

## Decisions for the team before Phase 2

- Agree whether checkout requires an account. This draft proposes an account
  for the base MVP, while keeping ticket-holder details separate from User
  so one purchaser can buy for several people. No checkout is implemented.
- Review the auth payloads in API_CONTRACT.md and entity relationships in
  DATA_MODEL.md with Aizhan and the client developers.
- Agree the simulated activation fee, who pays processing fees, refund rules,
  and retention policy before the corresponding features start.

Assigned seating and calendar export are bonuses under SRS sections 8 and 11,
despite stronger wording in some earlier feature descriptions. General
admission inventory must still prevent overselling. Basic support, PDF,
analytics, audit history and promo campaigns belong to the required MVP.

References: course SRS v0.3, sections 6–9 and 13; [Django custom users](https://docs.djangoproject.com/en/5.2/topics/auth/customizing/),
[Django release notes](https://docs.djangoproject.com/en/5.2/releases/),
[DRF requirements](https://www.django-rest-framework.org/#requirements).
