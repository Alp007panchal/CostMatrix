import { describe, expect, it } from 'vitest'
import type { ComponentPrice } from '../../lib/database.types'
import { buildPreview, columnForHeader, findExisting, parseRow, type RawRow } from './excel-match'

const CATEGORIES = ['switchgear', 'busbar', 'accessories_hardware', 'enclosure_parts']

function existing(over: Partial<ComponentPrice>): ComponentPrice {
  return {
    id: 'c1', company_id: null, category_code: 'switchgear', category_name: 'Switchgear',
    code: 'MCCB-160', name: '160A TP MCCB', description: null, unit: 'pcs',
    manufacturer: 'SIEMENS', part_number: '3VJ1216', pricing_mode: 'fixed',
    raw_price: 10000, unit_price: 10000, purchase_currency: 'KES', currency_code: 'KES',
    currency_label: 'KES', weight_per_unit: null, material_rate_code: null, is_active: true,
    source: 'master', is_enclosure_cubicle: false, factor_exchange_rate: 1, landed_factor: 1,
    landed_price_kes: 10000,
    ...over,
  }
}

function row(over: Partial<RawRow>): RawRow {
  return { rowNumber: 2, code: 'X', name: 'Thing', price: '100', ...over }
}

describe('columnForHeader', () => {
  it('accepts the headers of the old costing sheets', () => {
    expect(columnForHeader('Make')).toBe('manufacturer')
    expect(columnForHeader('Reference')).toBe('part_number')
    expect(columnForHeader('Item')).toBe('name')
    expect(columnForHeader('Price')).toBe('price')
  })
  it('ignores case, spaces and punctuation', () => {
    expect(columnForHeader('  PART NUMBER ')).toBe('part_number')
    expect(columnForHeader('Kg per unit')).toBe('weight')
    expect(columnForHeader('Id (leave blank for new)')).toBe('id')
  })
  it('returns null for a column it does not know', () => {
    expect(columnForHeader('Supplier phone')).toBeNull()
  })
})

describe('parseRow', () => {
  it('needs a code, a name and a category', () => {
    expect(parseRow(row({ code: '' }), CATEGORIES, 'switchgear')).toMatchObject({ ok: false, reason: 'no code' })
    expect(parseRow(row({ name: '' }), CATEGORIES, 'switchgear')).toMatchObject({ ok: false, reason: 'no name' })
    expect(parseRow(row({}), CATEGORIES, null)).toMatchObject({ ok: false, reason: 'no category' })
  })
  it('reads a category by name as well as by code', () => {
    const r = parseRow(row({ category: 'Busbar and cable' }), CATEGORIES, null)
    expect(r.ok && r.parsed.category_code).toBe('busbar')
  })
  it('rejects a category it cannot place', () => {
    expect(parseRow(row({ category: 'Widgets' }), CATEGORIES, null)).toMatchObject({ ok: false })
  })
  it('reads prices with thousands separators and currency words', () => {
    const r = parseRow(row({ price: 'KES 5,784,800.00' }), CATEGORIES, 'switchgear')
    expect(r.ok && r.parsed.purchase_price).toBe(5784800)
    expect(r.ok && r.parsed.purchase_currency).toBe('KES')
  })
  it('reads the purchase currency from its column or from the price cell', () => {
    const own = parseRow(row({ price: '42', currency: 'eur' }), CATEGORIES, 'switchgear')
    expect(own.ok && own.parsed.purchase_currency).toBe('EUR')
    const prefixed = parseRow(row({ price: 'EUR 42.00' }), CATEGORIES, 'switchgear')
    expect(prefixed.ok && prefixed.parsed).toMatchObject({ purchase_price: 42, purchase_currency: 'EUR' })
    const bad = parseRow(row({ price: '42', currency: 'euros' }), CATEGORIES, 'switchgear')
    expect(bad.ok).toBe(false)
  })
  it('a weight-priced row needs kg and a rate code, and drops the price', () => {
    const bad = parseRow(row({ pricing: 'weight', weight: '2.8' }), CATEGORIES, 'busbar')
    expect(bad).toMatchObject({ ok: false, reason: 'weight pricing needs a material rate code' })
    const good = parseRow(row({ pricing: 'weight', weight: '2.8', material_rate: 'copper_busbar', price: '999' }), CATEGORIES, 'busbar')
    expect(good.ok && good.parsed).toMatchObject({ pricing_mode: 'weight_rate', weight_per_unit: 2.8, purchase_price: null })
  })
})

