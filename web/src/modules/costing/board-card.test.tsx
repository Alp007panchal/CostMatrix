// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { BoardProposal } from '../../lib/database.types'
import { BoardCard } from './BoardCard'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const proposeBoard = vi.fn()
const applyBoard = vi.fn()
vi.mock('./api', () => ({
  proposeBoard: (...a: unknown[]) => proposeBoard(...a),
  applyBoard: (...a: unknown[]) => applyBoard(...a),
}))

const PROPOSAL: BoardProposal = {
  panel_id: 'p1',
  panel: 'MAIN LV BOARD',
  lines: [
    { assembly_id: 'k1', code: 'ACB-1600', name: '1600A ACB KIT', rating: 1600, group_name: 'ACB frame 1',
      role: 'incomer', section: 'Incomer', quantity: 1, why: '1250 A asked for', exact: false,
      note: 'the library has nothing above 1600 A of this kind' },
    { assembly_id: 'k2', code: 'MCCB-100', name: '100A MCCB KIT', rating: 100, group_name: 'MCCB',
      role: 'outgoer', section: 'Outgoers', quantity: 12, why: '12 ways at 100 A', exact: true },
  ],
  missing: [{ what: '400 kVAr of correction', why: 'every breaker step kit is unpriced' }],
  parameters: { incomer_rating_a: 1250, form: '4B' },
}

function show(hasLines = false) {
  render(<BoardCard panelId="p1" hasLines={hasLines} onApplied={() => {}} />)
  fireEvent.click(screen.getByText('Configure this board'))
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('the guided board configurator', () => {
  it('asks nothing until it is opened', () => {
    render(<BoardCard panelId="p1" hasLines={false} onApplied={() => {}} />)
    expect(screen.queryByLabelText('Incomer rating in amps')).toBeNull()
  })

  it('will not work a board out until the incomer is answered', () => {
    show()
    expect(screen.getByText('Work the board out')).toHaveProperty('disabled', true)
    expect(screen.getByText(/rated at, in amps/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Incomer rating in amps'), { target: { value: '1250' } })
    fireEvent.change(screen.getByLabelText('Way 1 rating in amps'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Way 1 how many'), { target: { value: '12' } })
    expect(screen.getByText('Work the board out')).toHaveProperty('disabled', false)
  })

  it('sends the answers as the database wants them', async () => {
    proposeBoard.mockResolvedValue(PROPOSAL)
    show()
    fireEvent.change(screen.getByLabelText('Incomer rating in amps'), { target: { value: '1250' } })
    fireEvent.change(screen.getByLabelText('Way 1 rating in amps'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Way 1 how many'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Form of separation'), { target: { value: '4B' } })
    fireEvent.click(screen.getByText('Work the board out'))

    await waitFor(() => expect(proposeBoard).toHaveBeenCalledWith('p1', expect.objectContaining({
      incomer_rating_a: 1250,
      incomer_type: 'acb',
      feeders: [{ rating_a: 100, quantity: 12, type: 'mccb' }],
      form: '4B',
      changeover: null,
    })))
  })

  async function propose() {
    proposeBoard.mockResolvedValue(PROPOSAL)
    show()
    fireEvent.change(screen.getByLabelText('Incomer rating in amps'), { target: { value: '1250' } })
    fireEvent.change(screen.getByLabelText('Way 1 rating in amps'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Way 1 how many'), { target: { value: '12' } })
    fireEvent.click(screen.getByText('Work the board out'))
    await waitFor(() => expect(screen.getByText('1600A ACB KIT')).toBeTruthy())
  }

  it('shows each kit, why it is there, and what it could not answer', async () => {
    await propose()
    // "Incomer" is also a question label, so the section heading is the row one.
    expect(screen.getAllByText('Incomer').length).toBeGreaterThan(1)
    expect(screen.getByText('Outgoers')).toBeTruthy()
    expect(screen.getByText('12 ways at 100 A')).toBeTruthy()
    expect(screen.getByText(/every breaker step kit is unpriced/)).toBeTruthy()
    expect(screen.getByText(/nothing above 1600 A/)).toBeTruthy()
    expect(screen.getByText(/bigger than what was asked for/)).toBeTruthy()
  })

  it('applies what is on the screen, not what was proposed', async () => {
    applyBoard.mockResolvedValue(undefined)
    await propose()
    fireEvent.change(screen.getByLabelText('How many 100A MCCB KIT'), { target: { value: '14' } })
    fireEvent.change(screen.getByLabelText('How many 1600A ACB KIT'), { target: { value: '0' } })
    expect(screen.getByText('Add 14 kits in 1 section to this panel')).toBeTruthy()

    fireEvent.click(screen.getByText('Add 14 kits in 1 section to this panel'))
    await waitFor(() => expect(applyBoard).toHaveBeenCalledWith(
      'p1',
      [expect.objectContaining({ assembly_id: 'k2', quantity: 14 })],
      { incomer_rating_a: 1250, form: '4B' },
    ))
  })

  it('says plainly that a panel with kits on it is added to', async () => {
    show(true)
    expect(screen.getByText(/already has kits on it/)).toBeTruthy()
  })

  it('shows the reason when the database refuses', async () => {
    proposeBoard.mockRejectedValue(new Error('this library has no kit of that kind'))
    show()
    fireEvent.change(screen.getByLabelText('Incomer rating in amps'), { target: { value: '1250' } })
    fireEvent.change(screen.getByLabelText('Way 1 rating in amps'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Way 1 how many'), { target: { value: '12' } })
    fireEvent.click(screen.getByText('Work the board out'))
    await waitFor(() => expect(screen.getByText(/no kit of that kind/)).toBeTruthy())
  })
})
