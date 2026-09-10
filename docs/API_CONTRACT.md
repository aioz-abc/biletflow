# BiletFlow — API Contract v1 (Draft)

Owner: Nursat (Backend/Architecture Lead). Update this as endpoints are
built or change — this is the shared source of truth so Web, Admin, and
Mobile can build against it without waiting on backend implementation.

Status legend: `planned` → `stubbed` (returns fake data) → `done`

Phase 1: only the health endpoint is implemented. Auth below is a concrete
proposal for Phase 2; other domain sections remain the team's endpoint
inventory. Review auth with Nursat/Aizhan and the client developers before
parallel implementation. `planned` routes currently return 404, not mock data.

## Shared conventions

- Local base URL: `http://localhost:8000/api`. Tables below omit `/api`.
- API paths have no trailing slash. Requests/responses use JSON and UTF-8.
- Use `Content-Type: application/json` on requests with JSON bodies.
- IDs are positive integers; timestamps are ISO 8601 with a timezone,
  normally UTC (`2026-09-14T09:00:00Z`). Date fields use `YYYY-MM-DD`.
- Monetary fields use integer tiyn, indicated by `_minor`; 2,500 KZT is
  `250000`. Currency is `KZT`. Values are server-calculated simulations.
- Proposed list shape: `{"count": 1, "next": null, "previous": null, "results": []}`,
  with `?page=1`, default 20 records/page. List pagination is not implemented yet.
- Planned validation errors follow DRF's field mapping:
  `{"email": ["Enter a valid email address."]}` or
  `{"non_field_errors": ["The request is inconsistent."]}`.
  Other errors use `{"detail": "..."}`. Clients branch on HTTP status and
  field keys, not translated message text.
- Common statuses: 400 invalid input, 401 missing/invalid authentication,
  403 authenticated but forbidden, 404 missing or inaccessible resource,
  409 business-state conflict, 429 throttled, 503 temporarily unavailable.
  Not all of these are implemented by the Phase 1 health endpoint.
- Never accept a client's prices, discounts, staff flags or verification
  status as authoritative. Object access must check event ownership or a
  StaffAssignment, not just a role name.

## Health (implemented)

`GET /health` — public, no credentials required.

- 200: `{"status": "ok", "database": "ok"}`
- 503 on database connection/query failure:
  `{"status": "unavailable", "database": "unavailable"}`
- No database connection details or exception messages are returned.

## Auth

| Method | Endpoint | Description | Status |
|--------|----------|--------------|--------|
| POST | /auth/register | Register with email | planned |
| POST | /auth/verify-email | Verify email address | planned |
| POST | /auth/login | Sign in | planned |
| POST | /auth/refresh | Rotate refresh and issue access token | planned |
| POST | /auth/logout | Sign out | planned |
| POST | /auth/reset-password | Request password reset | planned |
| POST | /auth/reset-password/confirm | Confirm password reset | planned |
| GET | /auth/me | Current user + role | planned |

### Authentication and account payload

Proposed JWT scheme: send `Authorization: Bearer <access>` for protected API
requests. Access lifetime 15 minutes; refresh lifetime 7 days. Refresh tokens
rotate and old refresh tokens are blacklisted. Access tokens are not revoked
instantly on logout; they expire after at most 15 minutes. Login/refresh and
protected endpoints check live `is_active`. Password reset must invalidate
existing sessions/tokens; Phase 2 must choose and test the revocation mechanism.
Role changes must take effect from database state, not stale JWT role claims.
Django admin uses a separate session + CSRF and is not this JWT API.

Public auth operations require throttling in Phase 2. Verification/reset
messages contain short-lived, single-use credentials and are sent through
email (console email in local development); tokens must not be returned in
normal API responses or logged by request-body logging. Proposed expiry:
verification 24 hours, password reset 1 hour. Reissuing invalidates the old token.

The common user response is:

