// Refunds and cancellations (SRS 4.9), see POST /orders/{id}/refund and
// /orders/{id}/cancel in docs/BACKEND_MVP_API.md. The organizer's order list
// (GET /events/{id}/orders) already says which action each order allows.

import { formatAmount } from './money.js'

export const ORDER_STATUS = {
  pending: 'Awaiting payment',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  expired: 'Expired',
}

export const ACTION_LABEL = { refund: 'Refund', cancel: 'Cancel registration' }

// The endpoint for the action the API allows, or null when nothing is allowed.
export function actionPath(order) {
  return ACTION_LABEL[order?.action] ? `/orders/${order.id}/${order.action}` : null
}

// Shown on the second click, so nobody refunds by accident.
export function confirmText(order) {
  return order.action === 'refund'
    ? `Refund ${formatAmount(order.total_minor)} and invalidate ${ticketCount(order.tickets)}?`
    : `Cancel this registration and invalidate ${ticketCount(order.tickets)}?`
}

function ticketCount(n) {
  return n === 1 ? '1 ticket' : `${n} tickets`
}

// Attendee side: only a confirmed order that cost nothing can be cancelled by
// its purchaser; paid orders are refunded by the organizer. The API refuses it
// once the event has started and explains why.
export function attendeeCanCancel(order) {
  return order?.status === 'confirmed' && order.total_minor === 0
}
