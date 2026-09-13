/**
 * Everything the PDF needs, already worked out. Building this is pure and
 * tested (prepare.ts); drawing it is not (Document.tsx). Keeping the two apart
 * means the numbers and wording can be checked without rendering a PDF.
 */

export interface PdfLetterhead {
  companyName: string
  lines: string[]            // P.O. Box, address, phones, email — whichever exist
  logoDataUrl: string | null
  footerLogoDataUrls: string[]
}

export interface PdfScheduleRow {
  itemNo: number
  description: string
  uom: string
  qty: string
  unitPrice: string
  total: string
}

export interface PdfSchedule {
  heading: string            // "LV BOARDS PRICE SCHEDULE" or "OPTION 1 — …"
  rows: PdfScheduleRow[]
  subtotal: string
  taxLabel: string           // "16% VAT-IN KSH."
  tax: string
  total: string
  /**
   * Extras offered with this option: priced and printed under the schedule, and
   * deliberately not in the total above. Empty on an ordinary job.
   */
  optionalRows: PdfScheduleRow[]
  optionalSubtotal: string
  optionalTax: string
  optionalTotal: string
}

export interface PdfTechnicalRow {
  srNo: number
  particular: string
  description: string
  qty: string
}

export interface PdfTerm {
  heading: string
  body: string
}

/** One device drawn on a GA sheet, with the tag the technical offer repeats. */
export interface PdfGaDevice {
  tag: string
  label: string
  costingAssemblyId: string
  face: 'front' | 'rear'
  heightMm: number
  yMm: number
  quantity: number
  unsized: boolean
}

/** One section of the board, as the GA sheet draws it. */
export interface PdfGaSection {
  name: string
  widthMm: number
  depthMm: number | null
  design: string
  designWords: string
  busbarCompartmentMm: number
  form: string | null
  doubleFront: boolean
  devices: PdfGaDevice[]
}

/**
 * One general-arrangement sheet: the front elevation of one panel, on its own
 * landscape page (spec §5). Only panels with a saved layout get one.
 */
export interface PdfGaSheet {
  panelId: string
  panelName: string
  optionLabel: string | null
  construction: string
  version: number
  widthMm: number
  heightMm: number
  baseMm: number
  depthMm: number | null
  sections: PdfGaSection[]
  specLine: string
  hasRearFace: boolean
}

export interface QuotationPdfData {
  letterhead: PdfLetterhead
  referenceNo: string
  dateLong: string           // "Tuesday, 30 June 2026"
  customerName: string
  customerAddress: string | null
  salutation: string
  subject: string
  introText: string
  closingText: string
  signatoryName: string | null
  signatoryEmail: string | null
  notesOnOffer: string[]     // one bullet per line
  currencyLabel: string
  schedules: PdfSchedule[]
  terms: PdfTerm[]
  technical: PdfTechnicalRow[]
  /** Annexure V, one landscape sheet per panel that has a saved layout. */
  gaSheets: PdfGaSheet[]
}
