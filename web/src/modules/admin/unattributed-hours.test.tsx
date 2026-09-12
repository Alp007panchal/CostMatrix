// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { KitGroupLabourVariance, UnattributedLabourHours } from '../../lib/database.types'
import { LabourVariancePage } from './LabourVariancePage'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const listKitGroupVariance = vi.fn()
const listUnattributedHours = vi.fn()
const applyLabourSuggestion = vi.fn()
vi.mock('./labour-variance-api', () => ({
  listKitGroupVariance: (...a: unknown[]) => listKitGroupVariance(...a),
  listUnattributedHours: (...a: unknown[]) => listUnattributedHours(...a),
  applyLabourSuggestion: (...a: unknown[]) => applyLabourSuggestion(...a),
}))

const GROUPS: KitGroupLabourVariance[] = [
  { company_id: 'co', kit_group_id: 'g1', kit_group_name: 'ACB frame 1', process_type: 'wiring',
    process_name: 'Wiring', sort_order: 2, jobs: 4, panels: 6, kit_units: 6,
    estimated_hours: 24, actual_hours: 30, estimated_hours_per_kit: 4, actual_hours_per_kit: 5,
    variance_pct: 25, suggested_hours: 5, standard_hours: 4 },
]

const STRAY: UnattributedLabourHours[] = [
  { company_id: 'co', costing_id: 'c1', panel_id: 'p9', panel_name: 'LOOSE PARTS BOARD',
    process_type: 'wiring', process_name: 'Wiring', process_sort: 2, hours: 6 },
  { company_id: 'co', costing_id: 'c1', panel_id: 'p8', panel_name: 'KITTED BOARD',
    process_type: 'busbar', process_name: 'Busbar', process_sort: 3, hours: 2.5 },
]

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LabourVariancePage />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('hours no kit group can be blamed for', () => {
  it('names them, with the total and the board they were worked on', async () => {
    listKitGroupVariance.mockResolvedValue(GROUPS)
    listUnattributedHours.mockResolvedValue(STRAY)
    draw()

    await waitFor(() => expect(screen.getByText(/Hours no kit group can be blamed for/)).toBeTruthy())
    // 6 + 2.5, in none of the figures above.
    expect(screen.getByText(/8\.50 hours were recorded against boards costed at none of that work/)).toBeTruthy()
    expect(screen.getByText('LOOSE PARTS BOARD')).toBeTruthy()
    expect(screen.getByText('6.00 h')).toBeTruthy()
    expect(screen.getByText('2.50 h')).toBeTruthy()
  })

  it('says nothing at all when every hour found a kit group', async () => {
    listKitGroupVariance.mockResolvedValue(GROUPS)
    listUnattributedHours.mockResolvedValue([])
    draw()

    await waitFor(() => expect(screen.getByText('ACB frame 1')).toBeTruthy())
    expect(screen.queryByText(/Hours no kit group can be blamed for/)).toBeNull()
  })
})
