// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ImportRow } from '../../lib/database.types'
import { BomImportReview } from './BomImportReview'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const applyBomImport = vi.fn()
vi.mock('./bom-import-api', () => ({
  applyBomImport: (...args: unknown[]) => applyBomImport(...args),
}))
// Applying invalidates the rows query, so the refetch has to answer with
// something; otherwise the card empties and the outcome goes with it.
const listJobRows = vi.fn()
vi.mock('../library/price-list-api', () => ({ listJobRows: (...args: unknown[]) => listJobRows(...args) }))

const row = (over: Partial<ImportRow> & { id: string }): ImportRow => ({
  job_id: 'job1', row_number: 2, raw: {}, matched_entity_id: null, match_method: null,
  status: 'new', message: null, ...over,
})

const ROWS = [
  row({
    id: 'r1', row_number: 2, status: 'new', matched_entity_id: 'c1',
    message: 'this device is the main device of the kit "160A OUTGOER KIT", which is what a costing uses',
    raw: {
      key: '3VJ1216', description: '160A TP MCCB', qty: 3,
      component_id: 'c1', component_code: 'MCCB-160', component_name: '160A TP MCCB',
      kits: [{ kit_id: 'k1', name: '160A OUTGOER KIT' }],
      proposal: { kind: 'kit', ref_id: 'k1' },
    } as ImportRow['raw'],
  }),
  row({
    id: 'r2', row_number: 3, status: 'new', matched_entity_id: 'c2',
    raw: {
      key: 'LOGO', qty: 1, component_id: 'c2', component_code: 'LOGO', component_name: 'ATS controller',
      proposal: { kind: 'component', ref_id: 'c2' },
    } as ImportRow['raw'],
  }),
  row({
    id: 'r3', row_number: 4, status: 'warning',
    message: '"SPECIAL-1" is not in the catalogue — choose a part yourself, or add it as a placeholder for somebody to price',
    raw: { key: 'SPECIAL-1', description: 'Synchro check relay', qty: 2 } as ImportRow['raw'],
  }),
  row({ id: 'r4', row_number: 5, status: 'rejected', raw: { key: 'X' } as ImportRow['raw'],
        message: '"as required" is not a quantity' }),
]

function renderReview(rows: ImportRow[] = ROWS) {
  listJobRows.mockResolvedValue(rows)
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(['import-rows', 'job1'], rows)
  return render(
    <QueryClientProvider client={client}>
      <BomImportReview jobId="job1" costingId="co1" onClose={() => {}} />
    </QueryClientProvider>,
  )
}

afterEach(() => { cleanup(); applyBomImport.mockReset(); listJobRows.mockReset() })

describe('the parts-list review', () => {
  it('defaults a row to the kit whose main device it named, and says why', () => {
    renderReview()
    const line = screen.getByText('3VJ1216').closest('tr')!
    expect(within(line).getByRole('combobox')).toHaveProperty('value', 'kit:k1')
    expect(within(line).getByText(/main device of the kit/)).toBeTruthy()
  })

  it('offers the part on its own, a placeholder and leaving it out', () => {
    renderReview()
    const line = screen.getByText('3VJ1216').closest('tr')!
    const options = within(line).getAllByRole('option').map((o) => o.textContent)
    expect(options[0]).toMatch(/Kit: 160A OUTGOER KIT/)
    expect(options[1]).toMatch(/Part on its own/)
    expect(options[2]).toMatch(/placeholder/)
    expect(options[3]).toMatch(/Leave this row out/)
  })

  it('offers only a placeholder or nothing for a row that matched no part', () => {
    renderReview()
    const line = screen.getByText('SPECIAL-1').closest('tr')!
    const options = within(line).getAllByRole('option').map((o) => o.textContent)
    expect(options).toHaveLength(2)
    expect(within(line).getByRole('combobox')).toHaveProperty('value', 'skip:')
  })

  it('carries the file’s quantity into the box', () => {
    renderReview()
    const line = screen.getByText('3VJ1216').closest('tr')!
    expect(within(line).getByRole('spinbutton')).toHaveProperty('value', '3')
  })

  it('lists the rows it could not read, with the reason', () => {
    renderReview()
    expect(screen.getByRole('heading', { name: /could not be read \(1\)/ })).toBeTruthy()
    expect(screen.getByText(/is not a quantity/)).toBeTruthy()
  })

  it('brings in what is chosen, with the panel name and the quantities', async () => {
    applyBomImport.mockResolvedValue({ costing_id: 'co1', panel_id: 'p1', lines: 2, placeholders: 0, skipped: 1, remaining: 0, status: 'applied' })
    renderReview()
    fireEvent.change(screen.getByLabelText('Name for the new panel'), {
      target: { value: "From the consultant's schedule" },
    })
    fireEvent.change(screen.getByLabelText('Quantity for 3VJ1216'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Bring in 2 lines/ }))

    await waitFor(() => expect(applyBomImport).toHaveBeenCalled())
    const [job, panel, lines] = applyBomImport.mock.calls[0] as [string, string, unknown[]]
    expect(job).toBe('job1')
    expect(panel).toBe("From the consultant's schedule")
    expect(lines).toEqual([
      { row_id: 'r1', kind: 'kit', ref_id: 'k1', qty: 5 },
      // Untouched: no quantity is sent, so the database uses the file's own.
      { row_id: 'r2', kind: 'component', ref_id: 'c2' },
      { row_id: 'r3', kind: 'skip' },
    ])
  })

  it('counts only the rows that will actually come in', () => {
    renderReview()
    // Two matched rows default to something; the unmatched one defaults to skip.
    expect(screen.getByRole('button', { name: /Bring in 2 lines/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('What to do with LOGO'), { target: { value: 'skip:' } })
    expect(screen.getByRole('button', { name: /Bring in 1 line$/ })).toBeTruthy()
  })

  it('says what happened, including parts that only reached the library', async () => {
    applyBomImport.mockResolvedValue({ costing_id: 'co1', panel_id: null, lines: 0, placeholders: 1, skipped: 0, remaining: 2, status: 'preview' })
    renderReview()
    fireEvent.change(screen.getByLabelText('What to do with SPECIAL-1'), { target: { value: 'placeholder:' } })
    fireEvent.click(screen.getByRole('button', { name: /Bring in 3 lines/ }))
    expect(await screen.findByText(/1 part added to the library as placeholders/)).toBeTruthy()
    expect(screen.getByText(/2 rows still waiting/)).toBeTruthy()
  })

  it('reports a refusal from the database in its own words', async () => {
    applyBomImport.mockRejectedValue(new Error("adding a new part to the library is a company administrator's job"))
    renderReview()
    fireEvent.click(screen.getByRole('button', { name: /Bring in 2 lines/ }))
    expect(await screen.findByText(/company administrator's job/)).toBeTruthy()
  })

  it('shows what was already decided once rows have been brought in', () => {
    renderReview([
      row({ id: 'r1', status: 'accepted', raw: { key: '3VJ1216' } as ImportRow['raw'], message: 'brought in as a kit, quantity 3' }),
      row({ id: 'r2', status: 'skipped', raw: { key: 'LOGO' } as ImportRow['raw'], message: 'left out by the person importing' }),
    ])
    expect(screen.getByRole('heading', { name: /Already decided \(2\)/ })).toBeTruthy()
    expect(screen.getByText(/brought in as a kit, quantity 3/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Bring in/ })).toBeNull()
  })
})
