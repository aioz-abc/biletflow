// Support cases (SRS 4.13), see "Support cases" in docs/BACKEND_MVP_API.md.

// Attendee cases are about an event, order or ticket.
export const ATTENDEE_CATEGORIES = {
  ticket_delivery: 'Ticket delivery',
  payment: 'Payment',
  refund: 'Refund',
  seating: 'Seating',
  event_information: 'Event information',
  check_in: 'Check-in',
  account: 'Account',
  technical: 'Technical problem',
}

// Platform cases have no event; only organizers may open them.
export const PLATFORM_CATEGORIES = {
  account: 'Account',
  activation: 'Paid sales activation',
  payment: 'Payment',
  technical: 'Technical problem',
}

export const STATUSES = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_for_customer: 'Waiting for customer',
  resolved: 'Resolved',
}

// The requester sees "waiting_for_customer" as a request to reply.
export function statusLabel(status, supportSide) {
  if (status === 'waiting_for_customer' && !supportSide) return 'Waiting for your reply'
  return STATUSES[status] ?? status
}

// ?ticket=5 / ?order=3 / ?event=2 -> { ticket: 5 }. The backend fills in the
// rest from the most specific link, so only that one is sent.
export function caseContext(params) {
  for (const key of ['ticket', 'order', 'event']) {
    const value = params.get(key)
    if (/^[1-9]\d*$/.test(value ?? '')) return { [key]: Number(value) }
  }
  return {}
}

// Adds polled messages to the thread: no duplicates, oldest first.
export function mergeMessages(thread, incoming) {
  const byId = new Map(thread.map((m) => [m.id, m]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

// Case detail without its thread; the page keeps messages separately.
export function caseHeader(detail) {
  const header = { ...detail }
  delete header.messages
  return header
}

// The event owner, an Event Admin or a platform admin; never the requester.
export const isSupportSide = (supportCase, user) => supportCase.requester !== user?.id
