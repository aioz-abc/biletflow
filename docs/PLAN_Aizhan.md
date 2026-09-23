# Aizhan — Ticketing Backend Developer

Owns: event/ticket/order/seat-reservation backend services — the core
transactional logic of the whole platform. Stack: Django + DRF +
PostgreSQL.

## Phase 1 (Sep 8–14) — Setup & Planning 📍 Report 1 (Sep 14)

- Pair with Nursat on the core data model, especially Event, Venue,
  VenueSection, Row, Seat, SeatHold, TicketType, Order, OrderItem, Ticket
  (SRS section 6).
- Draft the Event, Ticket Type, and Order sections of
  `docs/API_CONTRACT.md` (endpoints + request/response shapes), even
  though the logic isn't built yet — this is what Anvar and Abylai will
  build their UI against.
- **Report 1 deliverable:** agreed data model for events/tickets/orders,
  API contract draft for those sections.

## Phase 2 (Sep 15–28) — Event creation 📍 Report 2 (Sep 28)

- ✅ Event category, images and public/unlisted/private visibility, plus the
  duplicate-event endpoint (SRS 4.2) — branch
  `aizhan/event-visibility-duplicate`, pending review and merge into `dev`.
- OrganizerProfile (contact + payout info placeholder) was delivered by
  Nursat as part of the backend foundation.
- Remaining this phase: support Anvar Khaydarov on the API side of the
  organizer event-creation UI (due Sep 28).
- **Report 2 deliverable:** an organizer can create and publish an event
  through the API (Anvar is wiring this to a real UI the same phase).

## Phase 3 (Sep 29–Oct 12) — Tickets, inventory, checkout, QR 📍 Report 3 (Oct 12)

> **Ownership changed.** This phase was delivered early by Nursat as part of
> the backend ticketing MVP (commit `489e07c`), not by Aizhan as originally
> planned. Kept here for traceability against the original plan.

- ✅ Ticket Type CRUD (free + paid, price, quantity, sale window, per-order
  limits, hide-without-delete) — SRS 4.3 — *Nursat*.
- ✅ Free registration (zero-value order + QR ticket) — SRS 4.4 — *Nursat*.
- ✅ Order creation with temporary inventory holds that expire on
  abandonment, and the simulated paid checkout — SRS 4.5–4.6. The event-level
  lock prevents double-selling under concurrent checkout — *Nursat*.
- ✅ QR-code ticket generation on successful "payment" — SRS 4.7 — *Nursat*.
- **Report 3 deliverable:** met early — `backend/demo_mvp.py` runs the whole
  flow end to end.

## Phase 4 (Oct 13–26) — Refunds, promo-code backend 📍 Report 4 (Oct 26)

> Delivered early, ahead of the Oct 13–26 window. Branch
> `aizhan/phase4-refunds-promo`, stacked on the Phase 2 branch and pending
> review and merge into `dev`.

- ✅ Order cancellation for free registrations and full refunds for paid
  orders (SRS 4.9) — refunded/cancelled tickets become invalid, and every
  action is written to an append-only audit log.
- ✅ Server-side validation for Promo Codes and Campaign QR Codes (SRS 4.14)
  — discount calculation, redemption limits and atomic redemption counting
  inside the existing event lock. Mirat owns the admin UI; the enforcement
  logic and a first-pass campaign CRUD live here.
- Open design decisions still needing Nursat's review are listed in the
  pull request for that branch.
- **Report 4 deliverable:** met early — promo code applies at checkout, and
  the refund/cancel flow works and is logged.

## Phase 5 (Oct 27–Nov 9) — Support cases backend, integration 📍 Report 5 (Nov 9)

- Implement Support Case + Support Message endpoints (SRS 4.13) — Anvar
  and Abylai need these for the web and mobile support UI.
- Join the team integration push: fix bugs found when frontend/mobile
  are wired against your real endpoints instead of mocks.

## Phase 6 (Nov 10–16) — Stabilize 📍 Final (Nov 16)

- Fix remaining bugs in checkout/refund/promo logic, add any missing
  validation, help rehearse the demo's core purchase flow.
