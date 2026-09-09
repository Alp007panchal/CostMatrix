import type { ComponentPrice, PricingMode } from '../../lib/database.types'

/**
 * Turning spreadsheet rows into a preview of what an upload would do.
 *
 * Pure functions, no I/O, so the matching rules — the easiest part of a bulk
 * upload to get wrong — are covered by unit tests. Reading and writing the
 * file itself lives in excel-io.ts.
 */

/** The columns of the sheet, in order. The header text is what people see. */
export const COLUMNS = [
  { key: 'id', header: 'Id (leave blank for new)' },
  { key: 'code', header: 'Code' },
  { key: 'name', header: 'Name' },
  { key: 'category', header: 'Category' },
  { key: 'manufacturer', header: 'Make' },
  { key: 'part_number', header: 'Part number' },
  { key: 'unit', header: 'Unit' },
  { key: 'pricing', header: 'Priced (fixed or weight)' },
  { key: 'price', header: 'Purchase price' },
  { key: 'currency', header: 'Currency' },
  { key: 'weight', header: 'Kg per unit' },
  { key: 'material_rate', header: 'Material rate code' },
  { key: 'cubicle', header: 'Enclosure cubicle (yes/no)' },
  { key: 'description', header: 'Description' },
] as const

export type ColumnKey = (typeof COLUMNS)[number]['key']

/** One spreadsheet row as read, cells keyed by column, everything a string. */
export type RawRow = Partial<Record<ColumnKey, string>> & { rowNumber: number }

export interface ParsedComponent {
  code: string
  name: string
  category_code: string
  manufacturer: string | null
  part_number: string | null
  unit: string
  description: string | null
  pricing_mode: PricingMode
  purchase_price: number | null
  purchase_currency: string
  weight_per_unit: number | null
  material_rate_code: string | null
  is_enclosure_cubicle: boolean
}

export interface FieldChange {
  field: string
  from: string
  to: string
}

export interface Preview {
  toCreate: { row: RawRow; parsed: ParsedComponent }[]
  toUpdate: { row: RawRow; existing: ComponentPrice; parsed: ParsedComponent; changes: FieldChange[] }[]
  unchanged: { row: RawRow; existing: ComponentPrice }[]
  rejected: { row: RawRow; reason: string }[]
}

/**
 * Matches a header cell to a column, forgivingly: case, spaces and
 * punctuation do not matter, and the older sheets' names are accepted too.
 */
export function columnForHeader(header: string): ColumnKey | null {
  const norm = header.toLowerCase().replace(/[^a-z0-9]/g, '')
  const aliases: Record<string, ColumnKey> = {
    id: 'id', idleaveblankfornew: 'id',
    code: 'code', itemcode: 'code',
    name: 'name', item: 'name', itemname: 'name',
    category: 'category',
    make: 'manufacturer', manufacturer: 'manufacturer', brand: 'manufacturer',
    partnumber: 'part_number', reference: 'part_number', partno: 'part_number', ref: 'part_number',
    unit: 'unit', uom: 'unit',
    priced: 'pricing', pricing: 'pricing', pricedfixedorweight: 'pricing', pricingmode: 'pricing',
    price: 'price', unitprice: 'price', purchaseprice: 'price',
    currency: 'currency', purchasecurrency: 'currency', ccy: 'currency',
    kgperunit: 'weight', weight: 'weight', kg: 'weight',
    materialratecode: 'material_rate', materialrate: 'material_rate', rate: 'material_rate',
    cubicle: 'cubicle', enclosurecubicle: 'cubicle', enclosurecubicleyesno: 'cubicle', iscubicle: 'cubicle',
    description: 'description', desc: 'description',
  }
  return aliases[norm] ?? null
}

/** Turns a raw row into a component, or explains why it cannot. */
export function parseRow(
  row: RawRow,
  validCategories: string[],
  defaultCategory: string | null,
): { ok: true; parsed: ParsedComponent } | { ok: false; reason: string } {
  const code = (row.code ?? '').trim()
  const name = (row.name ?? '').trim()
  if (!code) return { ok: false, reason: 'no code' }
  if (!name) return { ok: false, reason: 'no name' }

  const categoryCell = (row.category ?? '').trim()
  const category_code = categoryCell ? categoryFromText(categoryCell, validCategories) : defaultCategory
  if (!category_code) {
    return { ok: false, reason: categoryCell ? `unknown category "${categoryCell}"` : 'no category' }
  }

  const pricingText = (row.pricing ?? 'fixed').trim().toLowerCase()
  const pricing_mode: PricingMode = pricingText.startsWith('w') ? 'weight_rate' : 'fixed'

  const price = parseNumber(row.price)
  const weight = parseNumber(row.weight)
  const rateCode = (row.material_rate ?? '').trim() || null
  // The currency may sit in its own column or be written in front of the price.
  const currency = ((row.currency ?? '').trim() || currencyPrefix(row.price) || 'KES').toUpperCase()

  if (pricing_mode === 'fixed') {
    if (price == null) return { ok: false, reason: 'no price' }
    if (price < 0) return { ok: false, reason: 'negative price' }
    if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, reason: `currency "${currency}" is not a three-letter code` }
  } else {
    if (weight == null || weight <= 0) return { ok: false, reason: 'weight pricing needs kg per unit' }
    if (!rateCode) return { ok: false, reason: 'weight pricing needs a material rate code' }
  }

  return {
    ok: true,
    parsed: {
      code,
      name,
      category_code,
      manufacturer: (row.manufacturer ?? '').trim() || null,
      part_number: (row.part_number ?? '').trim() || null,
      unit: (row.unit ?? '').trim() || 'pcs',
      description: (row.description ?? '').trim() || null,
      pricing_mode,
      purchase_price: pricing_mode === 'fixed' ? price : null,
      purchase_currency: pricing_mode === 'fixed' ? currency : 'KES',
      weight_per_unit: pricing_mode === 'weight_rate' ? weight : null,
      material_rate_code: pricing_mode === 'weight_rate' ? rateCode : null,
      // Only an enclosure part can be a cubicle, whatever the cell says.
      is_enclosure_cubicle: category_code === 'enclosure_parts' && /^(y|yes|true|1|cubicle)$/i.test((row.cubicle ?? '').trim()),
    },
  }
}

