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

> Delivered early, ahead of the Oct 13–26 window, and merged into `dev`
> (PR #6 and PR #7).

- ✅ Order cancellation for free registrations and full refunds for paid
  orders (SRS 4.9) — refunded/cancelled tickets become invalid, and every
  action is written to an append-only audit log.
- ✅ Server-side validation for Promo Codes and Campaign QR Codes (SRS 4.14)
  — discount calculation, redemption limits and atomic redemption counting
  inside the existing event lock. Mirat owns the admin UI; the enforcement
  logic and a first-pass campaign CRUD live here.
- Open design decisions still needing Nursat's review are listed in the
  pull request for that branch.
- ✅ Pulled forward from Phase 5: Support Case + Support Message endpoints
  (SRS 4.13), because Anvar's and Abylai's Phase 4 support-chat UIs need them
  now. Branch `aizhan/support-cases`.
- **Report 4 deliverable:** met early — promo code applies at checkout, and
  the refund/cancel flow works and is logged. Support-case API is ready for
  the web and mobile support chat.

## Phase 5 (Oct 27–Nov 9) — Support cases backend, integration 📍 Report 5 (Nov 9)

- ✅ Support Case + Support Message endpoints (SRS 4.13) — delivered in
  Phase 4, see above. Remaining: fix issues Anvar and Abylai find while wiring
  the support UIs to them.
- Join the team integration push: fix bugs found when frontend/mobile
  are wired against your real endpoints instead of mocks.

## Phase 6 (Nov 10–16) — Stabilize 📍 Final (Nov 16)

- ✅ Fixed remaining bugs in checkout/refund/promo logic and added the missing
  validation (branch `aizhan/phase6-stabilize`): refunded or cancelled orders
  give their promo-code use back, `max_redemptions` cannot drop below current
  use, a campaign needs a paid ticket type, a ticket type's sales cannot open
  after the event starts, an attendee cannot cancel a registration once the
  event has started, and a 100%-discounted order is no longer reported as a free
  registration.
- ✅ Closed an integration gap found in the rehearsal: refunds and cancellations
  (SRS 4.9) had no web UI. Added `GET /api/events/{id}/orders` with the allowed
  action per order, an Orders table with Refund / Cancel registration on the
  organizer's event page, and Cancel registration in the attendee's account.
- ✅ Rehearsed the core purchase flow on a fresh `seed_demo`: attendee buys two
  Standard tickets for Jazz Night with `DEMO10` (16 000 ₸ → 14 400 ₸), tickets
  are issued, the organizer refunds the order from the web page, and the sales
  summary and inventory update at once. `demo_mvp.py` passes.
