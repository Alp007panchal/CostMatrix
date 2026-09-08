import type { BomItem } from '../../lib/database.types'

/**
 * Shaping a costing's material into the four category exports. Pure, so the
 * grouping, ordering, totals and the CSV text are unit-tested; writing the
 * files is in bom-io.ts.
 */

/** The four exports, in the order the costing team lists them. */
export const BOM_CATEGORIES = [
  'switchgear',
  'busbar',
  'accessories_hardware',
  'enclosure_parts',
] as const

export interface BomGroup {
  category_code: string
  category_name: string
  rows: BomItem[]
  quantityUnits: number
  total: number
  hasOptions: boolean
}

/** One group per category, empty categories included so the four buttons are stable. */
export function groupBom(items: BomItem[], categoryNames: Record<string, string>): BomGroup[] {
  return BOM_CATEGORIES.map((code) => {
    const rows = items
      .filter((i) => i.category_code === code)
      .sort((a, b) => (a.option_label ?? '').localeCompare(b.option_label ?? '') || a.code.localeCompare(b.code))
    return {
      category_code: code,
      category_name: categoryNames[code] ?? items.find((i) => i.category_code === code)?.category_name ?? code,
      rows,
      quantityUnits: rows.reduce((s, r) => s + Number(r.quantity), 0),
      total: rows.reduce((s, r) => s + Number(r.line_total), 0),
      hasOptions: rows.some((r) => r.option_label),
    }
  })
}

export const BOM_HEADERS = ['Code', 'Description', 'Make', 'Part number', 'Unit', 'Qty', 'Unit price', 'Total'] as const

/** The rows of one export as plain cells, the same for CSV and XLSX. */
export function bomCells(group: BomGroup): (string | number)[][] {
  const withOption = group.hasOptions
  const header: string[] = withOption ? ['Option', ...BOM_HEADERS] : [...BOM_HEADERS]
  const body = group.rows.map((r) => {
    const cells: (string | number)[] = [
      r.code, r.name, r.manufacturer ?? '', r.part_number ?? '', r.unit,
      Number(r.quantity), Number(r.unit_price), Number(r.line_total),
    ]
    return withOption ? [r.option_label ?? 'Base', ...cells] : cells
  })
  const totalRow: (string | number)[] = withOption
    ? ['', 'TOTAL', '', '', '', '', '', '', group.total]
    : ['TOTAL', '', '', '', '', '', '', group.total]
  return [header, ...body, totalRow]
}

/** RFC 4180 CSV: quotes where needed, CRLF line ends, UTF-8 BOM so Excel reads it right. */
export function bomToCsv(group: BomGroup): string {
  const escape = (v: string | number) => {
    const s = typeof v === 'number' ? String(v) : v
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + bomCells(group).map((row) => row.map(escape).join(',')).join('\r\n') + '\r\n'
}

/** A safe file name: costing number, category, date. */
export function bomFileName(costingNo: string, revisionNo: number, category: string, ext: 'csv' | 'xlsx'): string {
  const rev = revisionNo > 0 ? `-rev${revisionNo}` : ''
  return `${costingNo}${rev}-bom-${category}.${ext}`.replace(/[^A-Za-z0-9._-]/g, '_')
}
