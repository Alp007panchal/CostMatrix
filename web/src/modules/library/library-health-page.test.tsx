// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { LibraryHealthRow, LibraryIssue } from '../../lib/database.types'
import { LibraryHealthPage } from './LibraryHealthPage'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const listLibraryIssues = vi.fn()
vi.mock('./library-health-api', () => ({
  listLibraryHealth: vi.fn(),
  listLibraryIssues: (...args: unknown[]) => listLibraryIssues(...args),
}))

const HEALTH: LibraryHealthRow[] = [
  {
    library: 'master', kind: 'part_placeholder', severity: 'refuses', sort_order: 20,
    fix_on: 'Library → Components', items: 8, used_by_kits: 15,
    examples: ['LA9D50978X', '5SL6263-7RC'],
  },
  {
    library: 'master', kind: 'kit_no_hours', severity: 'silent', sort_order: 80,
    fix_on: 'Library → Kit groups', items: 240, used_by_kits: 0,
    examples: ['1000A-3P-FIXED-MANUAL-ACB-KIT', '1000A-3P-WITHDRAWABLE-MANUAL-ACB-KIT'],
  },
  {
    library: 'private', kind: 'kit_only_main_device', severity: 'check', sort_order: 90,
    fix_on: 'Library → Kits', items: 1, used_by_kits: 0,
    examples: ['400A-TP-MCCB-KIT'],
  },
]

const ISSUES: LibraryIssue[] = [
  {
    company_id: null, library: 'master', entity: 'part', entity_id: 'p1', code: 'LA9D50978X',
    name: 'CONTACTOR INTERLOCK', used_by_kits: 4, kind: 'part_placeholder', severity: 'refuses',
    sort_order: 20, detail: 'The importer added it because a kit named a part number the catalogue did not have.',
    fix_on: 'Library → Components',
  },
]

function renderPage(rows: LibraryHealthRow[] = HEALTH) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(['library-health'], rows)
  return render(
    <QueryClientProvider client={client}>
      <LibraryHealthPage />
    </QueryClientProvider>,
  )
}

afterEach(() => { cleanup(); listLibraryIssues.mockReset() })

describe('the library health screen', () => {
  it('opens on what would stop a costing, and what would quietly not', () => {
    renderPage()
    expect(screen.getByText(/8 things that would stop a costing/)).toBeTruthy()
    expect(screen.getByText(/240 things that would cost and leave something out/)).toBeTruthy()
  })

  it('groups the faults by what they do, worst first', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Stops a costing', 'Costs, and leaves something out', 'Worth a look'])
  })

  it('names each fault, its count, and the screen that fixes it', () => {
    renderPage()
    expect(screen.getByText('Parts waiting for a price')).toBeTruthy()
    expect(screen.getByText('240')).toBeTruthy()
    expect(screen.getByText('Library → Kit groups')).toBeTruthy()
  })

  it('says how many more there are than the examples shown', () => {
    renderPage()
    expect(screen.getByText(/and 238 more/)).toBeTruthy()
  })

  it('tells the shared catalogue from a company’s own library', () => {
    renderPage()
    expect(screen.getAllByText('the shared catalogue').length).toBe(2)
    expect(screen.getByText('your own library')).toBeTruthy()
  })

  it('asks for the rows behind a heading only when somebody opens it', async () => {
    listLibraryIssues.mockResolvedValue(ISSUES)
    renderPage()
    expect(listLibraryIssues).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'List them' })[0]!)
    await waitFor(() => expect(listLibraryIssues).toHaveBeenCalledWith('part_placeholder'))
    await screen.findByText('CONTACTOR INTERLOCK')
    expect(screen.getByText('4 kit(s)')).toBeTruthy()
  })

  it('closes a list that is already open rather than opening a second one', async () => {
    listLibraryIssues.mockResolvedValue(ISSUES)
    renderPage()
    const open = () => screen.getAllByRole('button', { name: /List them|Hide/ })[0]!
    fireEvent.click(open())
    await screen.findByText('CONTACTOR INTERLOCK')
    fireEvent.click(open())
    await waitFor(() => expect(screen.queryByText('CONTACTOR INTERLOCK')).toBeNull())
  })

  it('says so plainly when there is nothing to fix', () => {
    renderPage([])
    expect(screen.getByText(/every part can be priced and every kit is ready to cost/)).toBeTruthy()
  })
})
