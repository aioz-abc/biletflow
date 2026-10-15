# Nursat — Backend / Architecture Lead

Owns: architecture, authentication & roles, database, deployment, CI/CD,
integration across the whole team. Stack: Django + Django REST Framework +
PostgreSQL, Docker.

Your work unblocks almost everyone else — the goal each phase is to land
your piece a little ahead of whoever needs it next.

## Phase 1 (Sep 8–14) — Setup & Planning 📍 Report 1 (Sep 14)

- Confirm the stack decision in writing (Django + DRF + PostgreSQL +
  Docker) — the SRS asks for a short rationale, so a few sentences in
  `docs/` covering team familiarity, speed, and deployment simplicity is
  enough.
- Set up the Django project inside `backend/` with PostgreSQL via Docker
  Compose (`web` + `db` services in `docker-compose.yml`).
- Draft the core data model (SRS section 6): User, OrganizerProfile,
  Event, TicketType, Order, OrderItem, Ticket, Payment, Refund — get
  migrations started for at least User/OrganizerProfile.
- Draft `docs/API_CONTRACT.md` v1 for Auth endpoints (pair with Aizhan,
  she needs this first).
- **Report 1 deliverable:** stack decision written down, repo scaffolded,
  data model diagram/list, API contract draft — no working features
  required yet.

## Phase 2 (Sep 15–28) — Auth end-to-end 📍 Report 2 (Sep 28)

- Implement register, email verification (can be simulated for MVP),
  login, logout, password reset, `/auth/me`.
- Add role-based permissions (Attendee / Organizer / Event Admin /
  Platform Admin) via DRF permission classes.
- Get `docker compose up` working end-to-end so any teammate can run the
  full backend locally.
- Set up GitHub Actions (lint + tests on PR) — pair with Mirat.
- **Report 2 deliverable:** a teammate can register and log in against
  your API; CI runs on every PR.

## Phase 3 (Sep 29–Oct 12) — Tickets, orders, checkout support 📍 Report 3 (Oct 12)

> **Ownership changed.** Nursat implemented the ticket-type, inventory,
> order and checkout work himself as part of the backend ticketing MVP
> (commit `489e07c`), rather than reviewing Aizhan's PRs for it. The review
> workload for this phase has shifted to Aizhan's Phase 2 and Phase 4
> branches instead.

- ✅ Ticket types, inventory holds, orders, simulated checkout and QR
  issuance implemented directly (SRS 4.3–4.7).
- Review and merge Aizhan's two open branches — `aizhan/event-visibility-duplicate`
  and `aizhan/phase4-refunds-promo`, the second stacked on the first. The
  Phase 4 branch carries open design decisions on refund and promo behaviour
  that need an explicit call.
- Keep `API_CONTRACT.md` current.
- Pair-review the seat-reservation/atomic-checkout logic carefully — the
  SRS explicitly requires no double-selling a seat under concurrent
  checkout, which is the trickiest correctness requirement in the project.
- Add a seed-data script so the team always has demo events/tickets
  locally.

## Phase 4 (Oct 13–26) — Notifications, admin auth, mobile API support 📍 Report 4 (Oct 26)

- Wire up simulated email notifications (registration, order, refund).
- Support Mirat on Platform Admin permissions (suspend user/event).
- Make sure `/tickets/:id/verify` and `/tickets/:id/check-in` are fast and
  reliable — SRS wants check-in to complete in about 2 seconds — Abylai's
  mobile app depends on these this phase.

## Phase 5 (Oct 27–Nov 9) — Integration 📍 Report 5 (Nov 9)

- This is your heaviest week: connect backend ↔ frontend ↔ mobile,
  resolve cross-service bugs, and confirm a fresh `git clone` +
  `docker compose up` gives a working demo end to end.
- Support Mirat's remaining admin/analytics endpoints used by `frontend/`.

## Phase 6 (Nov 10–16) — Stabilize 📍 Final (Nov 16)

- Bug triage, a performance pass on checkout/QR validation, final
  deployment docs, help rehearse the demo.
