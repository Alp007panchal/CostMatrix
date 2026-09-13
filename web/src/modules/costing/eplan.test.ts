import { describe, expect, it } from 'vitest'
import {
  EPLAN_COLUMNS,
  type EplanJob,
  type EplanPart,
  eplanCells,
  eplanFileName,
  eplanGaps,
  eplanRows,
  eplanToCsv,
} from './eplan'

const part = (over: Partial<EplanPart> = {}): EplanPart => ({
  costing_id: 'c', panel_id: 'p1', panel: 'MAIN LV BOARD', panel_quantity: 2,
  section: 'Incomer', kit: '1600 A ACB KIT', device_tag: 'Q1',
  part_number: '3WA1216-5EB14-0AA0', manufacturer: 'SIEMENS',
  description: 'ACB 1600 A 4P, withdrawable', code: 'ACB1600', category_code: 'switchgear',
  quantity: 1, unit: 'pcs', mounting_type: 'withdrawable',
  width_mm: 400, height_mm: 450, depth_mm: 300, weight_kg: 62,
  ...over,
})

const job: EplanJob = {
  costingNo: 'CM-2026-0007', revisionNo: 1, title: 'Main LV board',
  eplanProject: 'NPP-201 MAIN LV', drawingNumbers: 'E-201-01\nE-201-02',
}

describe('the parts list for the drawing office', () => {
  it('writes the columns in a fixed order, because EPLAN is mapped against them once', () => {
    expect(eplanCells([part()], job)[0]).toEqual([...EPLAN_COLUMNS])
    expect(EPLAN_COLUMNS[0]).toBe('Device tag')
    expect(EPLAN_COLUMNS[1]).toBe('Part number')
  })

  it('carries the device tag the drawing gave the kit', () => {
    expect(eplanRows([part()], job)[0]?.[0]).toBe('Q1')
  })

  it('leaves the tag empty rather than inventing one for an unplaced kit', () => {
    expect(eplanRows([part({ device_tag: null })], job)[0]?.[0]).toBe('')
  })

  it('gives the quantity per panel and the panel count beside it, never multiplied together', () => {
    const row = eplanRows([part({ quantity: 3, panel_quantity: 2 })], job)[0]
    expect(row?.[4]).toBe(3)
    expect(row?.[7]).toBe(2)
  })

  it('puts several drawing numbers in one cell, since a cell is one cell', () => {
    expect(eplanRows([part()], job)[0]?.[19]).toBe('E-201-01; E-201-02')
  })

  it('says which costing and revision it came from', () => {
    expect(eplanRows([part()], job)[0]?.[17]).toBe('CM-2026-0007 REV1')
  })

  it('quotes a description that has a comma in it, so the CSV still has its columns', () => {
    const csv = eplanToCsv([part({ description: 'ACB 1600 A, 4P, withdrawable' })], job)
    expect(csv).toContain('"ACB 1600 A, 4P, withdrawable"')
    expect(csv.split('\r\n')[1]?.split(',').length).toBeGreaterThan(10)
  })

  it('doubles a quote inside a description rather than breaking the row', () => {
    expect(eplanToCsv([part({ description: '19" rack' })], job)).toContain('"19"" rack"')
  })

  it('names the file after the costing, the revision and the project', () => {
    expect(eplanFileName(job, 'csv')).toBe('CM-2026-0007-REV1-NPP-201-MAIN-LV-parts.csv')
  })

  it('and leaves the project out of the name when there is none', () => {
    expect(eplanFileName({ ...job, eplanProject: null }, 'xlsx')).toBe('CM-2026-0007-REV1-parts.xlsx')
  })
})

describe('what it says is missing before the drawing office can use it', () => {
  it('nothing, when every row is complete', () => {
    expect(eplanGaps([part()])).toEqual([])
  })

  it('says so plainly when there is nothing at all', () => {
    expect(eplanGaps([])).toEqual(['This costing has no lines yet, so there is nothing to export.'])
  })

  it('counts the rows with no part number, because EPLAN matches on that', () => {
    const gaps = eplanGaps([part(), part({ part_number: null }), part({ part_number: '  ' })])
    expect(gaps[0]).toContain('2 of 3 rows have no manufacturer part number')
  })

  it('says when no panel has been laid out, without refusing to export', () => {
    const gaps = eplanGaps([part({ device_tag: null }), part({ device_tag: null })])
    expect(gaps.some((g) => g.includes('No row has a device tag'))).toBe(true)
    expect(gaps.some((g) => g.includes('still imports'))).toBe(true)
  })

  it('and counts the ones left over when only some kits are placed', () => {
    const gaps = eplanGaps([part(), part({ device_tag: null })])
    expect(gaps.some((g) => g.includes('1 rows have no device tag'))).toBe(true)
  })
})
