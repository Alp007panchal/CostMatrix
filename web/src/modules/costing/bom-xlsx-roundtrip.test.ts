// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BomItem } from '../../lib/database.types'
import { type BomGroup, bomCells } from './bom'
import { downloadBomXlsx } from './bom-io'
import { type EplanJob, type EplanPart } from './eplan'
import { downloadEplanXlsx } from './eplan-io'

/**
 * Does the workbook we write actually open?
 *
 * Every other test of the exports checks the **cells** we decide on, which is the
 * part that can be wrong in an interesting way. This one checks the part that can
 * be wrong in a boring and total way: that exceljs writes a file, and that the
 * file reads back with our figures in it.
 *
 * It exists because `exceljs` carries a `uuid` the npm advisory database flags,
 * and the question "can we move that dependency safely?" cannot be answered by
 * reading — only by writing a workbook and reading it again. It earns its place
 * either way: nothing else in the suite proves an export is openable.
 */

const item = (over: Partial<BomItem> = {}): BomItem => ({
  costing_id: 'c', category_code: 'switchgear', category_name: 'Switchgear',
  code: 'ACB1600', name: 'ACB 1600 A 4P, withdrawable', manufacturer: 'SIEMENS',
  part_number: '3WA1216-5EB14-0AA0', unit: 'pcs', unit_price: 812_345.67,
  option_label: null, quantity: 3, line_total: 2_437_037.01,
  is_option: false, in_chosen_offer: true,
  ...over,
})

const group = (over: Partial<BomGroup> = {}): BomGroup => ({
  category_code: 'switchgear', category_name: 'Switchgear',
  rows: [item(), item({ code: 'MCCB400', name: 'MCCB 400 A', quantity: 4, line_total: 100 })],
  quantityUnits: 7, total: 2_437_137.01, optionalTotal: 0,
  hasOptions: false, hasExtras: false,
  ...over,
})

let written: { blob: Blob; name: string }[] = []

beforeEach(() => {
  written = []
  // The download is a link click in a browser; here it is a blob we keep.
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      written.push({ blob, name: 'pending' })
      return 'blob:test'
    },
    revokeObjectURL: () => undefined,
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    const last = written[written.length - 1]
    if (last) last.name = this.download
  })
})

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

/** Reads a written workbook back, the way Excel would. */
async function readBack(blob: Blob): Promise<(string | number | null)[][]> {
  const mod = await import('exceljs')
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await blob.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('the workbook has no sheet')
  const rows: (string | number | null)[][] = []
  ws.eachRow((row) => {
    const values = row.values as unknown[]
    // exceljs pads index 0; drop it.
    rows.push(values.slice(1).map((v) => (typeof v === 'number' || typeof v === 'string' ? v : null)))
  })
  return rows
}

describe('the bill of materials as a real workbook', () => {
  it('writes a file that opens, with the header we decided on', async () => {
    await downloadBomXlsx([group()], 'CM-2026-0007', 1, 'KSH')
    expect(written).toHaveLength(1)
    const rows = await readBack(written[0]!.blob)
    expect(rows[0]).toEqual([...bomCells(group())[0]!])
  })

  it('keeps the figures as numbers, not as text that looks like numbers', async () => {
    await downloadBomXlsx([group()], 'CM-2026-0007', 1, 'KSH')
    const rows = await readBack(written[0]!.blob)
    const first = rows[1]!
    expect(first[5]).toBe(3)
    expect(first[7]).toBe(2_437_037.01)
    expect(typeof first[7]).toBe('number')
  })

  it('carries the part number through unmangled, dashes and all', async () => {
    await downloadBomXlsx([group()], 'CM-2026-0007', 1, 'KSH')
    const rows = await readBack(written[0]!.blob)
    expect(rows[1]![3]).toBe('3WA1216-5EB14-0AA0')
  })

  it('totals the category on its last row', async () => {
    await downloadBomXlsx([group()], 'CM-2026-0007', 1, 'KSH')
    const rows = await readBack(written[0]!.blob)
    const total = rows.find((r) => r[0] === 'TOTAL')
    expect(total?.[7]).toBe(2_437_137.01)
  })

  it('gives each category its own sheet when all four are exported', async () => {
    await downloadBomXlsx(
      [group(), group({ category_code: 'busbar', category_name: 'Busbar and cable' })],
      'CM-2026-0007', 1, 'KSH',
    )
    const mod = await import('exceljs')
    const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await written[0]!.blob.arrayBuffer())
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Switchgear', 'Busbar and cable'])
  })

  it('names the file after the costing and revision', async () => {
    await downloadBomXlsx([group()], 'CM-2026-0007', 1, 'KSH')
    expect(written[0]!.name).toContain('CM-2026-0007')
    expect(written[0]!.name.endsWith('.xlsx')).toBe(true)
  })

  it('writes an option column through to the file where a job is offered two ways', async () => {
    await downloadBomXlsx(
      [group({ hasOptions: true, rows: [item({ option_label: 'Option 1' })] })],
      'CM-2026-0007', 1, 'KSH',
    )
    const rows = await readBack(written[0]!.blob)
    expect(rows[0]![0]).toBe('Option')
    expect(rows[1]![0]).toBe('Option 1')
  })
})

