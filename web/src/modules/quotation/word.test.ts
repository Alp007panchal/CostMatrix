import { describe, expect, it } from 'vitest'
import type { PdfTechnicalRow } from './pdf/types'
import { type WordJob, buildWordDocument, fileName, splitDrawings } from './word'

const job: WordJob = {
  companyName: 'NATIONWIDE ELECTRICAL INDUSTRIES LTD',
  costingNo: 'CM-2026-0007',
  revisionNo: 1,
  title: 'Main LV board',
  customerName: 'TRICLOVER LIMITED',
  dateLong: '13 September 2026',
  eplanProject: 'NPP-201 MAIN LV',
  drawingNumbers: ['E-201-01', 'E-201-02'],
}

const row = (over: Partial<PdfTechnicalRow> = {}): PdfTechnicalRow => ({
  srNo: 1,
  particular: 'MAIN LV BOARD',
  description: 'INCOMING SECTION\n\n1 No. ACB 1600 A, Siemens (3WA1216)\n\nOUTGOERS\n\n4 No. MCCB 400 A',
  qty: '1',
  ...over,
})

describe('the technical offer as a Word document', () => {
  it('opens with the heading and the job it came from', () => {
    const doc = buildWordDocument([row()], job)
    expect(doc.blocks[0]).toEqual({ kind: 'title', text: 'DETAILED TECHNICAL OFFER' })
    expect(doc.blocks).toContainEqual({ kind: 'meta', label: 'Costing', value: 'CM-2026-0007 REV1' })
  })

  it('carries the drawing office’s references where the costing has them', () => {
    const doc = buildWordDocument([row()], job)
    expect(doc.blocks).toContainEqual({ kind: 'meta', label: 'EPLAN project', value: 'NPP-201 MAIN LV' })
    expect(doc.blocks).toContainEqual({ kind: 'meta', label: 'Drawing numbers', value: 'E-201-01, E-201-02' })
  })

  it('and says nothing about them when there are none, rather than printing a blank label', () => {
    const doc = buildWordDocument([row()], { ...job, eplanProject: null, drawingNumbers: [] })
    expect(doc.blocks.some((b) => b.kind === 'meta' && b.label === 'EPLAN project')).toBe(false)
    expect(doc.blocks.some((b) => b.kind === 'meta' && b.label === 'Drawing numbers')).toBe(false)
  })

  it('gives each panel its own heading with the quantity', () => {
    const doc = buildWordDocument([row(), row({ srNo: 2, particular: 'SUB BOARD', qty: '3' })], job)
    expect(doc.blocks).toContainEqual({ kind: 'panel', srNo: 2, particular: 'SUB BOARD', qty: '3' })
  })

  it('turns the description’s paragraphs into paragraphs a person can edit', () => {
    const doc = buildWordDocument([row()], job)
    const bodies = doc.blocks.filter((b) => b.kind === 'body').map((b) => (b as { text: string }).text)
    expect(bodies).toContain('INCOMING SECTION')
    expect(bodies).toContain('1 No. ACB 1600 A, Siemens (3WA1216)')
    expect(bodies).toContain('OUTGOERS')
  })

  it('folds a single line break inside a paragraph, rather than splitting a sentence', () => {
    const doc = buildWordDocument([row({ description: 'One line\nand its continuation' })], job)
    const bodies = doc.blocks.filter((b) => b.kind === 'body').map((b) => (b as { text: string }).text)
    expect(bodies).toContain('One line and its continuation')
  })

  it('puts a dash where a panel has no description at all', () => {
    const doc = buildWordDocument([row({ description: '' })], job)
    expect(doc.blocks).toContainEqual({ kind: 'body', text: '—' })
  })

  it('says plainly when there is nothing to describe', () => {
    const doc = buildWordDocument([], job)
    expect(doc.blocks.some((b) => b.kind === 'body' && b.text.includes('no panels yet'))).toBe(true)
    // And it does not then add a Notes section to an empty document.
    expect(doc.blocks.some((b) => b.kind === 'heading')).toBe(false)
  })

  it('ends by saying the document is a copy, so nobody edits it expecting the costing to change', () => {
    const doc = buildWordDocument([row()], job)
    const last = doc.blocks[doc.blocks.length - 1]
    expect(last?.kind).toBe('body')
    expect((last as { text: string }).text).toContain('nothing typed here changes the costing')
  })

  it('names the file after the costing and its revision', () => {
    expect(fileName(job)).toBe('CM-2026-0007-REV1-technical-offer.docx')
  })
})

describe('drawing numbers as the engineer keeps them', () => {
  it('split on new lines, commas and semicolons alike', () => {
    expect(splitDrawings('E-201-01\nE-201-02, E-201-03; E-201-04')).toEqual([
      'E-201-01', 'E-201-02', 'E-201-03', 'E-201-04',
    ])
  })

  it('and nothing is nothing', () => {
    expect(splitDrawings(null)).toEqual([])
    expect(splitDrawings('  \n ,  ')).toEqual([])
  })
})
