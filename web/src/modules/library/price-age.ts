import type { ComponentPrice } from '../../lib/database.types'

/**
 * The Price chip on the components list (house style §5).
 *
 * A price without a date is the thing that quietly loses money: nobody doubts a
 * number that is printed, and the workbook this app replaced had prices in it
 * that were two years old. So the list never shows a price without saying how old
 * it is, and past the warning age it says so in amber.
 */

/**
 * Ninety days, the age at which a price is called old.
 *
 * It is the same number as `ai_price_age_warning_days` in `company_options`
 * (migration 0102), which is where a per-company setting would come from when
 * one is wired to a screen. Nothing reads that option today, so this is written
 * here rather than claimed to be configurable.
 */
export const PRICE_WARNING_DAYS = 90

export interface PriceChip {
  text: string
  tone: 'dim' | 'warn' | 'bad' | 'ok'
}

export function priceChip(component: ComponentPrice, today: string): PriceChip {
  if (component.pricing_mode === 'weight_rate') return { text: 'BY WEIGHT', tone: 'dim' }
  if (component.raw_price === null) return { text: 'NO PRICE', tone: 'bad' }
  if (component.price_valid_from === null || component.price_valid_from === '') {
    return { text: 'NO PRICE DATE', tone: 'dim' }
  }
  const days = Math.floor((Date.parse(today) - Date.parse(component.price_valid_from)) / 86_400_000)
  if (days > PRICE_WARNING_DAYS) return { text: `${days} DAYS OLD`, tone: 'warn' }
  if (days <= 0) return { text: 'PRICED TODAY', tone: 'ok' }
  return { text: `${days} ${days === 1 ? 'DAY' : 'DAYS'} OLD`, tone: 'ok' }
}
