import { describe, expect, it } from 'vitest'
import type { BomItem } from '../../lib/database.types'
import { bomCells, bomFileName, bomToCsv, groupBom } from './bom'

const item = (over: Partial<BomItem>): BomItem => ({
  costing_id: 'c', category_code: 'switchgear', category_name: 'Switchgear', code: 'X', name: 'Thing',
  manufacturer: 'SIEMENS', part_number: 'PN', unit: 'pcs', unit_price: 10, option_label: null,
  quantity: 2, line_total: 20, ...over,
})
const NAMES = { switchgear: 'Switchgear', busbar: 'Busbar and cable', accessories_hardware: 'Accessories and hardware', enclosure_parts: 'Fabricated enclosure parts' }

describe('groupBom', () => {
  it('always returns the four categories in order, even when empty', () => {
    const groups = groupBom([], NAMES)
    expect(groups.map((g) => g.category_code)).toEqual(['switchgear', 'busbar', 'accessories_hardware', 'enclosure_parts'])
    expect(groups.every((g) => g.rows.length === 0 && g.total === 0)).toBe(true)
  })
  it('puts each item in its category and totals it', () => {
    const groups = groupBom([
      item({ code: 'MCCB', line_total: 20 }),
      item({ code: 'BAR', category_code: 'busbar', line_total: 5.5 }),
      item({ code: 'ACB', line_total: 100 }),
    ], NAMES)
    expect(groups[0]?.rows.map((r) => r.code)).toEqual(['ACB', 'MCCB'])
    expect(groups[0]?.total).toBe(120)
    expect(groups[1]?.total).toBe(5.5)
  })
  it('notices when a costing has options', () => {
    const [g] = groupBom([item({ option_label: 'Option 1' })], NAMES)
    expect(g?.hasOptions).toBe(true)
  })
})

describe('bomCells and bomToCsv', () => {
  it('writes header, rows and a total row', () => {
    const [g] = groupBom([item({ code: 'MCCB', name: 'Breaker, 160A' })], NAMES)
    const cells = bomCells(g!)
    expect(cells[0]).toEqual(['Code', 'Description', 'Make', 'Part number', 'Unit', 'Qty', 'Unit price', 'Total'])
    expect(cells[1]).toEqual(['MCCB', 'Breaker, 160A', 'SIEMENS', 'PN', 'pcs', 2, 10, 20])
    expect(cells[2]?.[0]).toBe('TOTAL')
    expect(cells[2]?.[7]).toBe(20)
  })
  it('adds an Option column only when options exist', () => {
    const [g] = groupBom([item({ option_label: 'Option 2' })], NAMES)
    expect(bomCells(g!)[0]?.[0]).toBe('Option')
    expect(bomCells(g!)[1]?.[0]).toBe('Option 2')
  })
  it('quotes commas and doubles quotes in CSV, with a BOM for Excel', () => {
    const [g] = groupBom([item({ name: 'Breaker, 160A "adj"' })], NAMES)
    const csv = bomToCsv(g!)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('"Breaker, 160A ""adj"""')
    expect(csv.split('\r\n')).toHaveLength(4) // header, row, total, trailing
  })
})

describe('bomFileName', () => {
  it('names the file by costing, revision and category', () => {
    expect(bomFileName('CM-2026-0007', 0, 'switchgear', 'xlsx')).toBe('CM-2026-0007-bom-switchgear.xlsx')
    expect(bomFileName('CM-2026-0007', 2, 'busbar', 'csv')).toBe('CM-2026-0007-rev2-bom-busbar.csv')
  })

  it('groups a typed line under the category it was given', () => {
    const typed = { ...item({ code: 'MANUAL-001', name: 'Synchro check relay', category_code: 'switchgear', quantity: 2, unit_price: 35000, line_total: 70000 }) }
    const groups = groupBom([typed], { switchgear: 'Switchgear' })
    expect(groups[0]?.rows.map((r) => r.code)).toEqual(['MANUAL-001'])
    expect(groups[0]?.total).toBe(70000)
  })
})
