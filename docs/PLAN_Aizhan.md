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

- Implement Event CRUD: create, edit, publish/unpublish, duplicate
  (SRS 4.2). Include category, images, venue, date/time, capacity,
  public/unlisted/private visibility.
- Implement OrganizerProfile (contact + payout info placeholder).
- **Report 2 deliverable:** an organizer can create and publish an event
  through the API (Anvar will be wiring this to a real UI the same phase).

## Phase 3 (Sep 29–Oct 12) — Tickets, inventory, checkout, QR 📍 Report 3 (Oct 12)

- Implement Ticket Type CRUD (free + paid, price, quantity, sale window,
  per-order limits, hide-without-delete) — SRS 4.3.
- Implement free registration (zero-value order + QR ticket) — SRS 4.4.
- Implement order creation with **temporary inventory/seat holds** that
  expire on abandonment, and the sandboxed/simulated paid checkout —
  SRS 4.5–4.6. This must prevent double-selling the same seat/ticket even
  under concurrent checkouts — use a DB-level lock or atomic transaction,
  and get Nursat to review this specifically.
- Implement QR-code ticket generation on successful "payment" — SRS 4.7.
- **Report 3 deliverable:** an attendee can select a ticket, complete a
  simulated checkout, and receive a QR-code ticket.

## Phase 4 (Oct 13–26) — Refunds, promo-code backend 📍 Report 4 (Oct 26)

- Implement order cancellation (free) and full refunds (SRS 4.9) —
  refunded/cancelled tickets become invalid; log all actions for the
  audit trail Abylai needs.
- Build the server-side validation for Promo Codes and Campaign QR Codes
  (SRS 4.14) — discount calculation, redemption limits, atomic redemption
  counting — Mirat owns the admin UI for creating campaigns, but the
  enforcement logic lives here.
- **Report 4 deliverable:** promo code applies correctly at checkout;
  refund/cancel flow works and is logged.

## Phase 5 (Oct 27–Nov 9) — Support cases backend, integration 📍 Report 5 (Nov 9)

- Implement Support Case + Support Message endpoints (SRS 4.13) — Anvar
  and Abylai need these for the web and mobile support UI.
- Join the team integration push: fix bugs found when web/admin/mobile
  are wired against your real endpoints instead of mocks.

## Phase 6 (Nov 10–16) — Stabilize 📍 Final (Nov 16)

- Fix remaining bugs in checkout/refund/promo logic, add any missing
  validation, help rehearse the demo's core purchase flow.
