const kzt = new Intl.NumberFormat('ru-KZ', { style: 'currency', currency: 'KZT' })

// Prices travel as integer tiyn (1 ₸ = 100 tiyn).
export function formatMoney(minor) {
  return minor === 0 ? 'Free' : kzt.format(minor / 100)
}

// "2 500", "2500.5" or "2500,50" ₸ -> 250050 tiyn, parsed as text so no
// binary floating point is involved. null when the input is not a price.
export function parseTenge(text) {
  const match = String(text).replace(/\s/g, '').match(/^(\d{1,7})(?:[.,](\d{1,2}))?$/)
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}
