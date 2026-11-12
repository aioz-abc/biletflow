import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyticsQuery, chartRows, datePreset, reconciliation } from '../src/utils/analytics.js'

test('analytics query keeps the backend half-open date contract', () => {
  assert.equal(analyticsQuery(), '')
  assert.equal(
    analyticsQuery({ from: '2026-11-01', to: '2026-11-08', ticketType: '7' }),
    '?from=2026-11-01&to=2026-11-08&ticket_type=7',
  )
  assert.equal(analyticsQuery({ ticketType: '3' }), '?ticket_type=3')
})

test('analytics dates must be complete and ordered', () => {
  assert.throws(() => analyticsQuery({ from: '2026-11-01' }), /both start and end/i)
  assert.throws(() => analyticsQuery({ to: '2026-11-08' }), /both start and end/i)
  assert.throws(() => analyticsQuery({ from: '2026-11-08', to: '2026-11-08' }), /after start/i)
  assert.throws(() => analyticsQuery({ from: '2026-11-09', to: '2026-11-08' }), /after start/i)
})

test('date presets end tomorrow so today is included', () => {
  assert.deepEqual(datePreset(7, new Date('2026-11-12T15:00:00Z')), {
    from: '2026-11-06',
    to: '2026-11-13',
  })
})

test('chart bars share one scale for collected and refunded amounts', () => {
  assert.deepEqual(chartRows([
    { date: '2026-11-01', collected_minor: 1000, refunded_minor: 250 },
    { date: '2026-11-02', collected_minor: 500, refunded_minor: 0 },
  ]), [
    { date: '2026-11-01', collected_minor: 1000, refunded_minor: 250, collected_percent: 100, refunded_percent: 25 },
    { date: '2026-11-02', collected_minor: 500, refunded_minor: 0, collected_percent: 50, refunded_percent: 0 },
  ])
})

test('daily analytics must reconcile to backend totals', () => {
  const values = {
    issued_tickets: 2,
    sales_before_discount_minor: 5000,
    discount_minor: 500,
    collected_minor: 4500,
    refunded_minor: 1000,
    net_receipts_minor: 3500,
    fees_minor: 135,
  }
  assert.equal(reconciliation({ totals: values, daily: [values] }), true)
  assert.equal(reconciliation({ totals: { ...values, collected_minor: 4501 }, daily: [values] }), false)
})
