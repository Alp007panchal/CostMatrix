// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { LayoutFit, LayoutKit, LayoutPlan } from '../../lib/database.types'
import { LayoutDialog } from './LayoutDialog'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const layoutKits = vi.fn()
const arrangePanel = vi.fn()
const layoutFit = vi.fn()
const saveLayout = vi.fn()
const savedLayout = vi.fn()
const applyLayoutEnclosure = vi.fn()
const constructions = vi.fn()
vi.mock('./layout-api', () => ({
  layoutKits: (...a: unknown[]) => layoutKits(...a),
  arrangePanel: (...a: unknown[]) => arrangePanel(...a),
  layoutFit: (...a: unknown[]) => layoutFit(...a),
  saveLayout: (...a: unknown[]) => saveLayout(...a),
  savedLayout: (...a: unknown[]) => savedLayout(...a),
  applyLayoutEnclosure: (...a: unknown[]) => applyLayoutEnclosure(...a),
  constructions: (...a: unknown[]) => constructions(...a),
}))

const KITS: LayoutKit[] = [
  { costing_assembly_id: 'ca1', panel_id: 'p1', name: '1600 A ACB', quantity: 1, assembly_id: 'a1',
    mounting_design: 'busbar_fed', module_height_mm: 1200, positions_per_plate: null,
    footprint_w_mm: 700, rating: 1600, rating_unit: 'A', is_sized: true },
  { costing_assembly_id: 'ca2', panel_id: 'p1', name: 'UNDESCRIBED KIT', quantity: 2, assembly_id: 'a2',
    mounting_design: null, module_height_mm: null, positions_per_plate: null,
    footprint_w_mm: null, rating: null, rating_unit: null, is_sized: false },
]

const PLAN: LayoutPlan = {
  panel_id: 'p1',
  panel: 'MAIN LV BOARD',
  construction: 'S4',
  sections: [
    { name: 'S1', width_mm: 800, busbar_compartment_mm: 0, access: 'single_front', design: 'busbar_fed',
      faces: [{ side: 'front', connection: 'front', design: 'busbar_fed', placements: [
        { costing_assembly_id: 'ca1', face: 'front', name: '1600 A ACB', slot: 0, height_mm: 1200, unsized: false },
      ] }] },
    { name: 'S2', width_mm: 800, busbar_compartment_mm: 200, access: 'single_front', design: 'mccb_plates',
      faces: [{ side: 'front', connection: 'front', design: 'mccb_plates', placements: [] }] },
  ],
  explain: [{ section: 'S1', why: 'a busbar-fed device is connected straight to the horizontal busbar' }],
  unsized: [{ name: 'UNDESCRIBED KIT', why: 'no mounting design on the kit' }],
  kvar: { used: 0, limit_per_section: null },
  assumed: { device_compartment_mm: 1500, note: 'the usable height of a device compartment is assumed until the S4 dimension drawings are read' },
}

const FIT: LayoutFit = {
  verdict: 'tight',
  sections: [
    { name: 'S1', design: 'busbar_fed', width_mm: 800, used: 1200, capacity: 1500, unit: 'mm of height', unsized: 0, verdict: 'tight', why: 'a busbar-fed section is 1500 mm of compartment height' },
    { name: 'S2', design: 'mccb_plates', width_mm: 800, used: 0, capacity: 1500, unit: 'mm of height', unsized: 0, verdict: 'empty', why: 'covers stack down 1500 mm' },
  ],
  section_count: 2,
  total_width_mm: 1600,
}

