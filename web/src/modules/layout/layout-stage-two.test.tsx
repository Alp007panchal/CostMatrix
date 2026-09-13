// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { LayoutDoorDevice, LayoutFit, LayoutKit, LayoutPlan } from '../../lib/database.types'
import { LayoutDialog } from './LayoutDialog'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const layoutKits = vi.fn()
const arrangePanel = vi.fn()
const layoutFit = vi.fn()
const saveLayout = vi.fn()
const savedLayout = vi.fn()
const applyLayoutEnclosure = vi.fn()
const constructions = vi.fn()
const doorDevices = vi.fn()
const panelWeight = vi.fn()
vi.mock('./layout-api', () => ({
  layoutKits: (...a: unknown[]) => layoutKits(...a),
  arrangePanel: (...a: unknown[]) => arrangePanel(...a),
  layoutFit: (...a: unknown[]) => layoutFit(...a),
  saveLayout: (...a: unknown[]) => saveLayout(...a),
  savedLayout: (...a: unknown[]) => savedLayout(...a),
  applyLayoutEnclosure: (...a: unknown[]) => applyLayoutEnclosure(...a),
  constructions: (...a: unknown[]) => constructions(...a),
  doorDevices: (...a: unknown[]) => doorDevices(...a),
  panelWeight: (...a: unknown[]) => panelWeight(...a),
}))

const KITS: LayoutKit[] = [
  { costing_assembly_id: 'ca1', panel_id: 'p1', name: '400 A MCCB', quantity: 1, assembly_id: 'a1',
    mounting_design: 'mccb_plates', module_height_mm: 250, positions_per_plate: null,
    footprint_w_mm: null, rating: 400, rating_unit: 'A', is_sized: true },
]

const FRONT_FACE = {
  side: 'front' as const, connection: 'front' as const, design: 'mccb_plates',
  placements: [{ costing_assembly_id: 'ca1', face: 'front' as const, name: '400 A MCCB', slot: 0, height_mm: 250, unsized: false }],
}

const PLAN: LayoutPlan = {
  panel_id: 'p1',
  panel: 'MAIN LV BOARD',
  construction: 'S4',
  access: 'single_front',
  cable_alley: 'beside',
  depth_mm: 800,
  height_mm: 2000,
  base_mm: 100,
  sections: [
    { name: 'S1', width_mm: 800, depth_mm: 800, busbar_compartment_mm: 200, access: 'single_front',
      cable_alley: 'beside', busbar_side: 'left', form: '2b', design: 'mccb_plates', faces: [FRONT_FACE] },
  ],
  explain: [],
  unsized: [],
  kvar: { used: 0, limit_per_section: null },
  assumed: { device_compartment_mm: 1500, note: 'the usable height of a device compartment is assumed' },
}

const FIT: LayoutFit = {
  verdict: 'fits',
  sections: [{ name: 'S1', design: 'mccb_plates', width_mm: 800, depth_mm: 800, used: 250, capacity: 1500,
    unit: 'mm of height', unsized: 0, verdict: 'fits', why: 'covers stack down 1500 mm',
    access: 'single_front', cable_alley: 'beside', too_shallow: null,
    faces: [{ side: 'front', connection: 'front', design: 'mccb_plates', used: 250, capacity: 1500,
      unit: 'mm of height', plate_width_mm: 400, unsized: 0, verdict: 'fits', why: 'covers stack down 1500 mm' }] }],
  section_count: 1,
  total_width_mm: 800,
  max_depth_mm: 800,
}

const DOOR: LayoutDoorDevice[] = [
  { panel_id: 'p1', costing_assembly_id: 'ca1', kit_name: '400 A MCCB', name: 'Multifunction meter',
    code: 'MFM', quantity: 1, width_mm: 96, height_mm: 96, category_code: 'accessories_hardware' },
  { panel_id: 'p1', costing_assembly_id: 'ca1', kit_name: '400 A MCCB', name: 'Selector switch',
    code: 'SEL', quantity: 1, width_mm: null, height_mm: null, category_code: 'accessories_hardware' },
]

