# Backend Foundation Implementation Plan

**Goal:** Deliver Nursat's Phase 1 backend foundation for September 14.

**Architecture:** One Django backend and PostgreSQL database. Implement only
accounts, internal admin, and readiness; document the later domain model and
auth contract without pretending those endpoints exist.

**Tech Stack:** Python 3.11, Django 5.2, DRF 3.16, PostgreSQL 16, Docker Compose.

**Spec:** `docs/PLAN_Nursat.md` Phase 1 and `docs/ARCHITECTURE.md`.

## Constraints

- Preserve the team's other plans and planned endpoint status.
- No work on other people's applications or later checkout features.
- Use PostgreSQL for verification, with persistent local data kept separate
  from disposable test databases.
- Keep implementation local on `codex/nursat-backend-foundation` for review.

## Tasks

- [x] Scaffold `backend/config`, dependencies, Dockerfile, Compose and `.env.example`.
  Verify: `docker compose config --quiet` and `docker compose build web`.
- [x] Add failing behavior checks in `backend/accounts/tests.py` for email
  identity and in `backend/config/tests.py` for readiness. Observed both failures
  with a temporary in-memory SQLite configuration while Docker images downloaded;
  final tests ran with the normal settings on PostgreSQL in Docker.
- [x] Implement custom User/manager and OrganizerProfile in `accounts/models.py`,
  internal admin forms/registration, and `config/health.py`. Extend checks
  for case-insensitive database uniqueness, inactive login, invalid email,
  superuser flags, profile uniqueness and database-failure readiness.
- [x] Generate and inspect `accounts/migrations/0001_initial.py`; run migrate,
  tests, `makemigrations --check --dry-run`, `check`, `ruff check`, and
  `ruff format --check` against the final implementation.
- [x] Add GitHub Actions PostgreSQL checks in `.github/workflows/backend.yml`.
- [x] Document startup/tests in README, entity relationships in DATA_MODEL.md,
  and auth request/response/error/security semantics in API_CONTRACT.md.
- [x] Start Compose, confirm both services healthy, verify HTTP readiness and
  internal admin page. Review diff and report implemented versus planned scope.