beforeEach(() => {
  layoutKits.mockResolvedValue(KITS)
  constructions.mockResolvedValue([{ code: 'S4', name: 'Siemens SIVACON S4', height_mm: 2000 }])
  savedLayout.mockResolvedValue(null)
  arrangePanel.mockResolvedValue(PLAN)
  layoutFit.mockResolvedValue(FIT)
  saveLayout.mockResolvedValue({ version: 1, fit: FIT })
  applyLayoutEnclosure.mockResolvedValue({ panel_id: 'p1', section: 'Enclosure', kinds: 1, replaced: 0, missing: [], wanted: { '800': 2 } })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

function open(editable = true) {
  render(<LayoutDialog panelId="p1" panelName="MAIN LV BOARD" editable={editable} onClose={() => {}} onApplied={() => {}} />)
}

describe('the panel layout pop-up', () => {
  it('lists the kits on the panel, grouped by how they are built in', async () => {
    open()
    expect(await screen.findByText('1600 A ACB')).toBeTruthy()
    expect(screen.getByText('busbar-fed')).toBeTruthy()
    expect(screen.getByText('Not described yet')).toBeTruthy()
  })

  it('says out loud what it assumed about the compartment height', async () => {
    open()
    expect(await screen.findByText(/usable height of a device compartment is assumed/)).toBeTruthy()
  })

  it('draws nothing until the board is worked out, and says why', async () => {
    open()
    expect(await screen.findByText(/No sections yet/)).toBeTruthy()
  })

  it('arranges the board and shows the verdict per section', async () => {
    open()
    fireEvent.click(await screen.findByText('Work the board out'))
    await waitFor(() => expect(arrangePanel).toHaveBeenCalledWith('p1', 'S4'))
    expect(await screen.findByText(/2 sections, arranged by the rules/)).toBeTruthy()
    // The headline verdict and the row for S1 both read it, which is the point.
    await waitFor(() => expect(screen.getAllByText('Fits, tight').length).toBeGreaterThan(1))
    // Once under the drawing and once in the verdict column.
    expect(screen.getAllByText(/1600 mm overall/).length).toBeGreaterThan(0)
  })

  it('shows which rule made each section', async () => {
    open()
    fireEvent.click(await screen.findByText('Work the board out'))
    expect(await screen.findByText(/busbar-fed device is connected straight/)).toBeTruthy()
  })

  it('names the kits it cannot place rather than dropping them', async () => {
    open()
    fireEvent.click(await screen.findByText('Work the board out'))
    expect(await screen.findByText(/UNDESCRIBED KIT — no mounting design on the kit/)).toBeTruthy()
  })

  it('saves the drawing and says that no price moved', async () => {
    open()
    fireEvent.click(await screen.findByText('Work the board out'))
    await waitFor(() => expect(screen.getByText('Save layout')).toHaveProperty('disabled', false))
    fireEvent.click(screen.getByText('Save layout'))
    await waitFor(() => expect(saveLayout).toHaveBeenCalled())
    expect(await screen.findByText(/No price moved: a layout is a drawing/)).toBeTruthy()
  })

  it('puts the cubicles on the costing only when asked', async () => {
    open()
    fireEvent.click(await screen.findByText('Work the board out'))
    await waitFor(() => expect(screen.getByText('Put these cubicles on the costing')).toHaveProperty('disabled', false))
    expect(applyLayoutEnclosure).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Put these cubicles on the costing'))
    await waitFor(() => expect(applyLayoutEnclosure).toHaveBeenCalledWith('p1', false))
    expect(await screen.findByText(/Enclosure section/)).toBeTruthy()
  })

  it('refuses a drop onto a section of another design, in words', async () => {
    open()
    fireEvent.click(await screen.findByText('Work the board out'))
    await waitFor(() => expect(screen.getByLabelText(/Front view/)).toBeTruthy())
    // Drag the busbar-fed ACB onto the section of MCCB covers.
    // The first is the card in the kit list; the second is its label on the drawing.
    fireEvent.dragStart(screen.getAllByText('1600 A ACB')[0] as Element)
    fireEvent.drop(screen.getByLabelText('Section S2'))
    expect(await screen.findByText(/S2 is a MCCB cover section; 1600 A ACB is busbar-fed./)).toBeTruthy()
  })

  it('picks up the layout already saved against the panel', async () => {
    savedLayout.mockResolvedValue({ sections: PLAN.sections, construction_code: 'S4', version: 3 })
    open()
    expect(await screen.findByText(/Version 3, as you left it/)).toBeTruthy()
  })

  it('will not let an approved costing be redrawn', async () => {
    open(false)
    expect(await screen.findByText('Work the board out')).toHaveProperty('disabled', true)
  })

  it('shows the later views as coming rather than hiding them', async () => {
    open()
    expect(await screen.findByText('Rear — later')).toBeTruthy()
    expect(screen.getByText('3D — later')).toBeTruthy()
  })
})