beforeEach(() => {
  layoutKits.mockResolvedValue(KITS)
  constructions.mockResolvedValue([
    { code: 'S4', name: 'Siemens SIVACON S4', height_mm: 2000, allows_double_front: false,
      depths_busbar_top_mm: [400, 600, 800], depths_busbar_rear_mm: [800, 1000, 1200], forms: ['1', '2b'] },
    { code: 'custom_double_front', name: 'Our double-front frame', height_mm: 2000, allows_double_front: true,
      depths_busbar_top_mm: [600, 800], depths_busbar_rear_mm: [800, 1000], forms: ['2b'] },
  ])
  savedLayout.mockResolvedValue(null)
  arrangePanel.mockResolvedValue(PLAN)
  layoutFit.mockResolvedValue(FIT)
  saveLayout.mockResolvedValue({ version: 1, fit: FIT })
  doorDevices.mockResolvedValue([])
  panelWeight.mockResolvedValue({ panel_id: 'p1', weight_kg: 1640, without_weight: 0, lines: 12 })
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

function open(editable = true) {
  render(<LayoutDialog panelId="p1" panelName="MAIN LV BOARD" editable={editable} onClose={() => {}} onApplied={() => {}} />)
}

async function worked() {
  open()
  fireEvent.click(await screen.findByText('Work the board out'))
  await waitFor(() => expect(screen.getByLabelText(/Front view/)).toBeTruthy())
}

describe('the other four views', () => {
  it('starts on the front and moves to the back when asked', async () => {
    await worked()
    fireEvent.click(screen.getByText('Rear'))
    expect(await screen.findByLabelText(/Rear view, 1 sections mirrored/)).toBeTruthy()
  })

  it('says what is behind a front-connection section rather than drawing a second compartment', async () => {
    await worked()
    fireEvent.click(screen.getByText('Rear'))
    expect(await screen.findByText(/terminals shrouded/)).toBeTruthy()
  })

  it('looks down on the selected section, with its real depth', async () => {
    await worked()
    fireEvent.click(screen.getByText('Plan'))
    expect(await screen.findByLabelText('Plan view of section S1, 800 by 800 mm')).toBeTruthy()
    expect(screen.getByText(/mounting plate 400 mm wide/)).toBeTruthy()
  })

  it('draws the doors, and says when nothing is recorded as door-mounted', async () => {
    await worked()
    fireEvent.click(screen.getByText('Door'))
    expect(await screen.findByText(/No part of this panel is recorded as door-mounted/)).toBeTruthy()
  })

  it('draws what is on the door when the library knows its size, and names what it does not', async () => {
    doorDevices.mockResolvedValue(DOOR)
    await worked()
    fireEvent.click(screen.getByText('Door'))
    expect(await screen.findByLabelText(/Door view, 1 doors, 2 door-mounted parts/)).toBeTruthy()
    expect(screen.getByText(/Selector switch/)).toBeTruthy()
  })

  it('shows the board in isometric, and turns it round', async () => {
    await worked()
    fireEvent.click(screen.getByText('3D'))
    expect(await screen.findByLabelText(/Isometric view from the left/)).toBeTruthy()
    fireEvent.click(screen.getByText('Seen from the left'))
    expect(await screen.findByLabelText(/Isometric view from the right/)).toBeTruthy()
  })
})

describe('what the board is built like', () => {
  it('will not offer two faces on a single-front construction', async () => {
    open()
    await waitFor(() => expect(screen.getByLabelText('Construction')).toBeTruthy())
    expect(screen.getByLabelText('Faces')).toHaveProperty('disabled', true)
    expect(screen.getByLabelText('Faces').getAttribute('title')).toContain('single-front')
  })

  it('offers them on the fabricated frame', async () => {
    open()
    await waitFor(() => expect(screen.getByLabelText('Construction')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Construction'), { target: { value: 'custom_double_front' } })
    await waitFor(() => expect(screen.getByLabelText('Faces')).toHaveProperty('disabled', false))
  })

  it('arranges with the faces and the cable run a person chose', async () => {
    open()
    await waitFor(() => expect(screen.getByLabelText('Cables')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Cables'), { target: { value: 'behind' } })
    fireEvent.click(screen.getByText('Work the board out'))
    await waitFor(() =>
      expect(arrangePanel).toHaveBeenCalledWith('p1', 'S4', 'single_front', 'behind'))
  })

  it('refuses a drop on the back of a section that has only one face', async () => {
    await worked()
    fireEvent.click(screen.getByText('Rear'))
    await waitFor(() => expect(screen.getByLabelText(/Rear of section S1/)).toBeTruthy())
    fireEvent.dragStart(screen.getAllByText('400 A MCCB')[0] as Element)
    fireEvent.drop(screen.getByLabelText('Rear of section S1'))
    expect(await screen.findByText(/S1 has one face/)).toBeTruthy()
  })
})

describe('one section’s settings', () => {
  it('change where its cables run, and ask the database again', async () => {
    await worked()
    fireEvent.click(screen.getByLabelText('Section S1'))
    const alley = await screen.findByLabelText('Cable alley on S1')
    fireEvent.change(alley, { target: { value: 'behind' } })
    await waitFor(() =>
      expect(layoutFit).toHaveBeenCalledWith(
        [expect.objectContaining({ name: 'S1', cable_alley: 'behind' })],
        'S4',
      ))
  })

  it('offer only the depths the construction has', async () => {
    await worked()
    fireEvent.click(screen.getByLabelText('Section S1'))
    const depth = await screen.findByLabelText('Depth of S1')
    expect(Array.from((depth as HTMLSelectElement).options).map((o) => o.value)).toEqual(['400', '600', '800'])
  })

  it('and are read-only on a costing that can no longer be edited', async () => {
    open(false)
    expect(await screen.findByText('Work the board out')).toHaveProperty('disabled', true)
    expect(screen.getByLabelText('Cables')).toHaveProperty('disabled', true)
  })
})

describe('what the whole board comes to', () => {
  it('states its size and roughly what it weighs', async () => {
    await worked()
    expect(await screen.findByText(/800 × 2000 \(\+100 base\) × 800 mm/)).toBeTruthy()
    expect(screen.getByText(/≈ 1,640 kg/)).toBeTruthy()
  })

  it('turns a layer off and on again', async () => {
    await worked()
    const chip = screen.getByText('Cables')
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(chip)
    await waitFor(() => expect(screen.getByText('Cables').getAttribute('aria-pressed')).toBe('false'))
  })
})
