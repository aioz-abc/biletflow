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
