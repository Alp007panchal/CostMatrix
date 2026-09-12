// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CostingPanel, LabourActual, PanelLabourVariance, ProcessType } from '../../lib/database.types'
import { ActualHoursCard } from './ActualHoursCard'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const recordActualHours = vi.fn()
const removeActualHours = vi.fn()
const listLabourVariance = vi.fn()
const listActualEntries = vi.fn()
vi.mock('./labour-actuals-api', () => ({
  recordActualHours: (...a: unknown[]) => recordActualHours(...a),
  removeActualHours: (...a: unknown[]) => removeActualHours(...a),
  listLabourVariance: (...a: unknown[]) => listLabourVariance(...a),
  listActualEntries: (...a: unknown[]) => listActualEntries(...a),
}))

const PANELS = [
  { id: 'p1', costing_id: 'c', company_id: 'co', name: 'MAIN LV BOARD', tag: null, option_label: null,
    uom: 'PC', quantity: 2, is_option: false, technical_description: null, enclosure_dimensions: null, sort_order: 0 },
] satisfies CostingPanel[]

const PROCESSES = [
  { code: 'assembly', name: 'Panel assembly', sort_order: 1 },
  { code: 'wiring', name: 'Wiring', sort_order: 2 },
] as unknown as ProcessType[]

const VARIANCE: PanelLabourVariance[] = [
  { costing_id: 'c', panel_id: 'p1', panel_name: 'MAIN LV BOARD', panel_quantity: 2,
    process_type: 'assembly', process_name: 'Panel assembly', sort_order: 1,
    estimated_hours: 26, actual_hours: 30, has_actuals: true, entries: 2,
    last_recorded_at: '2026-09-01T00:00:00Z', difference_hours: 4, variance_pct: 15.4,
    hourly_rate: 500, difference_cost: 2000 },
  { costing_id: 'c', panel_id: 'p1', panel_name: 'MAIN LV BOARD', panel_quantity: 2,
    process_type: 'wiring', process_name: 'Wiring', sort_order: 2,
    estimated_hours: 12, actual_hours: 0, has_actuals: false, entries: 0,
    last_recorded_at: null, difference_hours: -12, variance_pct: null,
    hourly_rate: 500, difference_cost: -6000 },
]

const ENTRIES: LabourActual[] = [
  { id: 'e1', costing_id: 'c', panel_id: 'p1', process_type: 'assembly', hours: 18,
    source: 'manual', note: 'week 32', recorded_at: '2026-09-01T00:00:00Z' },
]

function show(canRecord = true) {
  listLabourVariance.mockResolvedValue(VARIANCE)
  listActualEntries.mockResolvedValue(ENTRIES)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ActualHoursCard
        costingId="c"
        panels={PANELS}
        processTypes={PROCESSES}
        currencyLabel="KSH"
        canRecord={canRecord}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('hours actually worked', () => {
  it('says it changes no price, and asks nothing of the database until opened', () => {
    show()
    expect(screen.getByText(/changes no price and no total/)).toBeTruthy()
    expect(listLabourVariance).not.toHaveBeenCalled()
  })

  it('shows the estimate, the actual and the difference at the frozen rate', async () => {
    show()
    fireEvent.click(screen.getByText('Show'))
    await waitFor(() => expect(screen.getByText('26.00 h')).toBeTruthy())
    expect(screen.getByText('30.00 h')).toBeTruthy()
    expect(screen.getByText('+4.00 h')).toBeTruthy()
    expect(screen.getByText('+15.4 %')).toBeTruthy()
    // Wiring has nothing recorded yet and says so rather than reading as zero hours.
    expect(screen.getByText('not yet')).toBeTruthy()
  })

  it('records hours against a panel and a process', async () => {
    recordActualHours.mockResolvedValue(undefined)
    show()
    fireEvent.click(screen.getByText('Show'))
    await waitFor(() => expect(screen.getByText('Record these hours')).toBeTruthy())
    const button = screen.getByText('Record these hours')
    expect(button).toHaveProperty('disabled', true)

    fireEvent.change(screen.getByLabelText('Panel'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByLabelText('Process'), { target: { value: 'wiring' } })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '7.5' } })
    fireEvent.click(button)

    await waitFor(() => expect(recordActualHours).toHaveBeenCalledWith({
      panelId: 'p1', processType: 'wiring', hours: 7.5, note: null,
    }))
  })

  it('lists the entries and lets a wrong one be removed', async () => {
    removeActualHours.mockResolvedValue(undefined)
    show()
    fireEvent.click(screen.getByText('Show'))
    await waitFor(() => expect(screen.getByText('week 32')).toBeTruthy())
    fireEvent.click(screen.getByText('Remove'))
    await waitFor(() => expect(removeActualHours).toHaveBeenCalledWith('e1'))
  })

  it('shows somebody who may not build costings the figures but no controls', async () => {
    show(false)
    fireEvent.click(screen.getByText('Show'))
    await waitFor(() => expect(screen.getByText('26.00 h')).toBeTruthy())
    expect(screen.queryByText('Record these hours')).toBeNull()
    expect(screen.queryByText('Remove')).toBeNull()
  })
})
