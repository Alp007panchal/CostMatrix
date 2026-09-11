import type { ComponentPrice } from '../../lib/database.types'
import { COLUMNS, columnForHeader, type ColumnKey, type RawRow } from './excel-match'

/**
 * Reading and writing the spreadsheet itself. exceljs is loaded on demand, so
 * the megabyte it weighs is only fetched by the person who clicks Download or
 * Upload, and never by anyone costing a panel.
 */

async function excel() {
  const mod = await import('exceljs')
  // The browser bundle exposes the library as the default export; the Node one as the module.
  return (mod as unknown as { default?: typeof mod }).default ?? mod
}

/** Builds a workbook of the library and hands it to the browser as a download. */
export async function downloadComponents(rows: ComponentPrice[], fileName: string): Promise<void> {
  const ExcelJS = await excel()
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Components')

  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: widthFor(c.key) }))
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const c of rows) {
    sheet.addRow({
      id: c.id,
      code: c.code,
      name: c.name,
      category: c.category_code,
      manufacturer: c.manufacturer ?? '',
      part_number: c.part_number ?? '',
      unit: c.unit,
      pricing: c.pricing_mode === 'weight_rate' ? 'weight' : 'fixed',
      price: c.pricing_mode === 'fixed' ? (c.raw_price ?? c.unit_price) : '',
      currency: c.pricing_mode === 'fixed' ? c.purchase_currency : '',
      weight: c.weight_per_unit ?? '',
      material_rate: c.material_rate_code ?? '',
      cubicle: c.is_enclosure_cubicle ? 'yes' : '',
      description: c.description ?? '',
    })
  }

  if (rows.length === 0) {
    // An empty library still downloads as a usable template.
    sheet.addRow({
      code: 'EXAMPLE-1', name: 'Example breaker, delete this row', category: 'switchgear',
      manufacturer: 'SIEMENS', part_number: '3VJ1216', unit: 'pcs', pricing: 'fixed', price: 88.64,
      currency: 'EUR',
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export interface ParsedSheet {
  name: string
  rows: RawRow[]
  unknownHeaders: string[]
  headerRow: number
}

/**
 * Reads every sheet of an uploaded file. The header row is found rather than
 * assumed, since the old costing sheets have titles above their tables.
 */
export async function readWorkbook(file: File): Promise<ParsedSheet[]> {
  const ExcelJS = await excel()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())

  const sheets: ParsedSheet[] = []
  workbook.eachSheet((ws) => {
    // Look for the first row where at least code/item and price-ish columns appear.
    let headerRow = 0
    let mapping: (ColumnKey | null)[] = []
    let unknown: string[] = []

    for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
      const cells = cellStrings(ws.getRow(r))
      const mapped = cells.map((h) => (h ? columnForHeader(h) : null))
      const hasName = mapped.includes('name') || mapped.includes('code')
      const hasPrice = mapped.includes('price') || mapped.includes('weight')
      if (hasName && hasPrice) {
        headerRow = r
        mapping = mapped
        unknown = cells.filter((h, i) => h && !mapped[i])
        break
      }
    }
    if (headerRow === 0) return

    const rows: RawRow[] = []
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const cells = cellStrings(ws.getRow(r))
      if (cells.every((c) => !c)) continue
      const row: RawRow = { rowNumber: r }
      mapping.forEach((key, i) => {
        if (key && cells[i] !== undefined) row[key] = cells[i]
      })
      // A sheet's own sub-headings ("INCOMERS", "OUTGOERS") have a name and
      // nothing else; skip them rather than reject them.
      if (!row.code && !row.price && !row.weight && !row.part_number) continue
      rows.push(row)
    }
    sheets.push({ name: ws.name, rows, unknownHeaders: unknown, headerRow })
  })

  return sheets
}

/** Every cell of a row as trimmed text, with formulas replaced by their results. */
function cellStrings(row: { cellCount: number; getCell: (i: number) => { value: unknown } }): string[] {
  const out: string[] = []
  for (let i = 1; i <= row.cellCount; i++) {
    out.push(cellText(row.getCell(i).value))
  }
  return out
}

function cellText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object') {
    const v = value as { result?: unknown; richText?: { text: string }[]; text?: unknown }
    if (v.richText) return v.richText.map((t) => t.text).join('').trim()
    if ('result' in v) return cellText(v.result)
    if ('text' in v) return cellText(v.text)
    if (value instanceof Date) return value.toISOString()
    return ''
  }
  return String(value).trim()
}

function widthFor(key: ColumnKey): number {
  switch (key) {
    case 'id': return 38
    case 'name': case 'description': return 40
    case 'part_number': return 24
    case 'pricing': return 14
    default: return 16
  }
}

/**
 * Any spreadsheet, read as a table of text: the header row is found rather than
 * assumed, and the cells come back keyed by whatever the file calls its columns.
 * Used by the price-list upload, where the columns are the supplier's, not ours.
 */
export interface SheetTable {
  name: string
  headers: string[]
  rows: Record<string, string>[]
  /** The file row the first data row came from, so the review can name it. */
  firstRowNumber: number
}

export async function readSheetTables(file: File): Promise<SheetTable[]> {
  const ExcelJS = await excel()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())

  const tables: SheetTable[] = []
  workbook.eachSheet((ws) => {
    let headerRow = 0
    let headers: string[] = []
    for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
      const cells = cellStrings(ws.getRow(r))
      // A header row is the first with at least two words in it and no blanks
      // between them — a title line has one cell, a data row has numbers.
      const filled = cells.filter((c) => c !== '')
      if (filled.length >= 2 && filled.every((c) => c.length < 60)) {
        headerRow = r
        headers = cells.map((c, i) => (c === '' ? `Column ${i + 1}` : c))
        break
      }
    }
    if (headerRow === 0) return

    const rows: Record<string, string>[] = []
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const cells = cellStrings(ws.getRow(r))
      if (cells.every((c) => c === '')) continue
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = cells[i] ?? '' })
      rows.push(row)
    }
    tables.push({ name: ws.name, headers, rows, firstRowNumber: headerRow + 1 })
  })
  return tables
}
