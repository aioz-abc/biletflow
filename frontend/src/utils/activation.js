// Paid-sales activation checklist (SRS 4.5), GET/POST /events/{id}/activation.
// Everything here is a labelled simulation: no real identity check, bank data or money.

export const STEP_LABELS = {
  paid_ticket_type: 'At least one paid ticket type',
  identity_verified: 'Identity verified (simulated)',
  payout_account: 'Payout account connected (simulated)',
  terms_accepted: 'Paid-event terms accepted',
  fee_paid: 'Activation fee paid (simulated)',
}

export const STATUS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  active: 'Paid sales active',
  suspended: 'Suspended by platform admin',
}

// Steps still open before the fee can be paid; the fee itself is excluded.
export function missingBeforeFee(state) {
  return state.checklist.filter((item) => !item.done && item.step !== 'fee_paid').map((item) => item.step)
}

// Same rule as the backend: a payout reference must not look like a real account or card.
export function payoutReferenceError(value) {
  const text = value.trim()
  if (!text) return 'Enter a simulated reference, e.g. SIM-PAYOUT-1.'
  if (text.length > 64) return 'At most 64 characters.'
  if ((text.match(/\d/g) ?? []).length >= 12) return 'Never enter a real account or card number here.'
  return null
}
