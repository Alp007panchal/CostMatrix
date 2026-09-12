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
  /**
   * What the job being built costs in this category: the chosen option's rows,
   * without the optional extras. Every row is still listed and flagged — a bill
   * of materials that quietly drops lines is worse than one that marks them.
   */
  total: number
  /** What the extras in this category would add if the customer took them. */
  optionalTotal: number
  hasOptions: boolean
  hasExtras: boolean
}

/** One group per category, empty categories included so the four buttons are stable. */
export function groupBom(items: BomItem[], categoryNames: Record<string, string>): BomGroup[] {
  return BOM_CATEGORIES.map((code) => {
    const rows = items
      .filter((i) => i.category_code === code)
      .sort((a, b) => (a.option_label ?? '').localeCompare(b.option_label ?? '') || a.code.localeCompare(b.code))
    const bought = rows.filter((r) => r.in_chosen_offer && !r.is_option)
    const extras = rows.filter((r) => r.in_chosen_offer && r.is_option)
    return {
      category_code: code,
      category_name: categoryNames[code] ?? items.find((i) => i.category_code === code)?.category_name ?? code,
      rows,
      quantityUnits: bought.reduce((s, r) => s + Number(r.quantity), 0),
      total: bought.reduce((s, r) => s + Number(r.line_total), 0),
      optionalTotal: extras.reduce((s, r) => s + Number(r.line_total), 0),
      hasOptions: rows.some((r) => r.option_label),
      hasExtras: rows.some((r) => r.is_option),
    }
  })
}

export const BOM_HEADERS = ['Code', 'Description', 'Make', 'Part number', 'Unit', 'Qty', 'Unit price', 'Total'] as const

/**
 * The rows of one export as plain cells, the same for CSV and XLSX. An Option
 * column appears only on a job offered more than one way, and an Optional column
 * only where there are extras, so an ordinary job's export is unchanged.
 */
export function bomCells(group: BomGroup): (string | number)[][] {
  const lead: string[] = [
    ...(group.hasOptions ? ['Option'] : []),
    ...(group.hasExtras ? ['Optional'] : []),
  ]
  const header: string[] = [...lead, ...BOM_HEADERS]
  const body = group.rows.map((r) => [
    ...(group.hasOptions ? [r.option_label ?? 'Base'] : []),
    ...(group.hasExtras ? [r.is_option ? 'Optional extra' : ''] : []),
    r.code, r.name, r.manufacturer ?? '', r.part_number ?? '', r.unit,
    Number(r.quantity), Number(r.unit_price), Number(r.line_total),
  ] as (string | number)[])
  const foot = (caption: string, value: number): (string | number)[] => {
    const row: (string | number)[] = header.map(() => '')
    row[0] = caption
    row[header.length - 1] = value
    return row
  }
  return [
    header,
    ...body,
    foot('TOTAL', group.total),
    ...(group.hasExtras ? [foot('OPTIONAL EXTRAS (not in the total)', group.optionalTotal)] : []),
  ]
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
