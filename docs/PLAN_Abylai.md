# Abylai — Mobile + QA Developer

Owns: the React Native check-in app, the support-chat workflow (shared
with Anvar/Aizhan), automated testing across the project, and release
coordination (CI/CD, keeping `main` healthy). Living in `mobile/`.

## Phase 1 (Sep 8–14) — Setup & Planning 📍 Report 1 (Sep 14)

- Scaffold the React Native app in `mobile/` (Expo is the simpler choice
  per the SRS's suggested stack, unless the team has a reason to go bare
  React Native).
- Set up the automated-testing skeleton: pytest for the Django backend,
  Jest/React Testing Library for web/admin, Jest for the mobile app.
- Pair with Nursat on the GitHub Actions CI pipeline (lint + test on every
  PR) — this is your "release coordination" hat.
- **Report 1 deliverable:** mobile app scaffold running on a simulator/
  Expo Go, test frameworks installed, CI pipeline running (even if there's
  nothing to test yet).

## Phase 2 (Sep 15–28) — Mobile auth & nav 📍 Report 2 (Sep 28)

- Build the Event Admin login screen against Nursat's auth API and basic
  navigation (assigned-events list placeholder).
- Write the first real automated tests: auth endpoints (backend) and
  auth screens (mobile), running in CI.
- **Report 2 deliverable:** Event Admin can log in on the mobile app; CI
  is running real tests, not just linting.

## Phase 3 (Sep 29–Oct 12) — QR scan groundwork 📍 Report 3 (Oct 12)

- Integrate the device camera / QR-scanning library and build the scan
  screen UI (can scan a locally-generated test QR before Aizhan's ticket
  QR endpoint exists).
- Add tests for the order/checkout flow as Aizhan lands it (SRS wants
  "automated API, interface, payment, and QR-validation tests").
- **Report 3 deliverable:** camera-based QR scanning works in the app
  (even against a placeholder QR).

## Phase 4 (Oct 13–26) — Full check-in flow + support chat 📍 Report 4 (Oct 26)

- Wire the scan screen to the real `/tickets/:id/verify` and
  `/tickets/:id/check-in` endpoints — show valid/invalid/cancelled/
  already-used/refunded clearly (SRS 4.8).
- Add manual attendee search, undo check-in, and the assigned-events list
  for real (staff assignment per event).
- Build or support the support-chat workflow's mobile/organizer-staff
  side if in scope for your team (SRS 4.13) — coordinate with Anvar and
  Aizhan since the backend and web UI are theirs.
- **Report 4 deliverable:** full check-in flow works end-to-end on a real
  device/emulator against a real ticket.

## Phase 5 (Oct 27–Nov 9) — Test coverage & integration 📍 Report 5 (Nov 9)

- This is your heaviest QA week: drive the full-system integration pass
  with Nursat — click/run through every core use case (SRS section 5,
  UC1–UC12) and file bugs.
- Expand automated test coverage on the riskiest logic: seat/ticket
  double-booking prevention, promo-code redemption limits, QR validation.

## Phase 6 (Nov 10–16) — Stabilize & release 📍 Final (Nov 16)

- Final regression pass across all four apps, confirm CI is green, help
  write/rehearse the demo script (you're well-placed for this given your
  QA view of the whole system).
