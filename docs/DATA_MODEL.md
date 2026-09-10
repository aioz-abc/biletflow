# BiletFlow — Data Model Draft v1

Owner: Nursat; review with Aizhan before domain migrations. Only User and
OrganizerProfile are implemented in Phase 1. Every other entity below is a
design proposal for the teammate/phase that owns the feature.

## Implemented account foundation

| Entity | Key fields | Relationships and rules |
| --- | --- | --- |
| User | id, email, password hash, first_name, last_name, email_verified_at, is_active, is_staff, is_superuser, date_joined | Email is the login, normalized to lowercase with surrounding whitespace removed; case-insensitive uniqueness is enforced in the DB. No separate username. Verification does not imply staff access. |
| OrganizerProfile | id, user, display_name, contact_email, contact_phone, payout_reference, created_at, updated_at | One profile per User. Payout reference is an opaque simulation identifier, not bank/card data or proof of activation. |

IDs use Django BigAutoField. Never treat a predictable ID as authorization.
New user passwords and password changes must use `set_password`; public
endpoints must additionally invoke Django password validation in Phase 2.
User suspension uses `is_active=False`. Normal product interfaces should
deactivate accounts instead of deleting historical transaction owners.

Business roles can overlap. Attendee is available to every active account;
Organizer comes from its profile; Event Admin will come from event-specific
StaffAssignment; Platform Admin maps to `is_superuser` for this MVP.

## Required domain entities — planned

| Entity | Main fields | Relationships / constraints |
| --- | --- | --- |
| Venue | name, address | Referenced by Event; physical venues only. |
| Event | organizer, venue, title, description, category, images, starts_at, ends_at, timezone, registration_opens_at, registration_closes_at, capacity, publication_status, visibility, cancelled_at, refund_policy | OrganizerProfile → many Events. Visibility: public/unlisted/private. Publication: draft/published. Upcoming/active/completed is derived from dates; cancellation overrides it. Duplication copies configuration only. |
| TicketType | event, name, description, price_minor, quantity, sales_start, sales_end, max_per_order, hidden | Event → many types. Free means price 0. Preserve sold types instead of deleting them. |
| Order | purchaser, event, status, subtotal_minor, discount_minor, fee_minor, total_minor, currency, expires_at, created_at | User/Event → many orders. Proposed MVP requires a purchaser account, pending team agreement. Pending/confirmed/expired/cancelled/refunded; successful free registration also confirms an order. |
| OrderItem | order, ticket_type, quantity, unit_price_minor, discount_minor | Preserve purchase-time amounts even after a ticket price changes. Validate type belongs to order's event. Pending items reserve inventory until Order.expires_at. |
| Attendee | order_item, name, email | Ticket-holder details are separate from purchaser User. A buyer may buy for several attendees; one holder per issued ticket. |
| Ticket | order_item, attendee, identifier, qr_token_digest, status, issued_at | One unique admission identifier per ticket. valid/checked_in/cancelled/refunded. PDF and digital copies reference the same ticket. |
| Payment | order, idempotency_key, amount_minor, currency, status, simulation_reference, created_at | Sandbox/simulation only. Idempotency key unique; repeated confirmation must not issue extra tickets. Free orders do not require payment. |
| Refund | order, payment, initiated_by, amount_minor, status, created_at | Basic full refunds; at most one successful full refund per payment. Successful refund invalidates associated tickets and records an audit entry. |
| PayoutAccount | organizer, simulation_reference, status | No real banking details. Profile's Phase 1 placeholder can migrate here when activation is built. |
| PaidSalesActivation | event, payout_account, fee_minor, fee_status, verification_status, terms_accepted_at, status | One per event, with simulated identity/fee/payout checks. Required by SRS 4.5 despite omission from its entity list. Paid checkout requires active activation and an unsuspended event. |
| StaffAssignment | event, user, can_check_in, can_undo_check_in, can_manage_support | Unique (event, user). Authorization checks both capability and event relationship. |
| CheckInRecord | ticket, staff_user, checked_in_at, reversed_at, reversed_by | At most one unreversed check-in per ticket, enforced by partial unique constraint. Retain reversal history. |
| Notification | recipient, kind, context, delivery_status, created_at | Verification, orders, refunds, event updates and support changes. Console email is a development adapter; no notification workflow exists in Phase 1. |
| SupportCase | requester, event, order, ticket, category, assigned_to, status, created_at | Context links optional but must be consistent and authorized. open/in_progress/waiting_for_customer/resolved. Organizer-to-platform cases supported too. |
| SupportMessage | case, author, body, created_at | Access inherits the case. REST polling is sufficient. |
| PromotionalCampaign | event, name, discount_type, discount_value, starts_at, ends_at, max_redemptions, enabled | Percentage or fixed minor-unit discount; applicable TicketTypes must belong to the event. |
| PromoCode | campaign, code, link_token_digest | Unique normalized code and opaque campaign-link token. Campaign links are not admission credentials. |
| PromoRedemption | campaign, promo_code, order, discount_minor, redeemed_at | Exact attribution; an order cannot redeem twice. Count enforcement and checkout confirmation must share a transaction. |
| AuditLog | event, actor, action, entity_type, entity_id, description, created_at | Append-only via product interfaces. Record changes when features are built, so later history has real data. |

