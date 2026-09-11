import { readPrice } from '../library/price-list-read'

/**
 * Turning somebody else's parts list into rows the database can match
 * (roadmap 2.3). The same shape as the price-list reader next door, with a
 * quantity instead of a price — kept apart because the columns a BOM carries
 * and the ones a price list carries are different questions.
 */

export type BomField = 'key' | 'maker' | 'description' | 'qty' | 'unit'

export interface BomRow {
  row: number
  key: string
  maker?: string
  description?: string
  qty: string
  unit?: string
}

export type BomMapping = Partial<Record<BomField, string>>

export const BOM_FIELDS: { field: BomField; label: string; hint: string; needed: boolean }[] = [
  { field: 'key', label: 'Part number', hint: 'what to match the catalogue on', needed: true },
  { field: 'qty', label: 'Quantity', hint: 'blank means one of each', needed: false },
  { field: 'description', label: 'Description', hint: 'shown in the review, and kept on a placeholder', needed: false },
  { field: 'maker', label: 'Make', hint: 'helps when two parts share a reference', needed: false },
  { field: 'unit', label: 'Unit', hint: 'pcs, m, set', needed: false },
]

// Two passes: the words that can only mean one thing, then the looser ones. A
// schedule's "Item" column is usually its line number, so it must not take the
// description before a column actually called Description has been looked at.
const PATTERNS: { field: BomField; words: RegExp }[] = [
  { field: 'qty', words: /^(qty|quantity|no\.?\s*off|nos?\b|pcs|count|anzahl)\b/i },
  { field: 'key', words: /(part\s*(no|num|number|code)|article|catalogue|catalog|cat\.?\s*no|item\s*code|ordering|type\s*(no|code)|sku|mlfb)/i },
  { field: 'maker', words: /(make|manufacturer|brand|supplier|vendor|hersteller)/i },
  { field: 'unit', words: /^(unit|uom|units)\b/i },
  { field: 'description', words: /(description|desc\b|designation|bezeichnung)/i },
]

const LOOSE: { field: BomField; words: RegExp }[] = [
  { field: 'key', words: /(reference|ref\b|code)/i },
  { field: 'description', words: /(item|product|name|details)/i },
]

export function guessBomMapping(headers: string[]): BomMapping {
  const mapping: BomMapping = {}
  for (const { field, words } of [...PATTERNS, ...LOOSE]) {
    if (mapping[field]) continue
    const hit = headers.find((h) => h.trim() !== '' && words.test(h.trim()) && !Object.values(mapping).includes(h))
    if (hit) mapping[field] = hit
  }
  return mapping
}

export function missingBomFields(mapping: BomMapping): BomField[] {
  return BOM_FIELDS.filter((f) => f.needed && !mapping[f.field]).map((f) => f.field)
}

/**
 * A quantity as a schedule writes it: "3", "3 nos", "3.5 m", "2 sets". The number
 * is what matters; anything with no number at all comes back empty, so the row is
 * refused with the cell quoted rather than silently read as one.
 */
export function readQty(cell: string | undefined): string {
  const raw = (cell ?? '').trim()
  if (raw === '') return ''
  const match = /-?\d[\d., ]*/.exec(raw)
  if (!match) return ''
  return readPrice(match[0])
}

export function toBomRows(
  rows: Record<string, string>[],
  mapping: BomMapping,
  firstRowNumber = 2,
): BomRow[] {
  const out: BomRow[] = []
  rows.forEach((raw, i) => {
    const pick = (field: BomField): string => {
      const header = mapping[field]
      return header ? (raw[header] ?? '').trim() : ''
    }
    const key = pick('key')
    const description = pick('description')
    // A sheet's own sub-headings have a description and nothing else.
    if (key === '') return
    const row: BomRow = { row: firstRowNumber + i, key, qty: readQty(pick('qty')) }
    const maker = pick('maker')
    const unit = pick('unit')
    if (maker) row.maker = maker
    if (description) row.description = description
    if (unit) row.unit = unit
    out.push(row)
  })
  return out
}

/** What the review offers for a row, in the order a person decides it. */
export type RowChoice =
  | { kind: 'kit'; ref_id: string; label: string }
  | { kind: 'component'; ref_id: string; label: string }
  | { kind: 'placeholder'; label: string }
  | { kind: 'skip'; label: string }

/**
 * The choices for one previewed row: the kit whose main device it is, any other
 * kits that use it, the part on its own, a placeholder, or nothing. The default
 * is whatever the database proposed.
 */
export function choicesFor(raw: {
  component_id?: string
  component_name?: string
  component_code?: string
  kits?: { kit_id: string; name: string; has_unpriced_part?: boolean }[]
  proposal?: { kind: string; ref_id?: string }
}): { choices: RowChoice[]; defaultKey: string } {
  const choices: RowChoice[] = []
  for (const kit of raw.kits ?? []) {
    choices.push({
      kind: 'kit',
      ref_id: kit.kit_id,
      label: `Kit: ${kit.name}${kit.has_unpriced_part ? ' — has an unpriced part' : ''}`,
    })
  }
  if (raw.component_id) {
    choices.push({
      kind: 'component',
      ref_id: raw.component_id,
      label: `Part on its own: ${raw.component_code ?? ''} ${raw.component_name ?? ''}`.trim(),
    })
  }
  choices.push({ kind: 'placeholder', label: 'Add it to the library as a placeholder to price later' })
  choices.push({ kind: 'skip', label: 'Leave this row out' })

  const proposed = raw.proposal
  const defaultKey =
    proposed && proposed.ref_id
      ? `${proposed.kind}:${proposed.ref_id}`
      : raw.component_id
        ? `component:${raw.component_id}`
        : 'skip:'
  return { choices, defaultKey }
}

export const choiceKey = (choice: RowChoice): string =>
  'ref_id' in choice ? `${choice.kind}:${choice.ref_id}` : `${choice.kind}:`
