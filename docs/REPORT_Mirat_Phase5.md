# Mirat — Phase 5: organizer analytics and event history

Planned period: October 27–November 9, 2026. Implementation completed November 12, 2026.
Branch: `feature/mirat-phase5`, based on the updated `dev` branch.

## Deliverable

- Replaced the old static analytics prototype with an authenticated organizer dashboard
  backed by `GET /api/events/{id}/analytics`.
- Added event selection, inclusive-start/exclusive-end date filtering, seven-day and
  thirty-day presets, all-time reporting, and ticket-type filtering.
- Added current capacity, active/reserved/remaining inventory and check-in percentage,
  plus period totals for sales, discounts, collections, refunds, net receipts, fees,
  issued tickets and estimated payout.
- Added an accessible daily collected/refunded chart, per-ticket-type results and
  campaign performance. Daily rows are checked against the authoritative totals and a
  visible warning is shown if they do not reconcile.
- Replaced the old static history prototype with an organizer event-history view backed
  by `GET /api/events/{id}/audit-log`. It derives lifecycle status from authoritative
  event fields and displays a newest-first, paginated, append-only activity timeline.
- Connected Analytics and Event history to the shared organizer navigation. Links from
  an event open analytics with that event preselected.

## Data and behavior

- Monetary values are integer minor units from the backend and are labelled as simulated
  KZT. The frontend does not calculate authoritative revenue from browser-side orders.
- Period totals follow the backend's event timezone and half-open date interval. Current
  inventory remains visibly separate from period-scoped financial figures.
- Campaign rows follow the agreed redemption attribution stored at checkout. Refunds
  appear on their refund date.
- Statuses supported by the UI are Draft, Upcoming, Active, Completed, Cancelled and
  Suspended. The current Event API does not yet expose `cancelled_at`; the Cancelled
  state is ready for that field and does not guess cancellation from publication state.
- Audit entries show the recorded actor or System, entity, description and timestamp;
  the interface provides no mutation or deletion action.
- No passwords, JWTs, API keys or analytics secrets are added to the repository.

## Evidence and checks

The final commit and pull request are the evidence links for this report. Verified
locally on November 12, 2026:

- `npm test`: 55 frontend tests passed, including new filter, date-preset,
  reconciliation, chart-scale, lifecycle-status and audit-label tests.
- `npm run lint`: passed.
- `npm run build`: production build passed.
- `git diff --check`: passed.

Docker Desktop was not running during the final automated verification, so the real-data
browser walkthrough remains the first full-system rehearsal step after this branch is
merged with the team's latest demo data.

## Next responsibility

Phase 6: run the full hosted/demo rehearsal with the team, polish the analytics tables
and charts from feedback, fix integration bugs, and prepare the admin-side walkthrough.
