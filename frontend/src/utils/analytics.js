const DAY = 24 * 60 * 60 * 1000

export function analyticsQuery({ from = '', to = '', ticketType = '' } = {}) {
  const params = new URLSearchParams()
  if (from || to) {
    if (!from || !to) throw new Error('Choose both start and end dates.')
    if (to <= from) throw new Error('End date must be after start date.')
    params.set('from', from)
    params.set('to', to)
  }
  if (ticketType) params.set('ticket_type', ticketType)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function datePreset(days, now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const start = new Date(end.getTime() - days * DAY)
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}

export function chartRows(daily = []) {
  const max = Math.max(1, ...daily.flatMap((day) => [day.collected_minor, day.refunded_minor]))
  return daily.map((day) => ({
    ...day,
    collected_percent: Math.round(day.collected_minor * 100 / max),
    refunded_percent: Math.round(day.refunded_minor * 100 / max),
  }))
}

export function reconciliation(data) {
  if (!data) return true
  const keys = ['issued_tickets', 'sales_before_discount_minor', 'discount_minor', 'collected_minor', 'refunded_minor', 'net_receipts_minor', 'fees_minor']
  return keys.every((key) => data.daily.reduce((sum, day) => sum + day[key], 0) === data.totals[key])
}
