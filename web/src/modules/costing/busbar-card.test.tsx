// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BusbarBar, BusbarStart } from '../../lib/database.types'
import { BusbarCard } from './BusbarCard'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const busbarBars = vi.fn()
const panelBusbarRuns = vi.fn()
const panelBusbarCheck = vi.fn()
const startingBusbarRuns = vi.fn()
const saveBusbarRuns = vi.fn()
const applyBusbarRuns = vi.fn()
vi.mock('./busbar-api', () => ({
  busbarBars: (...a: unknown[]) => busbarBars(...a),
  panelBusbarRuns: (...a: unknown[]) => panelBusbarRuns(...a),
  panelBusbarCheck: (...a: unknown[]) => panelBusbarCheck(...a),
  startingBusbarRuns: (...a: unknown[]) => startingBusbarRuns(...a),
  saveBusbarRuns: (...a: unknown[]) => saveBusbarRuns(...a),
  applyBusbarRuns: (...a: unknown[]) => applyBusbarRuns(...a),
}))

const BARS: BusbarBar[] = [
  { id: '1', code: '50X10MM', width_mm: 50, thickness_mm: 10, area_mm2: 500, kg_per_metre: 4.6, price_per_metre: 13800, is_priced: true },
  { id: '2', code: '20X10MM', width_mm: 20, thickness_mm: 10, area_mm2: 200, kg_per_metre: 1.8, price_per_metre: 5400, is_priced: true },
]

const START: BusbarStart = {
  panel_id: 'p1',
  panel: 'MAIN LV BOARD',
  runs: [
    { label: 'Incoming tails — 1600 A', bar_code: '50X10MM', phases: 4, runs_per_phase: 2, length_m: 1.6, sets: 1 },
    { label: 'Horizontal busbar — 1600 A', bar_code: '20X10MM', phases: 4, runs_per_phase: 4, length_m: 1.2, sets: 1 },
  ],
  totals: { runs: [], bars: [], total_metres: 32, total_kg: 0, total_value: 0, unpriced_bars: null },
  note: 'the rows and bar sizes come from this board and your library; the lengths are your company’s usual figures — correct them against the drawing',
}

beforeEach(() => {
  busbarBars.mockResolvedValue(BARS)
  panelBusbarRuns.mockResolvedValue([])
  panelBusbarCheck.mockResolvedValue([])
  startingBusbarRuns.mockResolvedValue(START)
  saveBusbarRuns.mockResolvedValue({ runs: START.runs, bars: [], total_metres: 32, total_kg: 0, total_value: 0, unpriced_bars: null })
  applyBusbarRuns.mockResolvedValue({ panel_id: 'p1', section: 'Busbar', sizes: 2, metres: 32, replaced: 0 })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

async function open() {
  render(<BusbarCard panelId="p1" onApplied={() => {}} />)
  fireEvent.click(screen.getByText('Work out the busbar runs'))
  await waitFor(() => expect(busbarBars).toHaveBeenCalled())
}

describe('the busbar run calculator', () => {
  it('reads nothing until it is opened', () => {
    render(<BusbarCard panelId="p1" onApplied={() => {}} />)
    expect(busbarBars).not.toHaveBeenCalled()
  })

  it('picks up the schedule the panel already has', async () => {
    panelBusbarRuns.mockResolvedValue(START.runs)
    await open()
    await waitFor(() => expect(screen.getByDisplayValue('Incoming tails — 1600 A')).toBeTruthy())
  })

  it('offers the runs a board like this one needs, and says they are not a measurement', async () => {
    await open()
    fireEvent.click(screen.getByText('Start from this board'))
    await waitFor(() => expect(screen.getByDisplayValue('Horizontal busbar — 1600 A')).toBeTruthy())
    expect(screen.getByText(/correct them against the drawing/)).toBeTruthy()
  })

  it('works the metres out as the figures are typed, before anything is saved', async () => {
    await open()
    fireEvent.click(screen.getByText('Start from this board'))
    await waitFor(() => expect(screen.getByLabelText('Run 1 length')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Run 1 length'), { target: { value: '2' } })
    // 4 × 2 × 2 × 1 = 16 m of 50×10, and the totals table says so.
    await waitFor(() => expect(screen.getAllByText('16').length).toBeGreaterThan(0))
    expect(saveBusbarRuns).not.toHaveBeenCalled()
  })

  it('will not save a run with nothing in its name', async () => {
    await open()
    fireEvent.click(screen.getByText('Add a run'))
    await waitFor(() => expect(screen.getByText(/Run 1 needs a name/)).toBeTruthy())
    expect(screen.getByText('Save the schedule')).toHaveProperty('disabled', true)
  })

  it('saves the schedule without touching a price', async () => {
    await open()
    fireEvent.click(screen.getByText('Start from this board'))
    await waitFor(() => expect(screen.getByText('Save the schedule')).toHaveProperty('disabled', false))
    fireEvent.click(screen.getByText('Save the schedule'))
    await waitFor(() => expect(saveBusbarRuns).toHaveBeenCalledWith('p1', START.runs))
    expect(applyBusbarRuns).not.toHaveBeenCalled()
    expect(await screen.findByText(/Schedule saved/)).toBeTruthy()
  })

  it('adds the lines through the ordinary function when told to, and says what it did', async () => {
    await open()
    fireEvent.click(screen.getByText('Start from this board'))
    await waitFor(() => expect(screen.getByText('Add these as busbar lines')).toHaveProperty('disabled', false))
    fireEvent.click(screen.getByText('Add these as busbar lines'))
    await waitFor(() => expect(applyBusbarRuns).toHaveBeenCalledWith('p1', false))
    expect(await screen.findByText(/32 m of busbar in 2 sizes added to the Busbar section/)).toBeTruthy()
  })

  it('offers to replace only when the panel already carries busbar lines', async () => {
    await open()
    expect(screen.queryByText('Replace the busbar lines already there')).toBeNull()
    cleanup()
    panelBusbarCheck.mockResolvedValue([
      { panel_id: 'p1', bar_code: '50X10MM', scheduled_m: 12.8, costed_m: 30, difference_m: 17.2, kg_per_metre: 4.6, scheduled_kg: 58.88 },
    ])
    await open()
    expect(await screen.findByText('Replace the busbar lines already there')).toBeTruthy()
  })

  it('names the gap between the schedule and what the panel is costed at', async () => {
    panelBusbarCheck.mockResolvedValue([
      { panel_id: 'p1', bar_code: '50X10MM', scheduled_m: 70.4, costed_m: 30, difference_m: -40.4, kg_per_metre: 4.6, scheduled_kg: 323.84 },
    ])
    await open()
    expect(await screen.findByText(/40.4 m less than the runs ask for/)).toBeTruthy()
  })

  it('says what went wrong rather than failing quietly', async () => {
    applyBusbarRuns.mockRejectedValue(new Error('20X5MM has no price yet'))
    await open()
    fireEvent.click(screen.getByText('Start from this board'))
    await waitFor(() => expect(screen.getByText('Add these as busbar lines')).toHaveProperty('disabled', false))
    fireEvent.click(screen.getByText('Add these as busbar lines'))
    expect(await screen.findByText(/20X5MM has no price yet/)).toBeTruthy()
  })
})
