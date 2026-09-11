import { describe, expect, it } from 'vitest'
import {
  changeLabel, guessMapping, missingFields, readPrice, rowsFromPdfText, toPriceRows,
} from './price-list-read'

describe('guessing which column is which', () => {
  it('finds the usual supplier headings', () => {
    expect(guessMapping(['Cat. No', 'Description', 'Net Price', 'Currency', 'Make'])).toEqual({
      key: 'Cat. No', description: 'Description', price: 'Net Price', currency: 'Currency', maker: 'Make',
    })
  })

  it('prefers "unit price" over a bare "unit" column', () => {
    expect(guessMapping(['Article number', 'Unit', 'Unit price'])?.price).toBe('Unit price')
  })

  it('never gives one column to two fields', () => {
    const mapping = guessMapping(['Item code', 'Item'])
    expect(mapping.key).toBe('Item code')
    expect(mapping.description).toBe('Item')
  })

  it('leaves what it cannot recognise for the person to set', () => {
    expect(guessMapping(['Column A', 'Column B'])).toEqual({})
    expect(missingFields({})).toEqual(['key', 'price'])
    expect(missingFields({ key: 'A', price: 'B' })).toEqual([])
  })
})

describe('reading a price as suppliers write it', () => {
  it('reads a plain number', () => {
    expect(readPrice('1234.5')).toBe('1234.5')
    expect(readPrice(' 412000 ')).toBe('412000')
  })

  it('reads thousands separators, comma or point', () => {
    expect(readPrice('1,234.50')).toBe('1234.50')
    expect(readPrice('1.234,50')).toBe('1234.50')
    expect(readPrice('1 234,50')).toBe('1234.50')
    expect(readPrice("1'234.50")).toBe('1234.50')
    expect(readPrice('12,000')).toBe('12000')
    expect(readPrice('12,00')).toBe('12.00')
  })

  it('ignores a currency written in the same cell', () => {
    expect(readPrice('KES 1,250.00')).toBe('1250.00')
    expect(readPrice('€ 980,75')).toBe('980.75')
  })

  it('reads a bracketed figure as negative, so the row is refused rather than applied', () => {
    expect(readPrice('(12.00)')).toBe('-12.00')
  })

  it('says nothing for a cell with no number in it', () => {
    expect(readPrice('on request')).toBe('')
    expect(readPrice('—')).toBe('')
    expect(readPrice('')).toBe('')
    expect(readPrice(undefined)).toBe('')
  })
})

describe('building the rows the database previews', () => {
  const mapping = { key: 'Part No', price: 'Price', currency: 'Ccy', maker: 'Make', description: 'Desc' }

  it('numbers rows from the line after the header', () => {
    const rows = toPriceRows(
      [
        { 'Part No': '3WJ1116', Price: '412,000', Ccy: 'kes', Make: 'Siemens', Desc: '1600A ACB' },
        { 'Part No': 'LOGO', Price: '18 500', Ccy: '', Make: '', Desc: '' },
      ],
      mapping,
    )
    expect(rows).toEqual([
      { row: 2, key: '3WJ1116', price: '412000', currency: 'KES', maker: 'Siemens', description: '1600A ACB' },
      { row: 3, key: 'LOGO', price: '18500' },
    ])
  })

  it('keeps a row whose price will be refused, so the person sees why', () => {
    const rows = toPriceRows([{ 'Part No': 'X-1', Price: 'on request' }], mapping)
    expect(rows).toEqual([{ row: 2, key: 'X-1', price: '' }])
  })

  it('skips a sheet’s own sub-headings, which have neither a reference nor a price', () => {
    const rows = toPriceRows(
      [{ 'Part No': '', Price: '', Desc: 'OUTGOING FEEDERS' }, { 'Part No': 'A1', Price: '10' }],
      mapping,
    )
    expect(rows.map((r) => r.key)).toEqual(['A1'])
  })

  it('trims a currency to three letters', () => {
    expect(toPriceRows([{ 'Part No': 'A', Price: '1', Ccy: 'EUR.' }], mapping)[0]?.currency).toBe('EUR')
  })
})

describe('a table out of a PDF’s text', () => {
  const text = [
    '--- page 1 ---',
    'POWER CONTROLS LTD — PRICE LIST SEPTEMBER 2026',
    'Prices are ex-works Nairobi and exclude VAT.',
    '',
    'Part number          Description                        Price',
    '3WJ1116-2AE42       1600A 4P ACB withdrawable          412,000.00',
    '3VJ1216-3DB32\t160A TP MCCB 25kA\t38,500.00',
    'LOGO-8              ATS controller                     18,500',
    'Terms: 30 days net',
  ].join('\n')

  it('finds the rows and leaves the prose alone', () => {
    const rows = rowsFromPdfText(text)
    expect(rows.map((r) => [r.key, r.price])).toEqual([
      ['3WJ1116-2AE42', '412000.00'],
      ['3VJ1216-3DB32', '38500.00'],
      ['LOGO-8', '18500'],
    ])
  })

  it('keeps the description beside each reference', () => {
    expect(rowsFromPdfText(text)[0]?.description).toBe('1600A 4P ACB withdrawable')
  })

  it('returns nothing for a PDF that holds no table, rather than inventing rows', () => {
    expect(rowsFromPdfText('Dear Sir,\n\nPlease find our terms attached.\n\nYours faithfully')).toEqual([])
  })
})

describe('the percentage column', () => {
  it('says which way the price moved, and says nothing when it cannot tell', () => {
    expect(changeLabel(12.54)).toBe('+12.5 %')
    expect(changeLabel(-3)).toBe('−3 %')
    expect(changeLabel(0)).toBe('0 %')
    expect(changeLabel(null)).toBe('—')
    expect(changeLabel(undefined)).toBe('—')
  })
})
