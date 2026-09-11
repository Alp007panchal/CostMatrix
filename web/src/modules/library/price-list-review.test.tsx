// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ImportRow } from '../../lib/database.types'
import { PriceListReview } from './PriceListReview'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const acceptPriceRows = vi.fn()
const discardImportJob = vi.fn()
vi.mock('./price-list-api', () => ({
  listJobRows: vi.fn(),
  acceptPriceRows: (...args: unknown[]) => acceptPriceRows(...args),
  discardImportJob: (...args: unknown[]) => discardImportJob(...args),
}))

const row = (over: Partial<ImportRow> & { id: string }): ImportRow => ({
  job_id: 'job1', row_number: 2, raw: {}, matched_entity_id: null, match_method: null,
  status: 'changed', message: null, ...over,
})

const ROWS: ImportRow[] = [
  row({
    id: 'r1', row_number: 2, status: 'changed', match_method: 'code', matched_entity_id: 'c1',
    raw: {
      key: '3WJ1116', component_code: '3WJ1116', component_name: '1600A 4P ACB',
      old_price: 400000, old_currency: 'KES', new_price: 412000, new_currency: 'KES', change_pct: 3,
    },
  }),
  row({
    id: 'r2', row_number: 3, status: 'changed', match_method: 'part_number_loose', matched_entity_id: 'c2',
    raw: {
      key: 'SYNCHRO1', component_code: 'SYNCHRO1', component_name: 'Synchro check relay',
      new_price: 35000, new_currency: 'KES', is_placeholder: true,
    },
  }),
  row({ id: 'r3', row_number: 4, status: 'new', raw: { key: 'NOT-HERE', description: 'Mystery part' },
        message: '"NOT-HERE" is not in this library yet; add the part first, then re-upload' }),
  row({ id: 'r4', row_number: 5, status: 'warning', raw: { key: 'BB-30X10' },
        message: 'this part is priced by weight (busbar); change the copper rate instead of its price' }),
  row({ id: 'r5', row_number: 6, status: 'unchanged', raw: { key: 'LOGO' }, message: 'same price as now' }),
]

function renderReview(rows: ImportRow[] = ROWS) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(['import-rows', 'job1'], rows)
  return render(
    <QueryClientProvider client={client}>
      <PriceListReview jobId="job1" onClose={() => {}} />
    </QueryClientProvider>,
  )
}

afterEach(() => { cleanup(); acceptPriceRows.mockReset(); discardImportJob.mockReset() })

describe('the price-list review', () => {
  it('shows each change with the price now, the price asked and the percentage', () => {
    renderReview()
    const changes = screen.getByRole('heading', { name: /Price changes \(2\)/ })
    expect(changes).toBeTruthy()
    const line = screen.getByText('1600A 4P ACB').closest('tr')!
    expect(within(line).getByText('KES 400,000.00')).toBeTruthy()
    expect(within(line).getByText('KES 412,000.00')).toBeTruthy()
    expect(within(line).getByText('+3 %')).toBeTruthy()
    expect(within(line).getByText('our code')).toBeTruthy()
  })

  it('marks a part that had no price at all', () => {
    renderReview()
    const line = screen.getByText(/Synchro check relay/).closest('tr')!
    expect(within(line).getByText('was unpriced')).toBeTruthy()
    // Nothing to compare with, so both the "now" and the "change" cells are blank.
    expect(within(line).getAllByText('—')).toHaveLength(2)
  })

  it('lists the rows a person must settle, with the reason in words', () => {
    renderReview()
    expect(screen.getByRole('heading', { name: /Needs a person \(2\)/ })).toBeTruthy()
    expect(screen.getByText(/is not in this library yet/)).toBeTruthy()
    expect(screen.getByText(/change the copper rate instead/)).toBeTruthy()
  })

  it('says how many rows already match, without listing them', () => {
    renderReview()
    expect(screen.getByText(/1 row already at the price the list quotes/)).toBeTruthy()
    expect(screen.queryByText('LOGO')).toBeNull()
  })

  it('accepts only the ticked rows', async () => {
    acceptPriceRows.mockResolvedValue({ applied: 1, skipped: 0, remaining: 1, status: 'preview' })
    renderReview()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Accept 3WJ1116' }))
    fireEvent.click(screen.getByRole('button', { name: 'Accept 1 ticked' }))
    await waitFor(() => expect(acceptPriceRows).toHaveBeenCalledWith('job1', ['r1']))
    expect(await screen.findByText(/1 price updated/)).toBeTruthy()
    expect(screen.getByText(/1 change\(s\) still waiting/)).toBeTruthy()
  })

  it('cannot accept anything until something is ticked', () => {
    renderReview()
    expect(screen.getByRole('button', { name: 'Accept 0 ticked' }).hasAttribute('disabled')).toBe(true)
  })

  it('accepts every change with one button, passing no list', async () => {
    acceptPriceRows.mockResolvedValue({ applied: 2, skipped: 0, remaining: 0, status: 'applied' })
    renderReview()
    fireEvent.click(screen.getByRole('button', { name: 'Accept all 2' }))
    await waitFor(() => expect(acceptPriceRows).toHaveBeenCalledWith('job1', null))
    expect(await screen.findByText(/Nothing left to accept/)).toBeTruthy()
  })

  it('shows what was applied and offers nothing more once it is', () => {
    renderReview([
      row({ id: 'r1', status: 'accepted', raw: { component_code: '3WJ1116' }, message: '400000 → 412000 KES' }),
    ])
    expect(screen.getByRole('heading', { name: /Applied \(1\)/ })).toBeTruthy()
    expect(screen.getByText(/3WJ1116: 400000 → 412000 KES/)).toBeTruthy()
    expect(screen.getByText(/Every price change on this list has been applied/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Accept all/ })).toBeNull()
  })

  it('reports a refusal from the database rather than swallowing it', async () => {
    acceptPriceRows.mockRejectedValue(new Error('only the master admin may import into the master library'))
    renderReview()
    fireEvent.click(screen.getByRole('button', { name: 'Accept all 2' }))
    expect(await screen.findByText(/only the master admin/)).toBeTruthy()
  })

  it('discards the upload when asked', async () => {
    discardImportJob.mockResolvedValue(undefined)
    renderReview()
    fireEvent.click(screen.getByRole('button', { name: 'Discard this upload' }))
    await waitFor(() => expect(discardImportJob).toHaveBeenCalledWith('job1', 'not wanted'))
  })
})