```json
{
  "id": 1,
  "email": "nursat@example.com",
  "first_name": "Nursat",
  "last_name": "",
  "email_verified": false,
  "roles": ["attendee", "organizer"],
  "organizer_profile": {
    "id": 1,
    "display_name": "Student Events",
    "contact_email": "events@example.com",
    "contact_phone": ""
  }
}
```

`organizer_profile` is null for an attendee without a profile. `roles` is an
array because capabilities overlap: attendee, organizer, event_admin,
platform_admin. Event Admin is derived from event assignments; it never
grants access to every event. Payout references and password hashes are
excluded from this common response. `email_verified` derives from the
User.email_verified_at timestamp.

### POST /auth/register

Public request:

```json
{
  "email": "nursat@example.com",
  "password": "a-strong-example-password",
  "first_name": "Nursat",
  "last_name": "",
  "account_type": "organizer",
  "organizer_profile": {
    "display_name": "Student Events",
    "contact_email": "events@example.com",
    "contact_phone": ""
  }
}
```

- Required: email and password. Optional names default to empty strings;
  account_type defaults to `attendee` and accepts only attendee/organizer.
- Organizer registration requires display_name and contact_email in
  organizer_profile. Attendee registration must omit organizer_profile.
- Email is trimmed and lowercased; case variants cannot create duplicates.
  Validate passwords using Django validators (minimum 8 characters plus
  similarity/common/numeric checks); never store plaintext passwords.
- Create user/profile atomically; queue verification only after commit.
- 201: `{"user": <common user>, "detail": "Verification email sent."}`.
  No login tokens until the explicit login operation.
- 400: invalid email/password, duplicate email, inconsistent profile, or
  privilege/unknown fields such as `is_superuser`, `roles`, `email_verified`.

### POST /auth/verify-email

- Public input: `{"uid": "<encoded-user-id>", "token": "<email-token>"}`.
- 200: `{"detail": "Email verified."}`; record email_verified_at.
- 400: malformed, expired, invalid or already-used credentials, with the
  same generic message. Use a verification-specific token purpose so reset
  credentials cannot verify email or vice versa.

### POST /auth/login

- Public input: `{"email": "nursat@example.com", "password": "..."}`.
- 200: `{"access": "<jwt>", "refresh": "<jwt>", "user": <common user>}`.
- 401: same generic invalid-credentials message for unknown email,
  wrong password or suspended account.
- Unverified active accounts may log in to their account; publishing an
  event requires verified email. No client may bypass this server-side rule.

### POST /auth/refresh

- Public bearer-auth exemption; the supplied refresh token is the credential.
- Input: `{"refresh": "<refresh-jwt>"}`.
- 200: `{"access": "<new-access>", "refresh": "<new-refresh>"}`.
- 400 for malformed input; 401 for expired/revoked tokens or inactive user.
  A rotated refresh token must not be reusable.

### POST /auth/logout

- Input: `{"refresh": "<refresh-jwt>"}`. The refresh token itself is the
  credential; access need not still be valid. Revoke only that login's refresh.
- 204 with no body after revocation, including repeat revocation of a valid
  signed token. Malformed body: 400; invalid signature/token type: 401.
- Clients clear credentials immediately, and never persist browser tokens
  in localStorage by default. Agree browser memory/session persistence and
  secure mobile storage with the client owners during Phase 2 integration.

### POST /auth/reset-password

- Public input: `{"email": "nursat@example.com"}`.
- 200: `{"detail": "If the account exists, a reset email has been sent."}`
  for both known and unknown addresses. Send only to eligible active users;
  keep the same response for suspended accounts.
- 400 for syntactically invalid email. Prevent account enumeration through
  response differences and rate-limit repeated requests.

### POST /auth/reset-password/confirm

- Public input:
  `{"uid": "<encoded-user-id>", "token": "<reset-token>", "new_password": "..."}`.
- 200: `{"detail": "Password reset. Sign in again."}`.
- 400: expired/used/invalid token or invalid new password.
- Change the hash, consume the credential, revoke existing authentication,
  and require fresh login. Do not automatically verify the email or log in.

