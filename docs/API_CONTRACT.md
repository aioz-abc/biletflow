# BiletFlow — API Contract (Draft)

Owner: Nursat (Backend/Architecture Lead). Update this as endpoints are
built or change — this is the shared source of truth so Web, Admin, and
Mobile can build against it without waiting on backend implementation.

Status legend: `planned` → `stubbed` (returns fake data) → `done`

## Auth

| Method | Endpoint | Description | Status |
|--------|----------|--------------|--------|
| POST | /auth/register | Register with email | planned |
| POST | /auth/verify-email | Verify email address | planned |
| POST | /auth/login | Sign in | planned |
| POST | /auth/logout | Sign out | planned |
| POST | /auth/reset-password | Request password reset | planned |
| GET | /auth/me | Current user + role | planned |

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
- Auth uses [session/JWT — Nursat to confirm] passed as `Authorization: Bearer <token>`.
- All money amounts are simulated per the SRS (no real payment provider in
  the academic MVP) — represent them in KZT as integers (smallest unit TBD).
