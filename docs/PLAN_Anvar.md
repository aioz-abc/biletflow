# Anvar — Web Frontend Developer

Owns: the organizer + attendee web application (React + Tailwind CSS),
living in `web/`.

## Phase 1 (Sep 8–14) — Setup & Planning 📍 Report 1 (Sep 14)

- Scaffold the React app (Vite or Next.js — Next.js only if you want
  server-side rendering/SEO for public event pages, otherwise plain Vite
  React is simpler) with Tailwind configured.
- Sketch wireframes (Figma, per the SRS's suggested tooling, or even
  paper/Excalidraw is fine) for: register/login, event creation form,
  public event page, ticket selection, checkout, attendee dashboard,
  organizer dashboard.
- Read `docs/API_CONTRACT.md` as Nursat/Aizhan draft it and flag anything
  that doesn't fit your UI needs.
- **Report 1 deliverable:** app scaffold running locally, wireframes for
  the core screens.

## Phase 2 (Sep 15–28) — Auth & event creation UI 📍 Report 2 (Sep 28)

- Build register/login/logout screens wired to Nursat's real auth API.
- Build the event creation form and public event page, wired to Aizhan's
  Event endpoints as they land.
- **Report 2 deliverable:** a user can register, log in, and an organizer
  can create and view a published event — all through your UI.

## Phase 3 (Sep 29–Oct 12) — Ticket selection & checkout UI 📍 Report 3 (Oct 12)

- Build ticket-type selection on the event page (SRS 4.3), the checkout
  flow (attendee details → simulated payment → confirmation), and the
  ticket/QR display + download.
- If assigned seating is in scope for your team (bonus feature per SRS),
  this is where the interactive seat map would go — treat it as optional;
  don't let it block the core flow.
- **Report 3 deliverable:** attendee can pick a ticket, complete checkout
  in the UI, and see/download their QR ticket.

## Phase 4 (Oct 13–26) — Promo codes, dashboards, support UI 📍 Report 4 (Oct 26)

- Wire up promo-code entry/Campaign QR landing at checkout (discount +
  updated total shown before completing purchase).
- Build the attendee dashboard (their orders/tickets) and organizer
  dashboard shell (sales overview — Mirat owns the analytics data, you
  own presenting it here or in the admin app, confirm which with him).
- Build the attendee-side support chat UI (open a case, message thread)
  against Aizhan's support-case endpoints.
- **Report 4 deliverable:** promo code works at checkout; attendee can
  view past orders and open a support case.

## Phase 5 (Oct 27–Nov 9) — Polish & integration 📍 Report 5 (Nov 9)

- Calendar export button (.ics download / calendar links) if time
  permits — SRS marks this as bonus, cut first if behind.
- Join integration testing: click through every screen against the real
  backend, file/fix bugs.

## Phase 6 (Nov 10–16) — Stabilize 📍 Final (Nov 16)

- UI polish, accessibility pass (SRS asks for WCAG 2.1 AA on event
  pages), fix bugs found in rehearsal.