### GET /auth/me

- Requires a valid access token and active account.
- 200: the common user object directly (no `user` wrapper).
- 401 for missing, invalid, expired authentication or suspended account.

## Events

| Method | Endpoint | Description | Status |
|--------|----------|--------------|--------|
| GET | /events | List events (public/organizer-scoped) | planned |
| POST | /events | Create event | planned |
| GET | /events/:id | Event details | planned |
| PATCH | /events/:id | Edit event | planned |
| POST | /events/:id/publish | Publish/unpublish | planned |
| POST | /events/:id/duplicate | Duplicate as draft | planned |

## Ticket Types & Inventory

| Method | Endpoint | Description | Status |
|--------|----------|--------------|--------|
| GET | /events/:id/ticket-types | List ticket types | planned |
| POST | /events/:id/ticket-types | Create ticket type (free/paid) | planned |
| PATCH | /ticket-types/:id | Edit / hide ticket type | planned |
| GET | /events/:id/seatmap | Assigned-seating layout (if applicable) | planned |

## Orders & Checkout

| Method | Endpoint | Description | Status |
|--------|----------|--------------|--------|
| POST | /orders | Start order (reserve inventory/seats) | planned |
| POST | /orders/:id/checkout | Submit payment (sandbox/simulated) | planned |
| GET | /orders/:id | Order status/details | planned |
| GET | /me/orders | Attendee's own orders | planned |
| POST | /orders/:id/cancel | Cancel free registration | planned |
| POST | /orders/:id/refund | Initiate refund | planned |

## Tickets

| Method | Endpoint | Description | Status |
|--------|----------|--------------|--------|
| GET | /tickets/:id | Ticket details/status | planned |
| GET | /tickets/:id/pdf | Print-optimized PDF | planned |
| POST | /tickets/:id/verify | Validate QR at check-in (mobile) | planned |
| POST | /tickets/:id/check-in | Record check-in | planned |
| POST | /tickets/:id/undo-check-in | Reverse check-in | planned |

## Paid Sales Activation

| Method | Endpoint | Description | Status |
|--------|----------|--------------|--------|
| GET | /events/:id/activation | Activation checklist status | planned |
| POST | /events/:id/activation | Submit activation (fee + payout info, sandbox) | planned |

## Promo Codes & Campaigns

| Method | Endpoint | Description | Status |
|--------|----------|--------------|--------|
| POST | /events/:id/campaigns | Create promo campaign | planned |
| GET | /events/:id/campaigns | List campaigns + redemption stats | planned |
| POST | /campaigns/:code/apply | Validate + apply promo code to order | planned |

## Admin

| Method | Endpoint | Description | Status |
|--------|----------|--------------|--------|
| GET | /admin/users | Search users | planned |
| GET | /admin/events | Search/moderate events | planned |
| POST | /admin/events/:id/suspend | Suspend event | planned |
| GET | /admin/activations | Review activation requests | planned |
| GET | /admin/reports | Operational reports export | planned |

## Analytics

| Method | Endpoint | Description | Status |
|--------|----------|--------------|--------|
| GET | /events/:id/analytics | Sales, check-ins, campaign performance | planned |

## Support Cases

| Method | Endpoint | Description | Status |
|--------|----------|--------------|--------|
| POST | /support-cases | Open a support case | planned |
| GET | /support-cases/:id | Case + message thread | planned |
| POST | /support-cases/:id/messages | Post message | planned |
| PATCH | /support-cases/:id | Change status/assignment | planned |

## Notes for Frontend/Mobile/Admin devs

- Until an endpoint is `stubbed` or `done`, build your UI against this
  shape and mock the response locally.
- Phase 2 auth uses the JWT proposal above; it is not available in Phase 1.
- All money amounts are simulated per the SRS (no real payment provider in
  the academic MVP) — use integer tiyn with currency `KZT` as defined above.
- For request/response shapes outside Auth, coordinate with the feature
  owner; an endpoint row alone is not a complete payload contract.
