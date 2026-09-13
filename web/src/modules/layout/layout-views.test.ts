import { describe, expect, it } from 'vitest'
import type { LayoutDoorDevice, LayoutSection, LayoutWeight } from '../../lib/database.types'
import {
  deviceTags,
  doorRows,
  doorUnmeasured,
  faceOn,
  isDoubleFront,
  isoOffset,
  patchSection,
  placementsOn,
  planZones,
  rearRuns,
  rearWords,
  weightWords,
  wouldLose,
} from './layout-views'

const section = (over: Partial<LayoutSection> = {}): LayoutSection => ({
  name: 'S1',
  width_mm: 800,
  busbar_compartment_mm: 0,
  access: 'single_front',
  design: 'mccb_plates',
  depth_mm: 800,
  cable_alley: 'beside',
  faces: [{ side: 'front', connection: 'front', design: 'mccb_plates', placements: [] }],
  ...over,
})

const doubled = (): LayoutSection =>
  section({
    access: 'double_front',
    faces: [
      { side: 'front', connection: 'front', design: 'mccb_plates', placements: [
        { costing_assembly_id: 'a', face: 'front', name: 'A', slot: 0, height_mm: 250, unsized: false },
      ] },
      { side: 'rear', connection: 'rear', design: 'mccb_plates', placements: [
        { costing_assembly_id: 'b', face: 'rear', name: 'B', slot: 0, height_mm: 250, unsized: false },
      ] },
    ],
  })

describe('looking down on a section', () => {
  it('gives the mockup’s own plate width with the alley beside the plates', () => {
    expect(planZones(section()).plateWidthMm).toBe(450)
  })

  it('and a wider one with the alley behind them, which is the reason to do it', () => {
    expect(planZones(section({ cable_alley: 'behind' })).plateWidthMm).toBe(650)
  })

  it('never counts the busbar compartment and the vertical busbar twice', () => {
    expect(planZones(section({ busbar_compartment_mm: 200 })).plateWidthMm).toBe(400)
  })

  it('puts the busbar on the side the section says', () => {
    expect(planZones(section({ busbar_side: 'right' })).busbarSide).toBe('right')
    expect(planZones(section()).busbarSide).toBe('left')
  })

  it('takes the section’s own depth, and 800 mm when a stage-one section has none', () => {
    expect(planZones(section({ depth_mm: 1000 })).depthMm).toBe(1000)
    const stageOne = section()
    delete stageOne.depth_mm
    expect(planZones(stageOne).depthMm).toBe(800)
  })
})

describe('the back of the board', () => {
  it('puts the sections in the order someone walking round sees them', () => {
    const runs = rearRuns([section(), section({ name: 'S2', width_mm: 600 }), section({ name: 'S3' })])
    expect(runs.map((r) => r.section.name)).toEqual(['S3', 'S2', 'S1'])
    expect(runs.map((r) => r.x)).toEqual([0, 800, 1400])
  })

  it('says what is behind a rear-connection section', () => {
    const s = section({ faces: [{ side: 'front', connection: 'rear', design: 'mccb_plates', placements: [] }] })
    expect(rearWords(s)).toContain('cable lugs')
  })

  it('and that a front-connection section only shows shrouded terminals', () => {
    expect(rearWords(section())).toContain('shrouded')
  })

  it('while a double-front section has a compartment back there', () => {
    expect(rearWords(doubled())).toContain('face B')
  })

  it('knows which sections have two faces', () => {
    expect(isDoubleFront(doubled())).toBe(true)
    expect(isDoubleFront(section())).toBe(false)
    // Access says double-front but there is only one face: not yet, and not a crash.
    expect(isDoubleFront(section({ access: 'double_front' }))).toBe(false)
  })

  it('reads the placements of whichever face is asked for', () => {
    expect(placementsOn(doubled(), 'rear').map((p) => p.name)).toEqual(['B'])
    expect(placementsOn(section(), 'rear')).toEqual([])
    expect(faceOn(doubled(), 'rear')?.connection).toBe('rear')
  })
})

describe('turning a second face on and off', () => {
  it('adds the back compartment, with the section’s own design', () => {
    const after = patchSection([section()], 'S1', { access: 'double_front' })
    expect(after[0]?.faces).toHaveLength(2)
    expect(after[0]?.faces[1]?.side).toBe('rear')
    expect(after[0]?.faces[1]?.design).toBe('mccb_plates')
  })

  it('takes it away again', () => {
    const after = patchSection([doubled()], 'S1', { access: 'single_front' })
    expect(after[0]?.faces).toHaveLength(1)
  })

  it('says first how much would be lost, so the caller can refuse', () => {
    expect(wouldLose(doubled())).toBe(1)
    expect(wouldLose(section())).toBe(0)
  })

  it('changes one setting without touching the others', () => {
    const after = patchSection([section(), section({ name: 'S2' })], 'S2', { cable_alley: 'behind' })
    expect(after[0]?.cable_alley).toBe('beside')
    expect(after[1]?.cable_alley).toBe('behind')
    expect(after[1]?.width_mm).toBe(800)
  })
})

describe('the isometric', () => {
  it('foreshortens depth the way the mockup does', () => {
    // 800 mm at 1 : 4 is 200 units; the mockup offsets it by 110 across and 64 up.
    expect(isoOffset(800)).toEqual({ dx: 110, dy: 64 })
  })
})

describe('the door', () => {
  const meter: LayoutDoorDevice = {
    panel_id: 'p1', costing_assembly_id: 'ca1', kit_name: 'METERING', name: 'MFM 96 x 96',
    code: 'MFM', quantity: 2, width_mm: 96, height_mm: 96, category_code: 'accessories_hardware',
  }
  const unmeasured: LayoutDoorDevice = { ...meter, name: 'Selector switch', code: 'SEL', quantity: 1, width_mm: null, height_mm: null }

  it('lays the parts out across the door, one per unit of quantity', () => {
    const rows = doorRows([meter], 800)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.x).toBe(40)
    expect(rows[1]?.x).toBe(176)
  })

  it('wraps onto a second row rather than running off the door', () => {
    const rows = doorRows([{ ...meter, quantity: 8 }], 400)
    expect(rows.some((r) => r.y > 40)).toBe(true)
  })

  it('draws nothing it has no size for, and names it instead', () => {
    expect(doorRows([unmeasured], 800)).toHaveLength(0)
    expect(doorUnmeasured([meter, unmeasured]).map((d) => d.name)).toEqual(['Selector switch'])
  })
})

describe('the board’s weight', () => {
  const weight = (over: Partial<LayoutWeight> = {}): LayoutWeight =>
    ({ panel_id: 'p1', weight_kg: 1640, without_weight: 0, lines: 20, ...over })

  it('is an estimate, and reads as one', () => {
    expect(weightWords(weight())).toBe('≈ 1,640 kg')
  })

  it('says how much of it is missing rather than quietly under-reporting', () => {
    expect(weightWords(weight({ without_weight: 3 }))).toContain('less 3 part(s) with no weight')
  })

  it('and says plainly when there is nothing to add up', () => {
    expect(weightWords(null)).toBe('no weights on record')
    expect(weightWords(weight({ weight_kg: null }))).toBe('no weights on record')
  })
})

describe('device tags', () => {
  it('number every placement on the board, front face first', () => {
    const tags = deviceTags([doubled(), section({ name: 'S2' })])
    expect(tags['S1/front/0']).toBe('Q1')
    expect(tags['S1/rear/0']).toBe('Q2')
  })
})