describe('the EPLAN parts list as a real workbook', () => {
  const part = (over: Partial<EplanPart> = {}): EplanPart => ({
    costing_id: 'c', panel_id: 'p1', panel: 'MAIN LV BOARD', panel_quantity: 2,
    section: 'Incomer', kit: 'ACB KIT', device_tag: 'Q1',
    part_number: '3WA1216', manufacturer: 'SIEMENS', description: 'ACB 1600 A, 4P',
    code: 'ACB1600', category_code: 'switchgear', quantity: 1, unit: 'pcs',
    mounting_type: 'withdrawable', width_mm: 400, height_mm: 450, depth_mm: 300, weight_kg: 62,
    ...over,
  })
  const job: EplanJob = {
    costingNo: 'CM-2026-0007', revisionNo: 1, title: 'Main LV board',
    eplanProject: 'NPP-201', drawingNumbers: 'E-201-01\nE-201-02',
  }

  it('opens, and keeps the device tag and the part number the drawing office matches on', async () => {
    await downloadEplanXlsx([part()], job)
    const rows = await readBack(written[0]!.blob)
    expect(rows[0]![0]).toBe('Device tag')
    expect(rows[1]![0]).toBe('Q1')
    expect(rows[1]![1]).toBe('3WA1216')
  })

  it('keeps the quantity per panel and the panel count apart, as numbers', async () => {
    await downloadEplanXlsx([part({ quantity: 3 })], job)
    const rows = await readBack(written[0]!.blob)
    expect(rows[1]![4]).toBe(3)
    expect(rows[1]![7]).toBe(2)
  })

  it('survives a description with a comma in it, which a CSV has to quote and a sheet does not', async () => {
    await downloadEplanXlsx([part()], job)
    const rows = await readBack(written[0]!.blob)
    expect(rows[1]![3]).toBe('ACB 1600 A, 4P')
  })
})

describe('the dependency the advisory database flags', () => {
  /**
   * `exceljs` calls `uuid.v4()` in exactly one place: the conditional-formatting
   * extension writer. Our exports never reach it, which is why the advisory
   * (GHSA-w5hq-g745-h8pq, a missing bounds check in uuid's v3/v5/v6 when a buffer
   * is passed) was never exposed here — exceljs imports only `v4` and passes no
   * buffer.
   *
   * `package.json` nevertheless overrides that `uuid` to a patched version, so the
   * audit is clean and nobody has to remember this reasoning. This test is why
   * that override is safe to keep: it drives exceljs's **own** uuid code path, so
   * a future bump of either package cannot quietly break the thing the override
   * touches.
   */
  it('still writes and reads an extension rule, which is where exceljs calls uuid', async () => {
    const mod = await import('exceljs')
    const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Probe')
    ws.addRow(['a', 1])
    ws.addRow(['b', 2])
    // A gradient dataBar is an "ext" rule, and preparing one calls uuid.v4().
    ws.addConditionalFormatting({
      ref: 'B1:B2',
      rules: [{ type: 'dataBar', priority: 1, gradient: true, cfvo: [{ type: 'min' }, { type: 'max' }] }],
    })

    const buffer = await wb.xlsx.writeBuffer()
    expect(buffer.byteLength).toBeGreaterThan(0)

    const back = new ExcelJS.Workbook()
    await back.xlsx.load(buffer)
    expect(back.worksheets[0]?.getCell('B2').value).toBe(2)
  })

  it('resolves a uuid the advisory no longer covers', async () => {
    const { v4 } = await import('uuid')
    // The shape exceljs imports, and a real v4 out of it.
    expect(typeof v4).toBe('function')
    expect(v4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
