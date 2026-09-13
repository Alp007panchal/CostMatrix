// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PdfTechnicalRow } from '../quotation/pdf/types'
import type { EplanPart } from './eplan'
import { EplanCard } from './EplanCard'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const eplanParts = vi.fn()
const setEplanMetadata = vi.fn()
const importEplanMetadata = vi.fn()
vi.mock('./eplan-api', () => ({
  eplanParts: (...a: unknown[]) => eplanParts(...a),
  setEplanMetadata: (...a: unknown[]) => setEplanMetadata(...a),
  importEplanMetadata: (...a: unknown[]) => importEplanMetadata(...a),
}))
const downloadEplanCsv = vi.fn()
const downloadEplanXlsx = vi.fn()
vi.mock('./eplan-io', () => ({
  downloadEplanCsv: (...a: unknown[]) => downloadEplanCsv(...a),
  downloadEplanXlsx: (...a: unknown[]) => downloadEplanXlsx(...a),
}))
const downloadWordDocument = vi.fn()
vi.mock('../quotation/word-io', () => ({
  downloadWordDocument: (...a: unknown[]) => downloadWordDocument(...a),
}))

const PART: EplanPart = {
  costing_id: 'c', panel_id: 'p1', panel: 'MAIN LV BOARD', panel_quantity: 1,
  section: 'Incomer', kit: 'ACB KIT', device_tag: 'Q1',
  part_number: '3WA1216', manufacturer: 'SIEMENS', description: 'ACB 1600 A',
  code: 'ACB1600', category_code: 'switchgear', quantity: 1, unit: 'pcs',
  mounting_type: 'withdrawable', width_mm: 400, height_mm: 450, depth_mm: 300, weight_kg: 62,
}

const TECHNICAL: PdfTechnicalRow[] = [
  { srNo: 1, particular: 'MAIN LV BOARD', description: 'INCOMING SECTION', qty: '1' },
]

