# Mirat — Phase 3: Organizer campaigns and analytics groundwork

Planned period: September 29–October 12, 2026. Implementation prepared October 15.
Branch: `feature/mirat-phase3`, based on the updated `dev` branch.

## Deliverable

`/organizer/campaigns/new` now creates real campaigns through the existing Django
API instead of displaying the Phase 1 preview. The shared React frontend and
existing backend contract are preserved.

- Organizer/platform-admin login, server role validation, tab-scoped session,
  refresh-token rotation, logout and clear error handling.
- Real managed events from `/api/me/events`, including drafts; ticket types and
  saved campaigns fetched for the selected event. All pagination pages are read
  using same-origin numbered URLs; API-supplied absolute next URLs are not trusted.
- Name, percentage/fixed discount, dates, redemption limit, and multiple applicable
  ticket types. No selected types means all; blank redemption limit means unlimited.
- Fixed discounts entered in KZT convert exactly to integer tiyn. Dates are labelled
  with the browser timezone and converted to UTC ISO timestamps for the backend.
- Confirmation uses the saved server record and promo code. Persisted campaigns
  can be reloaded, including after a browser reload and reselecting the event.
- Submit blocked during creation; no automatic retry after network/5xx failure.
  An uncertain outcome requires checking the persisted list before another submit.
- Server validation errors, empty event/type lists, access denial and network failures
  are shown. Changing events discards the form and ignores late responses.
- Removed development phase/date/name labels from the real admin sidebar.

See [analytics requirements](ANALYTICS_REQUIREMENTS.md) for definitions, existing
API coverage, proposed aggregation contract, edge cases and questions for Aizhan.
The proposal is ready for review; teammate agreement is not claimed as completed.

## Scope

Campaign backend enforcement already exists and is Aizhan's responsibility.
Campaign QR, editing/disabling campaigns, printable tickets and full analytics
charts are not required for this Phase 3 deliverable. Existing analytics/history
prototype routes remain clearly labelled as examples. The campaign portal has
its own session key so it does not overwrite the platform-admin or attendee session;
a future shared frontend auth provider can consolidate these flows.

## Local demo

1. Start Docker Desktop, then run `docker compose up --build -d --wait` at repo root.
2. Use an organizer account with an event and ticket types. An existing platform
   admin can also select any event; an ordinary attendee/event scanner cannot.
3. In `frontend/`: `npm ci`, `npm run dev`. Open `/organizer/campaigns/new` on Vite's URL.
4. Sign in, choose the event, enter name/discount/start/end/limit, select ticket types,
   and submit. Confirm the returned campaign ID/code and the saved-list row.
5. Reload, reselect the event, and check the saved campaign. Create a fixed-discount
   example (19.99 ₸ becomes 1999 tiyn) and an all-types/unlimited example.
6. Try a reversed date range, percentage above 100 and an attendee login. Verify the
   errors, then log out. No secret or shared demo password is included in the repository.

## Checks

Verified locally on October 15, 2026:

- `npm run lint`, `npm test` (17 tests), and `npm run build`: passed.
- Docker/PostgreSQL: `python manage.py test accounts ticketing --noinput`
  inside the web container: 63 tests passed.
- Real HTTP integration: organizer login, event/type loading, fixed and percentage
  campaign creation, persisted retrieval, invalid percentage rejection, unrelated
  organizer access denial, and attendee role rejection passed.
- Browser against the Docker backend: organizer login, reversed-date validation,
  campaign creation with selected ticket type and limit, returned promo code,
  persistence after reload/session restoration, and logout passed.
- Campaign page visually inspected. Demo records use disposable local accounts;
  no credentials are committed.

## Next steps

Discuss and approve the analytics contract with Aizhan, then schedule aggregation
API work for the Phase 5 dashboard. Phase 4 covers printable tickets, Campaign QR
and admin moderation according to `PLAN_Mirat.md`.
