/**
 * Turning a supplier's file into rows the database can preview (roadmap 2.2).
 *
 * Pure functions, no I/O: reading the file itself is the page's job, and the
 * matching is the database's. What lives here is the part that is easiest to get
 * quietly wrong — which column is the price, what "1 234,50" means, and how to
 * find a table inside a PDF's text — so it is all unit tested.
 */

/** The five things a price list row can carry. Only key and price are needed. */
export type PriceField = 'key' | 'maker' | 'description' | 'price' | 'currency'

export interface PriceListRow {
  row: number
  key: string
  maker?: string
  description?: string
  price: string
  currency?: string
}

/** header text → field, as the page shows it in the mapping boxes. */
export type Mapping = Partial<Record<PriceField, string>>

export const FIELD_LABELS: { field: PriceField; label: string; hint: string; needed: boolean }[] = [
  { field: 'key', label: 'Part number or code', hint: 'what to match the catalogue on', needed: true },
  { field: 'price', label: 'Price', hint: 'the new purchase price', needed: true },
  { field: 'currency', label: 'Currency', hint: 'if the file says; otherwise the part keeps its own', needed: false },
  { field: 'maker', label: 'Make', hint: 'helps when two parts share a reference', needed: false },
  { field: 'description', label: 'Description', hint: 'shown in the review, never saved', needed: false },
]

// Words suppliers actually use, most specific first so "unit price" beats "unit".
const PATTERNS: { field: PriceField; words: RegExp }[] = [
  { field: 'price', words: /^(net\s*price|unit\s*price|list\s*price|price|rate|amount|cost|mrp|net)\b/i },
  { field: 'key', words: /(part\s*(no|num|number|code)|article|catalogue|catalog|cat\.?\s*no|item\s*code|ordering|reference|ref\b|sku|code)/i },
  { field: 'currency', words: /(currency|curr\b|ccy)/i },
  { field: 'maker', words: /(make|manufacturer|brand|supplier|vendor)/i },
  { field: 'description', words: /(description|desc\b|item|product|name|details)/i },
]

/** A first guess at which column is which, which the person then corrects. */
export function guessMapping(headers: string[]): Mapping {
  const mapping: Mapping = {}
  for (const { field, words } of PATTERNS) {
    const hit = headers.find((h) => h.trim() !== '' && words.test(h.trim()) && !Object.values(mapping).includes(h))
    if (hit) mapping[field] = hit
  }
  return mapping
}

/** What is still missing before the file can be previewed. */
export function missingFields(mapping: Mapping): PriceField[] {
  return FIELD_LABELS.filter((f) => f.needed && !mapping[f.field]).map((f) => f.field)
}

/**
 * A price as written anywhere in the world: "1,234.50", "1 234,50", "KES 1.234,50",
 * "(12.00)" for a credit, "—" for nothing. Returns the text the database should
 * parse, or '' when the cell holds no number at all, so the row is rejected with
 * the cell quoted rather than silently read as zero.
 */
export function readPrice(cell: string | undefined): string {
  const raw = (cell ?? '').trim()
  if (raw === '') return ''
  // Strip currency words and symbols, keep digits, separators and a leading minus.
  let text = raw.replace(/[^\d.,\-']/g, '').replace(/'/g, '')
  if (text === '' || !/\d/.test(text)) return ''
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // Both present: whichever comes last is the decimal point.
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  } else if (lastComma > -1) {
    // One comma: a decimal comma if it has one or two digits after it, else thousands.
    const after = text.length - lastComma - 1
    text = after > 0 && after <= 2 ? text.replace(',', '.') : text.replace(/,/g, '')
  }
  const negative = raw.startsWith('(') && raw.endsWith(')')
  text = text.replace(/-/g, '')
  return negative ? `-${text}` : text
}

/** Rows as the database's start_price_list wants them, from a mapped table. */
export function toPriceRows(
  rows: Record<string, string>[],
  mapping: Mapping,
  firstRowNumber = 2,
): PriceListRow[] {
  const out: PriceListRow[] = []
  rows.forEach((raw, i) => {
    const pick = (field: PriceField): string => {
      const header = mapping[field]
      return header ? (raw[header] ?? '').trim() : ''
    }
    const key = pick('key')
    const price = readPrice(pick('price'))
    // A sheet's own sub-headings have neither; skip them rather than reject them.
    if (key === '' && price === '') return
    const row: PriceListRow = { row: firstRowNumber + i, key, price }
    const maker = pick('maker')
    const description = pick('description')
    const currency = pick('currency').toUpperCase()
    if (maker) row.maker = maker
    if (description) row.description = description
    if (currency) row.currency = currency.replace(/[^A-Z]/g, '').slice(0, 3)
    out.push(row)
  })
  return out
}

/**
 * A table out of a PDF's extracted text (the extract-document function has
 * already read it). Each line becomes a row when it holds a reference-looking
 * token and a number; the rest — page headers, terms, addresses — is ignored.
 * Crude on purpose: the person sees every row in the review before anything is
 * saved, and a PDF nobody can parse is better said out loud than guessed at.
 */
export function rowsFromPdfText(text: string): PriceListRow[] {
  const out: PriceListRow[] = []
  let n = 0
  for (const line of text.split('\n')) {
    n += 1
    const clean = line.replace(/^---\s*page\s*\d+\s*---$/i, '').trim()
    if (clean === '' || clean.length > 300) continue
    // Split on tabs first (Excel-ish text), else on runs of two or more spaces.
    const cells = (clean.includes('\t') ? clean.split('\t') : clean.split(/\s{2,}/)).map((c) => c.trim())
    if (cells.length < 2) continue
    // The price is the last cell that reads as a number; the key is the first
    // cell with at least two digits or a dash in it, which references have.
    let price = ''
    let priceAt = -1
    for (let i = cells.length - 1; i >= 0; i--) {
      const candidate = readPrice(cells[i])
      if (candidate !== '' && Number(candidate) > 0) { price = candidate; priceAt = i; break }
    }
    if (price === '') continue
    const key = cells.find((c, i) => i !== priceAt && /^[A-Za-z0-9][A-Za-z0-9.\-/+ ]{2,}$/.test(c) && /\d/.test(c))
    if (!key) continue
    const description = cells.find((c, i) => i !== priceAt && c !== key && c.length > 3)
    const row: PriceListRow = { row: n, key: key.trim(), price }
    if (description) row.description = description
    out.push(row)
  }
  return out
}

/** "+12.5 %" / "−3 %" / "—", for the review table. */
export function changeLabel(pct: number | null | undefined): string {
  if (pct == null) return '—'
  const rounded = Math.round(pct * 10) / 10
  if (rounded === 0) return '0 %'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} %`
}