beforeEach(() => {
  eplanParts.mockResolvedValue([PART])
  setEplanMetadata.mockResolvedValue(undefined)
  downloadWordDocument.mockResolvedValue(undefined)
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

function open(props: Partial<Parameters<typeof EplanCard>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <EplanCard
        costingId="c"
        costingNo="CM-2026-0007"
        revisionNo={1}
        title="Main LV board"
        customerName={null}
        companyName="NATIONWIDE"
        eplanProject={null}
        drawingNumbers={null}
        technical={TECHNICAL}
        editable
        onSaved={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('the drawing office card', () => {
  it('shows the project and drawing numbers the costing already carries', async () => {
    open({ eplanProject: 'NPP-201 MAIN LV', drawingNumbers: 'E-201-01' })
    expect((await screen.findByLabelText('EPLAN project') as HTMLInputElement).value).toBe('NPP-201 MAIN LV')
    expect((screen.getByLabelText('Drawing numbers') as HTMLTextAreaElement).value).toBe('E-201-01')
  })

  it('saves them, and says no price moved', async () => {
    open()
    fireEvent.change(await screen.findByLabelText('EPLAN project'), { target: { value: 'NPP-201' } })
    fireEvent.click(screen.getByText('Save project details'))
    await waitFor(() => expect(setEplanMetadata).toHaveBeenCalledWith('c', 'NPP-201', ''))
    expect(await screen.findByText(/No price moved/)).toBeTruthy()
  })

  it('will not let an approved costing be re-referenced', async () => {
    open({ editable: false })
    expect(await screen.findByLabelText('EPLAN project')).toHaveProperty('disabled', true)
    expect(screen.getByText('Save project details')).toHaveProperty('disabled', true)
    // The exports are still offered: reading an approved costing is not editing it.
    expect(await screen.findByText('1 part line(s)')).toBeTruthy()
    expect(screen.getByText('Parts list (CSV)')).toHaveProperty('disabled', false)
  })

  it('writes the technical offer as Word, with the references on it', async () => {
    open({ eplanProject: 'NPP-201', drawingNumbers: 'E-201-01, E-201-02' })
    fireEvent.click(await screen.findByText('Technical offer as Word'))
    await waitFor(() => expect(downloadWordDocument).toHaveBeenCalled())
    const doc = downloadWordDocument.mock.calls[0]?.[0] as { blocks: unknown[] }
    expect(doc.blocks).toContainEqual({ kind: 'meta', label: 'EPLAN project', value: 'NPP-201' })
    expect(await screen.findByText(/it is a copy/)).toBeTruthy()
  })

  it('exports the parts list as CSV and as Excel', async () => {
    open()
    expect(await screen.findByText('1 part line(s)')).toBeTruthy()
    fireEvent.click(screen.getByText('Parts list (CSV)'))
    await waitFor(() => expect(downloadEplanCsv).toHaveBeenCalled())
    fireEvent.click(screen.getByText('Parts list (Excel)'))
    await waitFor(() => expect(downloadEplanXlsx).toHaveBeenCalled())
  })

  it('says how many part lines there are', async () => {
    open()
    expect(await screen.findByText('1 part line(s)')).toBeTruthy()
  })

  it('will not export a parts list that does not exist', async () => {
    eplanParts.mockResolvedValue([])
    open()
    await waitFor(() => expect(screen.getByText('Parts list (CSV)')).toHaveProperty('disabled', true))
    expect(await screen.findByText(/no lines yet/)).toBeTruthy()
  })

  it('warns when rows have no part number, because that is what EPLAN matches on', async () => {
    eplanParts.mockResolvedValue([PART, { ...PART, part_number: null }])
    open()
    expect(await screen.findByText(/1 of 2 rows have no manufacturer part number/)).toBeTruthy()
  })

  it('warns when nothing has been laid out, without blocking the export', async () => {
    eplanParts.mockResolvedValue([{ ...PART, device_tag: null }])
    open()
    expect(await screen.findByText(/No row has a device tag/)).toBeTruthy()
    expect(screen.getByText('Parts list (CSV)')).toHaveProperty('disabled', false)
  })
})

describe('pasting an EPLAN export in', () => {
  it('reads it before it writes anything', async () => {
    importEplanMetadata.mockResolvedValue({
      costing_id: 'c', applied: false, lines_read: 2, project: 'NPP-201 TRICLOVER',
      drawings: ['E-201-01'], unmatched: [{ line: 'Revision: 2', why: '"revision" is not a field this reads' }],
      why: 'read 1 project name(s) and 1 drawing number(s)',
    })
    open()
    fireEvent.click(await screen.findByText('Paste an EPLAN project export instead'))
    fireEvent.change(screen.getByLabelText('Pasted EPLAN export'), {
      target: { value: 'Project: NPP-201 TRICLOVER\nRevision: 2' },
    })
    fireEvent.click(screen.getByText('Read it'))
    await waitFor(() => expect(importEplanMetadata).toHaveBeenCalledWith('c', expect.any(String), false))
    expect(await screen.findByText('NPP-201 TRICLOVER')).toBeTruthy()
    expect(screen.getByText(/1 line\(s\) it could not read/)).toBeTruthy()
  })

  it('only saves when asked', async () => {
    importEplanMetadata.mockResolvedValue({
      costing_id: 'c', applied: false, lines_read: 1, project: 'NPP-201',
      drawings: [], unmatched: [], why: 'read 1 project name(s) and 0 drawing number(s)',
    })
    open()
    fireEvent.click(await screen.findByText('Paste an EPLAN project export instead'))
    fireEvent.change(screen.getByLabelText('Pasted EPLAN export'), { target: { value: 'Project: NPP-201' } })
    fireEvent.click(screen.getByText('Read it'))
    await waitFor(() => expect(screen.getByText('Save what it found')).toHaveProperty('disabled', false))
    fireEvent.click(screen.getByText('Save what it found'))
    await waitFor(() =>
      expect(importEplanMetadata).toHaveBeenCalledWith('c', expect.any(String), true))
  })

  it('cannot be saved when it found nothing', async () => {
    importEplanMetadata.mockResolvedValue({
      costing_id: 'c', applied: false, lines_read: 2, project: null, drawings: [],
      unmatched: [{ line: 'Customer: X', why: '"customer" is not a field this reads' }],
      why: 'none of these lines carried a project name or a drawing number',
    })
    open()
    fireEvent.click(await screen.findByText('Paste an EPLAN project export instead'))
    fireEvent.change(screen.getByLabelText('Pasted EPLAN export'), { target: { value: 'Customer: X' } })
    fireEvent.click(screen.getByText('Read it'))
    expect(await screen.findByText(/none of these lines carried/)).toBeTruthy()
    expect(screen.getByText('Save what it found')).toHaveProperty('disabled', true)
  })
})
