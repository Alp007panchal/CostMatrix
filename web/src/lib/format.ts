/** Formatting helpers shared by every screen. Pure functions, easy to test. */

/**
 * Money for display. The label is the company's own word for its currency
 * ("KSH"), which is not always the ISO code ("KES").
 */
export function money(amount: number, label = 'KES'): string {
  return `${label} ${amount.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** A percentage as people write it: 16 becomes "16%", 12.5 becomes "12.5%". */
export function percent(value: number): string {
  return `${Number(value.toFixed(3))}%`
}

/**
 * The markup a margin implies, since margins here are applied by division:
 * a 20% margin on 100 sells at 125, which is a 25% markup. Shown beside the
 * margin field so nobody is surprised by the arithmetic.
 */
export function marginToMarkup(marginPct: number): number {
  if (marginPct <= 0) return 0
  if (marginPct >= 100) return Number.POSITIVE_INFINITY
  return (100 / (100 - marginPct) - 1) * 100
}

/** A date as a person reads it: 30 June 2026. */
export function longDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Roles as a readable list: "Company admin, Approver". */
export function roleLabel(role: string): string {
  const words = role.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