Money values are integer **tiyn** (1 KZT = 100 tiyn); for example, a 2,500 KZT
ticket is `250000`. Use no binary floating-point arithmetic. Store currency
`KZT` and purchase-time totals, not values recalculated from current prices.
This is a proposed shared API convention, not a requirement stated by SRS.

Timestamps are timezone-aware, stored as UTC instants; API uses ISO 8601.
Events retain an IANA timezone (default `Asia/Almaty`) for display/export.
Use `PROTECT` for transactional references and retain cancelled/refunded data.
Amounts and quantities must be nonnegative; checkout quantities positive;
end times later than starts. Validate cross-entity event relationships on
the server rather than trusting supplied IDs.

## Transaction boundaries to implement with Aizhan

1. **Reservation:** lock the Event first, then affected TicketTypes in a stable
   order, check event capacity, sales windows, confirmed quantities and unexpired pending
   reservations, then create Order/Items atomically. Expired holds no longer
   count even if a cleanup task has not run.
2. **Checkout:** lock the Event first, then the order and affected inventory,
   reject expired holds
   and inactive paid sales, calculate totals and promo availability on the
   server, then confirm payment/order, redemption and ticket issuance
   atomically and idempotently. Failed payment never creates valid tickets.
3. **Check-in:** authorize staff for this ticket's event, lock the ticket,
   reject cancelled/refunded/already-used tickets, and write status plus
   CheckInRecord and AuditLog together. Undo retains the original record.
4. **Refund/cancellation:** enforce the policy and authorization, make repeat
   requests safe, invalidate tickets and append audit events in the same
   transaction. Notifications follow successful commits.

These are design constraints, not claims that race conditions have already
been solved. Concurrency tests belong with their Phase 3/4 implementations.
The initial event-level lock serializes purchases across different ticket
types as well, preventing them from jointly exceeding a shared event capacity.
All inventory-changing paths (including refunds and capacity edits) must
follow the same lock order. This deliberately simple per-event serialization
can be narrowed only if measured checkout throughput requires it.

## Bonus assigned seating — not implemented

VenueSection → Row → Seat describes one predefined venue layout. Seat stores
number, accessibility and price category. SeatHold links event, seat, order
and expiry; availability belongs to **(event, seat)**, not the venue seat
globally. Tickets and OrderItems retain section/row/seat snapshots. Enforce
one sale per (event, seat), including concurrent checkouts. No visual editor.

## Team handoff

Aizhan owns Event/TicketType/Order/Payment/Refund business models and logic;
Nursat reviews shared schema, authorization and concurrency. Mirat consumes
canonical records for PDFs, analytics, campaigns and audit views; analytics
do not collect extra checkout data. Abylai consumes event-scoped staff and
check-in APIs. Anvar consumes organizer/attendee APIs. This draft has not
yet been peer-reviewed or approved by those teammates.
