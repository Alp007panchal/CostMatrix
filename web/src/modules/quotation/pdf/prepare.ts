import type { Letterhead, QuotationTerms } from '../../../lib/database.types'
import type { CostingDetail } from '../../costing/api'
import { describePanel } from '../../costing/technical'
import { buildGaSheets, gaTagLine, type SavedPanelLayout } from './ga'
import type { PdfGaSheet, PdfSchedule, PdfScheduleRow, PdfTechnicalRow, PdfTerm, QuotationPdfData } from './types'

/**
 * Turns a costing, the company's letterhead and the approver's wording into
 * the data the PDF draws. Pure, so the grouping into options, the numbering
 * and the wording defaults are unit-tested.
 */

export interface PrepareInput {
  detail: CostingDetail
  letterhead: Letterhead
  logoDataUrl: string | null
  footerLogoDataUrls: string[]
  referenceNo: string
  releasedAt: Date
  customerName: string
  customerAddress: string | null
  subject: string
  salutation: string
  introText: string
  closingText: string
  notesOnOffer: string | null
  terms: QuotationTerms
  signatoryName: string | null
  signatoryEmail: string | null
  /**
   * The layouts saved against this costing's panels (roadmap 3.8). Omitted or
   * empty means no general-arrangement sheets and a quotation byte-identical to
   * one released before the layout existed.
   */
  layouts?: SavedPanelLayout[]
}

export function prepareQuotationPdf(input: PrepareInput): QuotationPdfData {
  const { detail, letterhead } = input
  const label = detail.costing.currency_label
  const gaSheets = buildGaSheets(detail, input.layouts ?? [])

  return {
    letterhead: {
      companyName: letterhead.company_name,
      lines: [
        letterhead.po_box ? `P.O BOX ${letterhead.po_box}` : null,
        letterhead.street_address,
        letterhead.phones ? `Office lines: ${letterhead.phones}` : null,
        letterhead.email ? `Email: ${letterhead.email}` : null,
      ].filter((l): l is string => Boolean(l && l.trim())),
      logoDataUrl: input.logoDataUrl,
      footerLogoDataUrls: input.footerLogoDataUrls,
    },
    referenceNo: input.referenceNo,
    dateLong: longDate(input.releasedAt),
    customerName: input.customerName.toUpperCase(),
    customerAddress: input.customerAddress,
    salutation: input.salutation,
    subject: input.subject.toUpperCase(),
    introText: input.introText,
    closingText: input.closingText,
    signatoryName: input.signatoryName,
    signatoryEmail: input.signatoryEmail,
    notesOnOffer: splitLines(input.notesOnOffer),
    currencyLabel: label,
    schedules: buildSchedules(detail, label),
    terms: buildTerms(input.terms),
    technical: buildTechnical(detail, gaSheets),
    gaSheets,
  }
}

/** The price schedule, one per option; a job with no options gets one table. */
export function buildSchedules(detail: CostingDetail, label: string): PdfSchedule[] {
  const priceByPanel = new Map(detail.panelPrices.map((p) => [p.panel_id, p]))
  const taxPct = detail.costing.tax_pct

  const groups = new Map<string, typeof detail.panels>()
  for (const panel of detail.panels) {
    const key = panel.option_label?.trim() ?? ''
    groups.set(key, [...(groups.get(key) ?? []), panel])
  }

  const optionTotals = new Map(detail.optionTotals.map((o) => [o.option_label, o]))

  return [...groups.entries()].map(([optionLabel, panels]) => {
    const totals = optionTotals.get(optionLabel)
    const row = (panel: (typeof panels)[number], i: number): PdfScheduleRow => {
      const price = priceByPanel.get(panel.id)
      return {
        itemNo: i + 1,
        description: panel.name.toUpperCase(),
        uom: panel.uom,
        qty: formatQty(panel.quantity),
        unitPrice: formatMoney(price?.unit_price ?? 0),
        total: formatMoney(price?.line_total ?? 0),
      }
    }
    return {
      heading: optionLabel
        ? `${optionLabel.toUpperCase()} — PRICE SCHEDULE`
        : 'LV BOARDS PRICE SCHEDULE',
      // Roadmap 2.7: the extras are quoted under the schedule they belong to, so
      // the subtotal and VAT above them are what the customer owes for the offer.
      rows: panels.filter((p) => !p.is_option).map(row),
      subtotal: formatMoney(totals?.subtotal ?? 0),
      taxLabel: `${trimPct(taxPct)}% VAT-IN ${label}.`,
      tax: formatMoney(totals?.tax ?? 0),
      total: formatMoney(totals?.grand_total ?? 0),
      optionalRows: panels.filter((p) => p.is_option).map(row),
      optionalSubtotal: formatMoney(totals?.optional_subtotal ?? 0),
      optionalTax: formatMoney(totals?.optional_tax ?? 0),
      optionalTotal: formatMoney(totals?.optional_total ?? 0),
    }
  })
}

export function buildTerms(terms: QuotationTerms): PdfTerm[] {
  const all: [string, string | null][] = [
    ['SCOPE OF SUPPLY', terms.scope_of_supply],
    ['VALIDITY PERIOD', terms.validity],
    ['TERMS OF PAYMENT', terms.payment],
    ['DELIVERY TERMS', terms.delivery_terms],
    ['DELIVERY TIMELINES', terms.delivery_timelines],
  ]
  return all
    .filter((t): t is [string, string] => Boolean(t[1] && t[1].trim()))
    .map(([heading, body]) => ({ heading, body: body.trim() }))
}

/**
 * One row per panel. The engineer's own text when there is one; otherwise a
 * description written from the panel's kits and lines, so the annexure is
 * never blank for a costed panel.
 */
export function buildTechnical(detail: CostingDetail, gaSheets: PdfGaSheet[] = []): PdfTechnicalRow[] {
  const sheetByPanel = new Map(gaSheets.map((sheet) => [sheet.panelId, sheet]))
  return detail.panels.map((panel, i) => {
    const written = panel.technical_description?.trim() ?? ''
    const generated = written ? '' : describePanel({ panel, assemblies: detail.assemblies, items: detail.items, kits: detail.kits })
    const parts = [written || generated]
    if (panel.enclosure_dimensions?.trim()) {
      parts.push(`Proposed Enclosure: ${panel.enclosure_dimensions.trim()}`)
    }
    // The device tags come from the drawing, so the two always agree (spec §7).
    // A panel with no drawing gains nothing, and its row reads as it always did.
    const sheet = sheetByPanel.get(panel.id)
    if (sheet !== undefined) {
      const tags = gaTagLine(sheet)
      if (tags !== '') parts.push(tags)
    }
    return {
      srNo: i + 1,
      particular: [panel.name, panel.option_label, panel.is_option ? 'optional extra' : null]
        .filter(Boolean).join(' - ').toUpperCase(),
      description: parts.filter(Boolean).join('\n\n'),
      qty: formatQty(panel.quantity),
    }
  })
}

// --- formatting, in the style of the reference document ----------------------

export function formatMoney(n: number): string {
  return n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n)
}

export function longDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

export function splitLines(text: string | null): string[] {
  if (!text) return []
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•\-–*]+/, '').trim())
    .filter(Boolean)
}

function trimPct(n: number): string {
  return String(Number(n.toFixed(3)))
}
