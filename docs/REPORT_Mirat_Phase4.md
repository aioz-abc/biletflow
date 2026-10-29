# Mirat — Phase 4: printable tickets, campaign QR and admin moderation

Planned period: October 13–26, 2026. Implementation completed October 29, 2026.
Branch: `feature/mirat-phase4`, based on the updated `dev` branch.

## Deliverable

- Added a protected server-side PDF ticket endpoint. The canonical PDF includes the
  event, date/time, venue, ticket type, ticket identifier, status and signed admission
  QR, and intentionally contains no payment-card data.
- Added a printable-PDF download to the attendee ticket page without exposing the
  bearer token in an image or download URL.
- Added authenticated Campaign QR preview/download to the organizer campaign table.
  The interface visibly labels it as a campaign link and not an admission ticket.
- Replaced the platform-admin placeholder sections with real user search and
  suspend/restore actions, event search and suspend/restore actions with a mandatory
  reason, and a review queue for paid-sales activation support requests.
- Preserved server-side role checks, refresh-token rotation and tab-scoped sessions.
  Moderation relies on the existing Phase 4 backend authorization and audit trail.

## Security and behavior

- Printable tickets are returned only to the purchaser, event organizer or platform
  administrator and use `private, no-store` caching.
- Campaign and admission QRs use different endpoints, labels, download names and
  purposes. The campaign QR resolves to an event/promo link; it cannot check in a ticket.
- Suspending a user invalidates active sessions. Suspending an event stops public sales
  and campaign redirects while already issued admission tickets remain valid.
- No passwords, JWTs, private keys or payment-card data are committed.

## Local demo

1. Start the backend with `docker compose up --build -d --wait` from the repository root.
2. Start the frontend with `npm ci && npm run dev` in `frontend/`.
3. As an attendee with a confirmed order, open a ticket and download its printable PDF.
4. As an organizer, open `/organizer/campaigns/new`, select an event and display a
   saved campaign's clearly labelled Campaign QR.
5. As a platform admin, open `/admin`, inspect activation requests, search users and
   events, and suspend then restore a disposable test event.

## Evidence and checks

The final commit and pull request are the evidence links for this report. Verified
locally on October 29, 2026:

- `npm run lint`, 28 frontend tests and `npm run build`: passed.
- Ruff lint and format checks: passed.
- Three focused PDF/QR backend tests: passed.
- 84 non-concurrency Django tests: passed in the SQLite fallback environment. The four
  PostgreSQL concurrency tests cannot run on SQLite by design; Docker Desktop's local
  app bundle would not launch, so the standard PostgreSQL run remains a CI/team check.
- Browser against the local Django API: admin login, user list, event suspend/restore,
  activation queue, organizer Campaign QR preview, attendee ticket QR, and printable
  PDF download passed. The disposable event was restored after the moderation test.

## Next responsibility

Run full-system regression testing with the team, verify the final hosted environment,
and prepare the Phase 5 sales analytics dashboard from the agreed analytics contract.
