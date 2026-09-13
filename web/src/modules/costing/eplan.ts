/**
 * The parts list the drawing office imports (roadmap 4.3).
 *
 * EPLAN's parts management imports CSV, and which columns a house maps is its own
 * business — so this writes **named columns in a fixed order**, documented in
 * `docs/operations.md`, rather than guessing at one EPLAN version's schema. A
 * mapping is set up once in EPLAN against these headings and then never again.
 *
 * Everything comes from the frozen costing lines and from the panel layout's own
 * device tags, so the parts list, the GA drawing and the technical offer name the
 * same device. Pure, so the file can be checked without a browser.
 */

/** One row of `v_eplan_parts`. */
export interface EplanPart {
  costing_id: string
  panel_id: string
  panel: string
  panel_quantity: number
  section: string | null
  kit: string | null
  device_tag: string | null
  part_number: string | null
  manufacturer: string | null
  description: string
  code: string
  category_code: string
  quantity: number
  unit: string
  mounting_type: string | null
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  weight_kg: number | null
}

export interface EplanJob {
  costingNo: string
  revisionNo: number
  title: string
  eplanProject: string | null
  drawingNumbers: string | null
}

/** The columns, in order. Changing one means re-mapping in EPLAN, so they are stable. */
export const EPLAN_COLUMNS = [
  'Device tag',
  'Part number',
  'Manufacturer',
  'Description',
  'Quantity',
  'Unit',
  'Panel',
  'Panel quantity',
  'Section',
  'Kit',
  'Mounting',
  'Width mm',
  'Height mm',
  'Depth mm',
  'Weight kg',
  'Our code',
  'Category',
  'Costing',
  'EPLAN project',
  'Drawing numbers',
] as const

/**
 * One row per part, in the column order above. The quantity is **per panel**, as
 * the costing holds it; the panel quantity is given beside it so the drawing
 * office can see a board is built twice rather than finding doubled figures.
 */
export function eplanRows(parts: EplanPart[], job: EplanJob): (string | number)[][] {
  return parts.map((part) => [
    part.device_tag ?? '',
    part.part_number ?? '',
    part.manufacturer ?? '',
    part.description,
    round(part.quantity),
    part.unit,
    part.panel,
    round(part.panel_quantity),
    part.section ?? '',
    part.kit ?? '',
    part.mounting_type ?? '',
    part.width_mm ?? '',
    part.height_mm ?? '',
    part.depth_mm ?? '',
    part.weight_kg ?? '',
    part.code,
    part.category_code,
    `${job.costingNo} REV${job.revisionNo}`,
    job.eplanProject ?? '',
    // Several drawings are kept a line apart on the costing; a CSV cell wants one.
    (job.drawingNumbers ?? '').split(/\r?\n/).map((d) => d.trim()).filter(Boolean).join('; '),
  ])
}

export function eplanCells(parts: EplanPart[], job: EplanJob): (string | number)[][] {
  return [[...EPLAN_COLUMNS], ...eplanRows(parts, job)]
}

export function eplanToCsv(parts: EplanPart[], job: EplanJob): string {
  return eplanCells(parts, job).map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function eplanFileName(job: EplanJob, extension: 'csv' | 'xlsx'): string {
  const project = (job.eplanProject ?? '').trim()
  const tail = project === '' ? '' : `-${safe(project)}`
  return `${job.costingNo}-REV${job.revisionNo}${tail}-parts.${extension}`
}

/**
 * What is missing before the drawing office can use this, in the words a person
 * can act on. Said out loud rather than exported quietly: a parts list whose rows
 * have no part number is no use to anybody.
 */
export function eplanGaps(parts: EplanPart[]): string[] {
  const gaps: string[] = []
  const noPart = parts.filter((p) => (p.part_number ?? '').trim() === '').length
  const noTag = parts.filter((p) => p.device_tag === null).length
  if (parts.length === 0) return ['This costing has no lines yet, so there is nothing to export.']
  if (noPart > 0) {
    gaps.push(`${noPart} of ${parts.length} rows have no manufacturer part number. EPLAN matches on that, so those rows will not find a part.`)
  }
  if (noTag === parts.length) {
    gaps.push('No row has a device tag: no panel on this costing has been laid out yet. The list still imports; the devices just will not match a drawing.')
  } else if (noTag > 0) {
    gaps.push(`${noTag} rows have no device tag, because the kits they belong to are not placed on a layout yet.`)
  }
  return gaps
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function safe(text: string): string {
  return text.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}
