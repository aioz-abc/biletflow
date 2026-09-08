# Abylai — Admin + Analytics Developer

Owns: the admin interface, promotional campaigns, basic reporting,
organizer event history/audit trail, and printable tickets. Living in
`admin/` (React + Tailwind), plus backend endpoints you'll need
Nursat/Aizhan's help exposing.

## Phase 1 (Sep 8–14) — Setup & Planning 📍 Report 1 (Sep 14)

- Scaffold the admin React app in `admin/` (can share components/config
  with Anvar's `web/` app if useful, but keep it a separate app per
  `TEAM.md`'s folder structure).
- Sketch wireframes for: admin login, platform-admin dashboard (search
  users/events/orders), organizer promo-campaign creation, organizer
  analytics dashboard, organizer event-history view.
- Start drafting the Admin + Analytics + Promo Codes sections of
  `docs/API_CONTRACT.md`.
- **Report 1 deliverable:** admin app scaffold running, wireframes for
  the above screens.

## Phase 2 (Sep 15–28) — Admin auth & shell 📍 Report 2 (Sep 28)

- Build the admin login screen against Nursat's auth API (Platform Admin
  role) and the basic dashboard shell/navigation.
- **Report 2 deliverable:** platform admin can log in and see an empty
  dashboard shell.

## Phase 3 (Sep 29–Oct 12) — Organizer-side analytics groundwork 📍 Report 3 (Oct 12)

- Design the analytics data needs with Aizhan (capacity, sold, remaining,
  gross sales, refunds, sales-over-time — SRS 4.15) so the backend
  aggregation endpoints exist by the time you need them.
- Start the organizer promo-campaign creation UI (name, discount type,
  validity dates, max redemptions, applicable ticket types — SRS 4.14).
- **Report 3 deliverable:** promo campaign can be created through your UI
  (backend enforcement is Aizhan's, from her Phase 4).

## Phase 4 (Oct 13–26) — Printable tickets, Campaign QR, refund view 📍 Report 4 (Oct 26)

- Implement printable PDF ticket generation (server-side, from the
  canonical ticket record per SRS's suggested stack) — event name, date,
  venue, ticket type, seat if applicable, ticket ID, QR code, no
  payment-card data.
- Finish the Campaign QR Code generation/display in the promo-campaign UI
  — must be visually distinct from an admission ticket QR (SRS 4.14).
- Build the platform-admin view for reviewing paid-sales activation
  requests and suspending events/users (SRS 4.12).
- **Report 4 deliverable:** printable ticket PDF works; Campaign QR
  generated and scannable; admin can suspend a test event.

## Phase 5 (Oct 27–Nov 9) — Analytics dashboard & audit trail 📍 Report 5 (Nov 9)

- Build the organizer analytics dashboard (sales over time, by ticket
  type, campaign performance, check-in percentage, date-range/ticket-type
  filters — SRS 4.15).
- Build organizer event history (Upcoming/Active/Completed/Cancelled) and
  the chronological activity timeline/audit log (SRS 4.16) — publication,
  price/capacity changes, refunds, promo changes, check-ins.
- **Report 5 deliverable:** organizer can view real analytics and event
  history for a demo event.

## Phase 6 (Nov 10–16) — Stabilize 📍 Final (Nov 16)

- Polish dashboard charts/tables, fix bugs found in full-system rehearsal,
  help prep the demo's admin-side walkthrough.