/**
 * Which existing component a row refers to, if any: by id first, then by
 * part number within the same make, then by make and name.
 */
export function findExisting(
  row: RawRow,
  parsed: ParsedComponent,
  existing: ComponentPrice[],
): ComponentPrice | undefined {
  const id = (row.id ?? '').trim()
  if (id) return existing.find((c) => c.id === id)

  const make = norm(parsed.manufacturer)
  if (parsed.part_number) {
    const pn = norm(parsed.part_number)
    const hit = existing.find((c) => norm(c.part_number) === pn && norm(c.manufacturer) === make)
    if (hit) return hit
  }

  const byCode = existing.find((c) => norm(c.code) === norm(parsed.code))
  if (byCode) return byCode

  return existing.find((c) => norm(c.name) === norm(parsed.name) && norm(c.manufacturer) === make)
}

/** The fields that would change, in words a person can check. */
export function diff(existing: ComponentPrice, parsed: ParsedComponent): FieldChange[] {
  const out: FieldChange[] = []
  const compare = (field: string, from: unknown, to: unknown) => {
    const a = from == null ? '' : String(from)
    const b = to == null ? '' : String(to)
    if (a !== b) out.push({ field, from: a || '—', to: b || '—' })
  }
  compare('code', existing.code, parsed.code)
  compare('name', existing.name, parsed.name)
  compare('category', existing.category_code, parsed.category_code)
  compare('make', existing.manufacturer, parsed.manufacturer)
  compare('part number', existing.part_number, parsed.part_number)
  compare('unit', existing.unit, parsed.unit)
  compare('pricing', existing.pricing_mode, parsed.pricing_mode)
  compare('price', existing.raw_price, parsed.purchase_price)
  if (parsed.pricing_mode === 'fixed') compare('currency', existing.purchase_currency, parsed.purchase_currency)
  compare('kg per unit', existing.weight_per_unit, parsed.weight_per_unit)
  compare('material rate', existing.material_rate_code, parsed.material_rate_code)
  compare('cubicle', existing.is_enclosure_cubicle ? 'yes' : 'no', parsed.is_enclosure_cubicle ? 'yes' : 'no')
  compare('description', existing.description, parsed.description)
  return out
}

/** The whole preview: what an upload would create, change, leave and reject. */
export function buildPreview(
  rows: RawRow[],
  existing: ComponentPrice[],
  validCategories: string[],
  defaultCategory: string | null,
): Preview {
  const preview: Preview = { toCreate: [], toUpdate: [], unchanged: [], rejected: [] }
  const seenCodes = new Set<string>()

  for (const row of rows) {
    const result = parseRow(row, validCategories, defaultCategory)
    if (!result.ok) {
      preview.rejected.push({ row, reason: result.reason })
      continue
    }
    const { parsed } = result

    const codeKey = norm(parsed.code)
    if (seenCodes.has(codeKey)) {
      preview.rejected.push({ row, reason: `duplicate code "${parsed.code}" in this file` })
      continue
    }
    seenCodes.add(codeKey)

    const match = findExisting(row, parsed, existing)
    if (!match) {
      preview.toCreate.push({ row, parsed })
      continue
    }
    const changes = diff(match, parsed)
    if (changes.length === 0) preview.unchanged.push({ row, existing: match })
    else preview.toUpdate.push({ row, existing: match, parsed, changes })
  }
  return preview
}

// --- helpers -----------------------------------------------------------------

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function parseNumber(text: string | undefined): number | null {
  if (text == null) return null
  const cleaned = text.replace(/[,\s]/g, '').replace(/^[a-z]{3}/i, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** "EUR 42.00" → "EUR"; "KSH 5,000" → "KES"; a bare number → null. */
function currencyPrefix(text: string | undefined): string | null {
  const m = (text ?? '').trim().match(/^([a-z]{3})\b/i)
  if (!m) return null
  const code = m[1]!.toUpperCase()
  return code === 'KSH' ? 'KES' : code
}

/** Accepts the category code, its name, or a reasonable abbreviation. */
function categoryFromText(text: string, valid: string[]): string | null {
  const t = text.toLowerCase().replace(/[^a-z]/g, '')
  const direct = valid.find((v) => v.replace(/[^a-z]/g, '') === t)
  if (direct) return direct
  if (t.startsWith('switch')) return 'switchgear'
  if (t.startsWith('busbar') || t.startsWith('cable')) return 'busbar'
  if (t.startsWith('access') || t.startsWith('hardware')) return 'accessories_hardware'
  if (t.startsWith('enclos') || t.startsWith('fabric') || t.startsWith('sheet')) return 'enclosure_parts'
  return null
}
