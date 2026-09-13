import { describe, expect, it } from 'vitest'
import type { LayoutFit, LayoutKit, LayoutSection } from '../../lib/database.types'
import {
  boardWidthMm,
  designWords,
  dropRefusal,
  frontFace,
  mm,
  placeKit,
  placedCounts,
  removePlacement,
  sectionRuns,
  stackedCovers,
  symbolFor,
  usedBy,
  verdictWords,
} from './layout'

const section = (over: Partial<LayoutSection> = {}): LayoutSection => ({
  name: 'S1',
  width_mm: 800,
  busbar_compartment_mm: 200,
  access: 'single_front',
  design: 'mccb_plates',
  faces: [{ side: 'front', connection: 'front', design: 'mccb_plates', placements: [] }],
  ...over,
})

const kit = (over: Partial<LayoutKit> = {}): LayoutKit => ({
  costing_assembly_id: 'ca1',
  panel_id: 'p1',
  name: '400 A MCCB',
  quantity: 1,
  assembly_id: 'a1',
  mounting_design: 'mccb_plates',
  module_height_mm: 250,
  positions_per_plate: null,
  footprint_w_mm: null,
  rating: 400,
  rating_unit: 'A',
  is_sized: true,
  ...over,
})

const fit = (used: number, capacity: number | null): LayoutFit => ({
  verdict: 'fits',
  sections: [{ name: 'S1', design: 'mccb_plates', width_mm: 800, used, capacity, unit: 'mm of height', unsized: 0, verdict: 'fits', why: '' }],
  section_count: 1,
  total_width_mm: 800,
})

describe('drawing the board', () => {
  it('is at 1 : 4, the scale of the mockups', () => {
    expect(mm(800)).toBe(200)
    expect(mm(2000)).toBe(500)
  })

  it('lays the sections out left to right, each where the last one ended', () => {
    const runs = sectionRuns([section(), section({ name: 'S2', width_mm: 600 }), section({ name: 'S3' })])
    expect(runs.map((r) => r.x)).toEqual([0, 800, 1400])
  })

  it('adds the widths up to the board', () => {
    expect(boardWidthMm([section(), section({ width_mm: 600 })])).toBe(1400)
  })

  it('stacks covers down the compartment, each under the one above', () => {
    const s = section({
      faces: [{ side: 'front', connection: 'front', design: 'mccb_plates', placements: [
        { costing_assembly_id: 'a', face: 'front', name: 'A', slot: 0, height_mm: 250, unsized: false },
        { costing_assembly_id: 'b', face: 'front', name: 'B', slot: 1, height_mm: 200, unsized: false },
      ] }],
    })
    expect(stackedCovers(s).map((c) => [c.y, c.height])).toEqual([[0, 250], [250, 200]])
  })

  it('honours a y the arrangement gave a cover rather than re-stacking it', () => {
    const s = section({
      faces: [{ side: 'front', connection: 'front', design: 'mccb_plates', placements: [
        { costing_assembly_id: 'a', face: 'front', name: 'A', slot: 0, height_mm: 250, y_mm: 500, unsized: false },
      ] }],
    })
    expect(stackedCovers(s)[0]?.y).toBe(500)
  })

  it('counts what a section carries, quantity and all', () => {
    const s = section({
      faces: [{ side: 'front', connection: 'front', design: 'mccb_plates', placements: [
        { costing_assembly_id: 'a', face: 'front', name: 'A', slot: 0, height_mm: 200, quantity: 3, unsized: false },
      ] }],
    })
    expect(usedBy(s)).toBe(600)
  })
})

describe('what a drop is refused for', () => {
  it('allows a kit of the section’s own design with room to spare', () => {
    expect(dropRefusal(section(), kit(), fit(500, 1500))).toBe(null)
  })

  it('refuses a kit the library has never described', () => {
    expect(dropRefusal(section(), kit({ mounting_design: null, is_sized: false }), fit(0, 1500)))
      .toContain('has no mounting design yet')
  })

  it('refuses a busbar-fed device on a section of covers, in words', () => {
    expect(dropRefusal(section(), kit({ mounting_design: 'busbar_fed' }), fit(0, 1500)))
      .toBe('S1 is a MCCB cover section; 400 A MCCB is busbar-fed.')
  })

  it('refuses one that does not fit what is left, and says how much is left', () => {
    expect(dropRefusal(section(), kit(), fit(1400, 1500)))
      .toBe('S1 has 100 mm of compartment left and 400 A MCCB needs 250 mm. Start another section, or use a wider one.')
  })

  it('lets the server decide when the section has no capacity on record', () => {
    expect(dropRefusal(section(), kit(), fit(0, null))).toBe(null)
  })
})

describe('placing and taking off', () => {
  it('puts a kit on the face it was dropped on', () => {
    const after = placeKit([section(), section({ name: 'S2' })], 'S2', kit())
    expect(frontFace(after[0] as LayoutSection)).toHaveLength(0)
    expect(frontFace(after[1] as LayoutSection)[0]).toMatchObject({ name: '400 A MCCB', height_mm: 250 })
  })

  it('marks a kit the library has not described as unsized when it is placed', () => {
    const after = placeKit([section()], 'S1', kit({ is_sized: false }))
    expect(frontFace(after[0] as LayoutSection)[0]?.unsized).toBe(true)
  })

  it('takes one off by the place it was drawn at', () => {
    const two = placeKit(placeKit([section()], 'S1', kit()), 'S1', kit({ name: 'Second' }))
    const after = removePlacement(two, 'S1', 0)
    expect(frontFace(after[0] as LayoutSection).map((p) => p.name)).toEqual(['Second'])
  })

  it('counts how many of each kit are placed, so the list can say so', () => {
    const after = placeKit(placeKit([section()], 'S1', kit()), 'S1', kit())
    expect(placedCounts(after)).toEqual({ ca1: 2 })
  })
})

describe('the words a person reads', () => {
  it('turn a verdict into a sentence', () => {
    expect(verdictWords('tight')).toBe('Fits, tight')
    expect(verdictWords('unknown')).toBe('Unknown — something on it has never been measured')
  })

  it('name a mounting design the way the owner does', () => {
    expect(designWords('side_by_side_plates')).toBe('side-by-side plate')
    expect(designWords(null)).toBe('undescribed')
  })

  it('pick the drawing the owner’s mockup uses for each design', () => {
    expect(symbolFor('busbar_fed')).toBe('acb')
    expect(symbolFor('mccb_plates')).toBe('mccb')
    expect(symbolFor('compensation')).toBe('cap')
  })
})
