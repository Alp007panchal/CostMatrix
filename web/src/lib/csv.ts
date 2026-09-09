/**
 * A small CSV reader (RFC 4180): quoted fields, doubled quotes inside them,
 * commas and line breaks inside quotes, CRLF or LF line ends. Returns the
 * header names and one object per data row keyed by header. Blank lines are
 * skipped. Good enough for the seed files and for spreadsheets saved as CSV.
 */
export interface CsvTable {
  headers: string[]
  rows: Record<string, string>[]
}

export function parseCsv(text: string): CsvTable {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let quoted = false
  const src = text.startsWith('﻿') ? text.slice(1) : text

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      record.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      record.push(field)
      field = ''
      if (record.some((f) => f !== '')) records.push(record)
      record = []
    } else {
      field += ch
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field)
    if (record.some((f) => f !== '')) records.push(record)
  }

  const headers = (records.shift() ?? []).map((h) => h.trim())
  const rows = records.map((r) => {
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = (r[i] ?? '').trim()
    })
    return row
  })
  return { headers, rows }
}
