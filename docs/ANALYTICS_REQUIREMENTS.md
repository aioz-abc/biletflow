# Organizer analytics — Phase 3 data requirements

Prepared by Mirat, October 15, 2026, for Phase 3 (September 29–October 12).
Status: proposed contract for discussion with Aizhan; not approved or implemented
merely because it appears in this document. Phase 5 builds the real dashboard.

## Existing backend and gaps

All paths below include `/api`; bearer authentication is required.

| Existing source | What it currently provides | Gap for the dashboard |
| --- | --- | --- |
| GET `/me/events` | Organizer-owned events (all events for platform admin) | No aggregate dashboard |
| GET `/events/{id}` | Event capacity and metadata | No combined occupancy snapshot |
| GET `/events/{id}/ticket-types` | Ticket quantities, prices and available inventory | Remaining counts are capacity-capped per type: never sum them |
| GET `/events/{id}/sales` | Payments, discounts, refunds, fees, payout, per-type sales/inventory | All-time only; no date filters or daily series |
| GET `/events/{id}/campaigns` | Campaign codes, redemptions, orders, active tickets, money totals | No date-range segmentation |
| GET `/events/{id}/audit-log` | Paginated activity records | Not an analytics aggregate |

Important naming mismatch: `sales.gross_minor` sums Payment.amount_minor, which
is the amount collected AFTER discounts. Campaign `report.gross_minor` uses
order subtotals BEFORE discounts. Do not combine these as the same metric.
Existing responses must retain their meaning; use explicit names in new APIs.

## Proposed endpoint (not present in current backend)

GET `/api/events/{id}/analytics?from=2026-11-01&to=2026-12-01&ticket_type=7`

- Only the event owner or platform admin; event-scanner role alone is not enough.
  Use the same managed-events scope as campaigns and return 404 for inaccessible events.
- Dates are calendar dates in Asia/Almaty. `from` inclusive, `to` exclusive;
  convert boundaries to aware timestamps on the backend. Require both or neither.
  No dates means all-time totals. Return 400 for invalid/reversed dates, another
  event's ticket type, or an excessive interval (proposed maximum: 366 days).
- Optional `ticket_type` filters sales and ticket aggregates. Whole-event capacity
  must remain explicitly separate from filtered type inventory.
- Inventory is a CURRENT snapshot, independent of the sales date filter. Return
  `as_of` so the UI does not imply historical remaining capacity.
- Money is integer tiyn, currency KZT (100 tiyn = 1 tenge). All amounts simulated.
  Dates/timestamps ISO 8601; counts integers; empty totals zero, not null.

## Metric definitions to agree

| Metric | Proposed definition |
| --- | --- |
| capacity | Event's current admission capacity |
| issued_tickets | All tickets issued from successful confirmations, including free tickets; exclude pending/failed orders |
| active_tickets | Tickets with status valid or checked_in; refunded/cancelled tickets excluded |
| reserved_tickets | Unexpired pending reservations, using the same rules as checkout |
| remaining | Current effective sellable inventory respecting event capacity, active tickets, valid reservations, and type limits; compute server-side using canonical inventory logic |
| sales_before_discount_minor | Purchase-time unit price × quantity for successful orders; never current ticket prices |
| discount_minor | Discount actually granted on successful orders |
| collected_minor | Sales before discount minus granted discount; successful payment/confirmation amounts only |
| refunded_minor | Refund transactions in the selected period by refund timestamp |
| net_receipts_minor | Collected in period minus refunded in period, before processing fees; can be negative |
| fees_minor | Processing fees; expose separately from net receipts |
| checked_in | Current active tickets marked checked_in |
| check_in_percent | checked_in / active_tickets × 100; zero if denominator is zero |

Free confirmations count toward issued/active tickets but add zero money.
An order refunded next month stays in its original sale-day series; its refund
appears on the actual refund day. Therefore period refunds can exceed period
collections. Expose active inventory separately from historical issuance.

For orders containing multiple ticket types, propose proportional allocation of
order-level discounts, refunds and fees by purchase-time line subtotal, with
integer rounding and deterministic remainder allocation by line ID. All
allocated amounts must reconcile exactly to the order totals; zero-subtotal
orders allocate zero. Aizhan should confirm or propose another rule before
filtered revenue is implemented.

## Proposed response shape

```json
{
  "event": 1,
  "currency": "KZT",
  "timezone": "Asia/Almaty",
  "simulated": true,
  "as_of": "2026-11-15T10:00:00Z",
  "filters": {"from": "2026-11-01", "to": "2026-12-01", "ticket_type": null},
  "inventory": {"capacity": 200, "active_tickets": 120, "reserved_tickets": 5, "remaining": 75},
  "totals": {"issued_tickets": 125, "sales_before_discount_minor": 62500000, "discount_minor": 2500000, "collected_minor": 60000000, "refunded_minor": 2500000, "net_receipts_minor": 57500000},
  "daily": [{"date": "2026-11-01", "issued_tickets": 0, "collected_minor": 0, "refunded_minor": 0}],
  "ticket_types": [],
  "campaigns": []
}
```

Example only. Daily series must contain EVERY day in the requested interval,
chronologically ordered, including zero-sale days (example above abbreviates it).
Daily sums must equal the corresponding period totals. Type rows should carry
ID/name, issued tickets and allocated money. Campaign rows should carry ID/name,
redemptions, unique orders, active tickets, pre-discount sales, discounts,
collections and refunds; label their scope and timestamp rule explicitly.

## Acceptance cases for backend/frontend integration

