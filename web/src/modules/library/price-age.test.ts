import { describe, expect, it } from 'vitest'
import type { ComponentPrice } from '../../lib/database.types'
import { PRICE_WARNING_DAYS, priceChip } from './price-age'

const TODAY = '2026-09-14'

const part = (over: Partial<ComponentPrice> = {}): ComponentPrice => ({
  pricing_mode: 'fixed', raw_price: 1200, price_valid_from: '2026-09-01',
  ...over,
} as ComponentPrice)

describe('the price chip on the components list', () => {
  it('says NO PRICE for the seven placeholders and the unpriced catalogue part', () => {
    expect(priceChip(part({ raw_price: null }), TODAY)).toEqual({ text: 'NO PRICE', tone: 'bad' })
  })

  it('says so plainly when a price has no date at all, rather than guessing one', () => {
    expect(priceChip(part({ price_valid_from: null }), TODAY).text).toBe('NO PRICE DATE')
    expect(priceChip(part({ price_valid_from: '' }), TODAY).text).toBe('NO PRICE DATE')
  })

  it('turns amber past the warning age and not a day before', () => {
    const on = new Date(Date.parse(TODAY) - PRICE_WARNING_DAYS * 86_400_000).toISOString().slice(0, 10)
    const over = new Date(Date.parse(TODAY) - (PRICE_WARNING_DAYS + 1) * 86_400_000).toISOString().slice(0, 10)
    expect(priceChip(part({ price_valid_from: on }), TODAY).tone).toBe('ok')
    expect(priceChip(part({ price_valid_from: over }), TODAY)).toEqual({ text: '91 DAYS OLD', tone: 'warn' })
  })

  it('counts the days, singular and plural', () => {
    expect(priceChip(part({ price_valid_from: '2026-09-13' }), TODAY).text).toBe('1 DAY OLD')
    expect(priceChip(part({ price_valid_from: '2026-09-12' }), TODAY).text).toBe('2 DAYS OLD')
    expect(priceChip(part({ price_valid_from: TODAY }), TODAY).text).toBe('PRICED TODAY')
  })

  it('leaves a part priced by weight alone: its price is the copper rate, not its own', () => {
    expect(priceChip(part({ pricing_mode: 'weight_rate', raw_price: null }), TODAY))
      .toEqual({ text: 'BY WEIGHT', tone: 'dim' })
  })
})
