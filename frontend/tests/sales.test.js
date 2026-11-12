import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAmount, formatMoney } from '../src/utils/money.js'
import { dashboardTotals, ticketsSold } from '../src/utils/sales.js'

const sales = (gross, payout, ...sold) => ({
  gross_minor: gross,
  estimated_payout_minor: payout,
  ticket_types: sold.map((count) => ({ sold: count })),
})

test('dashboard totals add up only the events whose sales loaded', () => {
  const events = [{ id: 1, published: true }, { id: 2, published: false }, { id: 3, published: true }]
  const totals = dashboardTotals(events, { 1: sales(500000, 485000, 3, 2), 2: sales(0, 0) })
  assert.deepEqual(totals, { events: 3, published: 2, sold: 5, gross: 500000, payout: 485000 })
  assert.equal(ticketsSold(sales(0, 0)), 0)
})

test('report amounts show zero as money, prices show it as Free', () => {
  assert.equal(formatMoney(0), 'Free')
  assert.notEqual(formatAmount(0), 'Free')
  assert.match(formatAmount(0), /0/)
})