1. Empty event gives zero totals and a complete zero-filled series.
2. Free tickets change counts and inventory but not revenue.
3. Mixed ticket-type order with promo reconciles to its original order totals.
4. Failed checkout and expired reservation do not increase sales.
5. Refund on a later date changes that day's refunds and current inventory.
6. Concurrent reservation/checkout cannot produce negative available inventory.
7. Another organizer and event staff receive no analytics for a foreign event.
8. Day boundaries around midnight in Almaty assign each transaction once.
9. Campaign and event reports use explicitly named, reconcilable money measures.
10. Type filters never label the type's remaining quota as whole-event capacity.

## Handoff questions for Aizhan

- Confirm the proposed endpoint, field names, dates, allocation and inventory rules.
- Confirm whether historical issued counts include later-voided tickets and whether
  fees/refunds should also offer a sale-cohort view in addition to cash-flow dates.
- Agree on delivery of stubbed and implemented aggregation endpoints before Phase 5.

This document is the prepared handoff. No teammate contact or sign-off has been
performed automatically; agreement remains a team coordination step.

## Backend review (Aizhan, October 29, 2026)

Checked against the code on `dev` at `c8f22ae` (`ticketing/models.py`,
`services.py`). The endpoint, access rule, date rules, money units, response
shape and acceptance cases are **agreed as written**, with the changes below.
Each answer says what the code does today, so the dashboard numbers follow
real behaviour rather than an assumption.

### Facts from the code that the definitions must follow

- **Refunds are always full and per order.** `refund_order` creates one
  `Refund` per `Payment` with `amount_minor = payment.amount_minor`; there is
  no partial refund. A refunded order's tickets all become `refunded`.
- **Free orders have no `Payment`.** They are cancelled, not refunded: the
  order and its tickets become `cancelled`, and no money row is written.
- **A checked-in ticket is never voided afterwards.** Both refund and cancel
  refuse an order with a checked-in ticket.
- **A refunded order's fee is not charged.** `sales_summary` sums
  `fee_minor` only for payments without a refund.
- **A campaign may apply to only some ticket types** (`campaign.ticket_types`;
  empty means all), and `discountable()` takes the discount only from those
  lines. **These types can be edited after redemptions** (`PATCH
  /campaigns/{id}` accepts `ticket_types`).
- **Inventory is held by order quantities, not tickets.** `reserved(event,
  type)` counts confirmed orders plus unexpired pending ones; a cancel or
  refund releases the seats by changing the order status.

### Answers to the handoff questions

1. **Endpoint, fields and dates:** agreed. Use `managed_events()` for the
   404 scope, as campaigns do. Dates follow `TIME_ZONE = "Asia/Almaty"`, which
   is already the project setting. The 366-day limit is fine.

2. **Which timestamp puts an amount on a day:**
   - sale, discount and issued tickets: `Order.confirmed_at`. For paid orders
     `Payment.created_at` falls in the same transaction; `confirmed_at` also
     covers free orders, which have no payment;
   - refund: `Refund.created_at`;
   - fee: charged on the sale day and **reversed on the refund day**. So
     `fees_minor` for a period = fees of payments confirmed in it − fees of
     payments refunded in it. Summed over all time this equals `sales_summary`.
   - A cancelled free registration changes no money and no daily series, only
     the current `inventory` and `active_tickets` (there is no `cancelled_at`).

3. **Do historical issued counts include later-voided tickets?** **Yes.**
   `issued_tickets` counts every ticket created by a confirmation in the
   period, whatever its status now. `active_tickets` is the separate current
   count. This keeps a past day's numbers from changing after a refund.

4. **Sale-cohort view for refunds and fees:** **not in Phase 5.** Cash-flow
   dates only, as proposed. A cohort view can be added later without new data,
   because `Refund → Payment → Order.confirmed_at` already links them.

5. **Allocation across ticket types** — changed from the proposal:
   - **Discount:** split only across the lines the campaign applied to
     **at checkout**, in proportion to their line subtotal
     (`unit_price_minor × quantity`). Lines the campaign did not cover get 0.
     Splitting across all lines would give a VIP-only discount partly to
     General admission.
   - **Because campaign types are editable, the split cannot be recomputed
     later.** I will store it at checkout: a new `OrderItem.discount_minor`,
     with existing orders backfilled from the campaigns as they are now
     (only seed and test data exist). Then the filtered revenue simply sums
     stored line values, and lines always reconcile to the order.
   - **Refund:** no proportional rule is needed. Refunds are full, so a line's
     refund = its collected amount (line subtotal − line discount).
   - **Fee:** order-level, split in proportion to each line's collected
     amount.
   - **Rounding** (discount and fee): floor each share, then give the
     leftover tiyn one at a time to the largest fractional parts, ties to the
     lower `OrderItem.id`. Shares then always add up exactly to the order value.

6. **Inventory:** compute `remaining` with the existing `reserved()` helper,
   so it can never disagree with checkout. With `ticket_type`, return that
   type's `quantity − reserved(event, type)` as `type_remaining`, next to
   the whole-event `remaining`, never in its place (acceptance case 10).

7. **Naming:** agreed. Existing responses keep their fields. The new endpoint
   uses only `sales_before_discount_minor`, `discount_minor`,
   `collected_minor`, `refunded_minor`, `fees_minor` and
   `net_receipts_minor`, never a bare `gross_minor`.

### Delivery

- **Aizhan:** `OrderItem.discount_minor` (migration, backfill, tests) and the
  `GET /events/{id}/analytics` endpoint. First a stub that returns the agreed
  shape with zero-filled data, so the dashboard can be built against it, then
  the real aggregation with acceptance cases 1–10 as backend tests.
- **Mirat:** the dashboard views, built against the stub first.
- Dates to be agreed in the next team sync.