describe('findExisting', () => {
  const lib = [existing({}), existing({ id: 'c2', code: 'LAMP-R', name: 'Pilot light red', manufacturer: 'SIEMENS', part_number: '3SB5' })]

  it('matches by id when one is given', () => {
    const r = row({ id: 'c2', code: 'whatever' })
    const p = parseRow(r, CATEGORIES, 'switchgear')
    expect(p.ok && findExisting(r, p.parsed, lib)?.id).toBe('c2')
  })
  it('matches by part number within the same make', () => {
    const r = row({ code: 'NEW', manufacturer: 'Siemens', part_number: '3vj1216' })
    const p = parseRow(r, CATEGORIES, 'switchgear')
    expect(p.ok && findExisting(r, p.parsed, lib)?.id).toBe('c1')
  })
  it('does not match the same part number from a different make', () => {
    const r = row({ code: 'NEW', manufacturer: 'Schneider', part_number: '3VJ1216' })
    const p = parseRow(r, CATEGORIES, 'switchgear')
    expect(p.ok && findExisting(r, p.parsed, lib)).toBeUndefined()
  })
  it('falls back to the code', () => {
    const r = row({ code: 'mccb-160', manufacturer: 'Other' })
    const p = parseRow(r, CATEGORIES, 'switchgear')
    expect(p.ok && findExisting(r, p.parsed, lib)?.id).toBe('c1')
  })
})

describe('buildPreview', () => {
  it('sorts rows into new, changed, unchanged and rejected', () => {
    const lib = [existing({})]
    const rows: RawRow[] = [
      { rowNumber: 2, code: 'MCCB-160', name: '160A TP MCCB', manufacturer: 'SIEMENS', part_number: '3VJ1216', unit: 'pcs', price: '10000' },
      { rowNumber: 3, code: 'MCCB-160', name: '160A TP MCCB', manufacturer: 'SIEMENS', part_number: '3VJ1216', unit: 'pcs', price: '11000' },
      { rowNumber: 4, code: 'NEW-1', name: 'Brand new', price: '5' },
      { rowNumber: 5, code: '', name: 'No code', price: '5' },
    ]
    const p = buildPreview(rows, lib, CATEGORIES, 'switchgear')
    expect(p.unchanged.map((u) => u.row.rowNumber)).toEqual([2])
    // Row 3 has the same code as row 2, so it is a duplicate within the file
    // rather than a second update to the same component.
    expect(p.rejected.map((r) => r.row.rowNumber)).toEqual([3, 5])
    expect(p.toCreate.map((c) => c.row.rowNumber)).toEqual([4])
  })
  it('describes a price change in words', () => {
    const rows: RawRow[] = [
      { rowNumber: 2, code: 'MCCB-160', name: '160A TP MCCB', manufacturer: 'SIEMENS', part_number: '3VJ1216', unit: 'pcs', price: '11000' },
    ]
    const p = buildPreview(rows, [existing({})], CATEGORIES, 'switchgear')
    expect(p.toUpdate).toHaveLength(1)
    expect(p.toUpdate[0]?.changes).toEqual([{ field: 'price', from: '10000', to: '11000' }])
  })
  it('describes a currency change in words', () => {
    const p = buildPreview(
      [{ rowNumber: 2, code: 'MCCB-160', name: '160A TP MCCB', manufacturer: 'SIEMENS', part_number: '3VJ1216', unit: 'pcs', price: '88.64', currency: 'EUR' }],
      [existing({})], CATEGORIES, 'switchgear',
    )
    expect(p.toUpdate[0]?.changes).toEqual([
      { field: 'price', from: '10000', to: '88.64' },
      { field: 'currency', from: 'KES', to: 'EUR' },
    ])
  })
})
