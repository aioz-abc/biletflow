# BiletFlow — Team & Workflow

## Team & Responsibilities

| # | Person | Role | Main responsibility | Key tasks |
|---|--------|------|---------------------|-----------|
| 1 | Nursat | Backend / Architecture Lead | Core backend + integration | Auth, roles, API structure, database setup, deployment, Docker, CI/CD |
| 2 | Aizhan | Ticketing Backend Developer | Ticket/order/payment logic | Events, ticket types, inventory, orders, checkout simulation, QR generation, refunds |
| 3 | Anvar | Web Frontend Developer | Organizer + attendee website | Event creation, event pages, ticket selection, checkout UI, attendee dashboard, organizer dashboard |
| 4 | Abylai | Mobile + QA Developer | Mobile scanner + testing | React Native app, QR scanning, check-in, staff assignments, support chat, automated testing |
| 5 | Mirat | Admin + Analytics Developer | Admin & business features | Admin panel, promo codes, Campaign QR Codes, analytics, event history, audit logs, PDF tickets |

## Repo Structure (proposed)

```
biletflow/
├── backend/     # API, DB, auth — owned by Nursat & Aizhan
├── frontend/    # Attendee, organizer, and admin UI — Anvar & Mirat
├── mobile/      # React Native check-in app — owned by Abylai
└── docs/        # Shared docs (this file, API_CONTRACT.md, SRS)
```

Anvar and Mirat share `frontend/`, with separate route/component ownership:
Anvar owns attendee and organizer flows; Mirat owns admin, campaigns,
analytics, and event-history views. Coordinate changes to shared components.

## Branch Workflow

- `main` is protected: no direct pushes, no force-push, no deletion.
- Branch naming: `feature/<name>-<short-description>`
  - e.g. `feature/nursat-auth-setup`, `feature/anvar-checkout-ui`
- Open a pull request into `main` when a piece of work is ready.
- Required approvals on `main` are currently **0** (revisit once there's
  real code — see note below). Review is encouraged even though it isn't
  enforced yet.
- Pull latest `main` before starting a new branch.

## Kickoff Order

1. **Nursat** sets up the backend skeleton first: folder structure, DB
   schema for core entities (users, events, tickets, orders), basic auth,
   and a first pass at `docs/API_CONTRACT.md`.
2. While that's happening, **Anvar** and **Mirat** scaffold their assigned
   routes in `frontend/`, while **Abylai** scaffolds `mobile/` — this doesn't
   require a working backend yet.
3. **Aizhan** builds ticket/order logic on top of Nursat's DB + auth
   foundation as soon as it lands.
4. Once the API contract stabilizes, everyone builds their screens against
   real (or mocked) endpoints matching that contract.

## Revisit Later

- [ ] Turn on required PR approvals (≥1) once real feature work is landing.
- [ ] Confirm GitHub Team org plan if branch protection needs to keep
      working on a private repo (currently public, so this doesn't block
      us for now).
