// Helpers for GET /events/{id}/sales (services.sales_summary). Money is tiyn.

// Tickets sold for one event: valid + checked in, summed over ticket types.
export function ticketsSold(sales) {
  return sales.ticket_types.reduce((sum, type) => sum + type.sold, 0)
}

// Dashboard totals over the events whose sales summary loaded.
export function dashboardTotals(events, salesById) {
  const totals = { events: events.length, published: 0, sold: 0, gross: 0, payout: 0 }
  for (const event of events) {
    if (event.published) totals.published += 1
    const sales = salesById[event.id]
    if (!sales) continue
    totals.sold += ticketsSold(sales)
    totals.gross += sales.gross_minor
    totals.payout += sales.estimated_payout_minor
  }
  return totals
}
