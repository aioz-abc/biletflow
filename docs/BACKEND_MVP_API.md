# Backend MVP API

Implemented contract, September 13, 2026. This document supersedes the older
Phase 1 API proposal for the MVP routes listed below. Base: `/api`, JSON, no
trailing slash. Protected requests use `Authorization: Bearer <access>`.
Money is integer tiyn, currency KZT: `250000` means 2,500 KZT. Dates use ISO 8601
with a timezone. Unknown/read-only fields in create/update payloads return 400.

## Accounts

| Method and path | Input / result |
| --- | --- |
| POST `/auth/register` | Email, password, optional first_name/last_name and account_type; 201 with `{user}` |
| POST `/auth/login` | `{email, password}` → `{access, refresh, user}` |
| POST `/auth/refresh` | `{refresh}` → new `{access, refresh}`; old refresh is consumed |
| POST `/auth/logout` | `{refresh}` → 204; invalid/expired/previously revoked tokens return 401 |
| GET `/auth/me` | Current user, roles and organizer_profile |

Organizer registration:

```json
{
  "email": "organizer@example.com",
  "password": "Choose-a-long-private-password!",
  "account_type": "organizer",
  "organizer_profile": {
    "display_name": "Student Events",
    "contact_email": "organizer@example.com",
    "contact_phone": "+77000000000"
  }
}
```

For an attendee, omit account_type and organizer_profile. Organizer accounts
also have attendee capability. Only administrative provisioning can grant
platform_admin (`is_superuser`). Event check-in is owned by the organizer or
platform admin; separate event staff assignment is deferred.

Access tokens last 15 minutes; refresh tokens 7 days. Logout revokes refresh,
while access expires naturally. Inactive accounts cannot log in, refresh or
use protected API routes. Roles and event ownership come from live database
records. Password validation and case-insensitive email uniqueness apply.
Auth routes have a 60/minute per-IP local-cache throttle. Production with
multiple workers needs a shared cache or proxy-level rate limits.
Email verification and password recovery remain unimplemented; publication
does not require verified email in this approved pet-project MVP.

## Events and inventory

| Method and path | Behavior |
| --- | --- |
| GET `/events` | Published events from active organizers |
| POST `/events` | Organizer creates a draft |
| GET `/events/{id}` | Public if published; drafts visible to owner/admin only |
| PATCH `/events/{id}` | Owner/admin updates event |
| DELETE `/events/{id}` | Owner/admin deletes event only if it has no orders |
| POST `/events/{id}/publish` | `{published: true}` or `{published: false}` |
| GET `/events/{id}/ticket-types` | Ticket types; hidden types visible to owner/admin only |
| POST `/events/{id}/ticket-types` | Owner/admin adds a type |
| PATCH `/ticket-types/{id}` | Owner/admin changes type, including `hidden` |
| GET `/me/events` | Organizer's events (all events for platform admin) |
| GET `/events/{id}/attendees` | Owner/admin list of issued tickets and check-in statuses |

Create event:

```json
{
  "title": "Student concert",
  "description": "Live music",
  "venue": "Almaty, Main Hall",
  "starts_at": "2027-01-20T19:00:00+05:00",
  "ends_at": "2027-01-20T21:00:00+05:00",
  "capacity": 100
}
```

Venue is a string for this MVP. Event responses include id, organizer (profile
ID) and published. Capacity must be 1–1,000,000; start must be future when set,
end later than start. An event with any historical orders cannot be deleted.

Create ticket type:

```json
{
  "name": "Standard",
  "price_minor": 250000,
  "quantity": 100,
  "max_per_order": 5,
  "sales_start": null,
  "sales_end": null,
  "hidden": false
}
```

Name and quantity are required; price defaults to zero (free), max_per_order
to 10, hidden to false. Quantity can be zero; max_per_order is 1–100.
Responses include event ID and available, limited by both type inventory and
event capacity. Availability is informational; only reservation guarantees
inventory. Reducing quantity/capacity below sold + active holds returns 409.
Price updates do not change existing orders. Hidden types stop new orders;
already-held tickets may still complete checkout. Sales windows govern new
reservations; a valid hold can complete until its own expiry.

