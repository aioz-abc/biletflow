// Ticket-holder names at checkout (SRS 4.6). One optional name per ticket; tickets
// left blank are held by the buyer, which is also what the backend does.

// Field keys: one per ticket, "<ticket type>-<n>".
export function holderKeys(items) {
  return items.flatMap((item) =>
    Array.from({ length: item.quantity }, (_, n) => ({ key: `${item.ticket_type}-${n}`, ticketType: item.ticket_type, n })),
  )
}

// POST /orders/{id}/checkout `attendees`: only the names actually typed.
export function attendeesPayload(items, names) {
  return holderKeys(items)
    .map(({ key, ticketType }) => ({ ticket_type: ticketType, name: (names[key] ?? '').trim() }))
    .filter((attendee) => attendee.name)
}