## Orders and simulated payment

| Method and path | Behavior |
| --- | --- |
| POST `/orders` | Create a 15-minute reservation, 201 |
| GET `/orders/{id}` | Purchaser only |
| POST `/orders/{id}/checkout` | Purchaser sends `{outcome: "success"}` or `{outcome: "failure"}` |
| POST `/orders/{id}/cancel` | Purchaser cancels an unconfirmed order, releasing inventory |
| GET `/me/orders` | Purchaser's orders |
| GET `/me/tickets` | Purchaser's issued tickets |

Create order (IDs refer to existing records):

```json
{"event": 1, "items": [{"ticket_type": 1, "quantity": 2}]}
```

At most 20 distinct types and 100 tickets per order, further limited by each
type's max_per_order. All types must belong to the event and be on sale.
Client prices/totals are rejected. Reservation expires after 15 minutes or at
event start, whichever is earlier. Expired holds stop counting immediately;
no periodic job is needed. API status is `pending`, `expired`, `cancelled` or
`confirmed`; expired is derived from the timestamp.

Orders return id, event, status, total_minor, currency, expires_at, created_at,
confirmed_at, items (`ticket_type`, `quantity`, `unit_price_minor`) and tickets.
Failed simulated payment leaves a pending reservation and issues no tickets;
retry before expiry or cancel it. Success confirms the order and issues one
ticket per unit. Free orders use the same checkout endpoint without a Payment
record. Repeated/concurrent successful checkout of the same order returns the
existing tickets. The order ID is the checkout idempotency boundary; creating
another order is a separate purchase. Every order/inventory mutation locks
the event in PostgreSQL. Confirmed orders cannot be cancelled/refunded in this MVP.

This API performs no real charge. The client-selected outcome exists only for
the demo. A real provider requires server-verified payment confirmation.

## Admission tickets

| Method and path | Behavior |
| --- | --- |
| GET `/tickets/{id}` | Purchaser, event owner or platform admin only |
| GET `/tickets/{id}/qr` | Same authorization; SVG QR image, private/no-store |
| POST `/tickets/verify` | Owner/admin sends `{qr_token: "scanned text"}`; returns `{valid, ticket}` |
| POST `/tickets/check-in` | Owner/admin sends scanned token; atomically marks checked_in |
| POST `/tickets/{id}/verify` | Same verification, additionally binds token to numeric ID |
| POST `/tickets/{id}/check-in` | Same check-in, additionally binds token to numeric ID |

Ticket response contains id, identifier (UUID), event, ticket_type, status,
issued_at, checked_in_at, qr_token. The QR encodes a UUID signed with a dedicated
admission salt. It is an admission credential: keep it private. Unpublishing an
event stops sales but does not cancel already-issued tickets. Verification is
read-only; check-in rejects a repeated scan with 409 and records operator/time.
There is no check-in time window in the MVP; authorized organizers may test
admission before the event. Individual holder details and undo are deferred.

## Errors and pagination

400 invalid data or QR, 401 missing/invalid authentication, 403 missing organizer
capability, 404 missing/inaccessible record, 409 unavailable inventory or invalid
state, 429 auth throttle. Errors use DRF field errors or `{detail: ...}`.
Lists use `{count, next, previous, results}` with 20 items/page and `?page=2`.
Authenticated clients must not cache/share private ticket or token responses.

## Run and verify

```sh
docker compose up --build -d --wait
docker compose exec -T web python manage.py test --noinput
docker compose exec -T web python demo_mvp.py
```

The demo makes real HTTP requests, creates two fresh accounts and a published
event, purchases a ticket, verifies it, checks it in and confirms duplicate
check-in is rejected. It leaves those demo records in the local database.
It prints record IDs, never credentials. Run `python backend/demo_mvp.py`
from the host too (Python 3.11+); `--base-url` selects another local API port.

Existing Docker Compose is a local development deployment. No public host has
been deployed. Production requires a private key, TLS, production WSGI server,
explicit hosts, shared throttling and database backups. Keep API and frontend
on the same origin via a proxy, or configure an explicit CORS allowlist during
frontend integration. Django admin retains its own session authentication.
