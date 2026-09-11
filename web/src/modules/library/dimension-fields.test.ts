import { describe, expect, it } from 'vitest'
import { EMPTY_DIMENSIONS, fitSentence, fromDimensionValues, toDimensionValues } from './dimension-fields'

/**
 * The conversion between the boxes on the screen and the two jsonb columns
 * migration 0106 added, and the sentence the costing screen shows. The rule
 * throughout: an empty box means "not measured", never zero.
 */

describe('showing what the database holds', () => {
  it('shows nothing for a part nobody has measured', () => {
    expect(toDimensionValues(null)).toEqual(EMPTY_DIMENSIONS)
    expect(toDimensionValues({ width_mm: null, clearances: {}, enclosure_layout: {} })).toEqual(EMPTY_DIMENSIONS)
  })

  it('spreads the clearances and the cubicle layout into their own boxes', () => {
    const values = toDimensionValues({
      width_mm: 400, height_mm: 600, depth_mm: 300, mounting_type: 'withdrawable', weight_kg: 52.5,
      clearances: { top: 50, bottom: 50, left: 25, right: 25 },
      enclosure_layout: {
        usable_w_mm: 700, usable_h_mm: 1800, form: '3B',
        busbar_chamber: { w_mm: 800, h_mm: 300 },
      },
    })
    expect(values).toMatchObject({
      width_mm: '400', height_mm: '600', depth_mm: '300', mounting_type: 'withdrawable',
      weight_kg: '52.5', clearance_top: '50', clearance_left: '25',
      usable_w_mm: '700', usable_h_mm: '1800', busbar_chamber_w: '800', busbar_chamber_h: '300',
      form: '3B',
    })
    expect(values.usable_d_mm).toBe('')
    expect(values.cable_chamber_w).toBe('')
  })
})

describe('saving what was typed', () => {
  it('sends nothing at all for an untouched form', () => {
    expect(fromDimensionValues(EMPTY_DIMENSIONS, false)).toEqual({
      width_mm: null, height_mm: null, depth_mm: null, mounting_type: null, weight_kg: null,
      clearances: {}, enclosure_layout: {},
    })
  })

  it('keeps an empty box empty rather than turning it into a zero', () => {
    const saved = fromDimensionValues({ ...EMPTY_DIMENSIONS, width_mm: '400', height_mm: '' }, false)
    expect(saved.width_mm).toBe(400)
    expect(saved.height_mm).toBeNull()
  })

  it('refuses a zero or a negative measurement, which the database would too', () => {
    const saved = fromDimensionValues({ ...EMPTY_DIMENSIONS, width_mm: '0', height_mm: '-5' }, false)
    expect(saved.width_mm).toBeNull()
    expect(saved.height_mm).toBeNull()
  })

  it('sends only the clearance sides that were filled in', () => {
    const saved = fromDimensionValues({ ...EMPTY_DIMENSIONS, clearance_top: '50', clearance_right: '25' }, false)
    expect(saved.clearances).toEqual({ top: 50, right: 25 })
  })

  it('sends a usable area only for an enclosure cubicle', () => {
    const typed = { ...EMPTY_DIMENSIONS, usable_w_mm: '700', usable_h_mm: '1800', form: '3B' }
    expect(fromDimensionValues(typed, false).enclosure_layout).toEqual({})
    expect(fromDimensionValues(typed, true).enclosure_layout).toEqual({
      usable_w_mm: 700, usable_h_mm: 1800, form: '3B',
    })
  })

  it('builds a chamber from whichever side was given', () => {
    const saved = fromDimensionValues({ ...EMPTY_DIMENSIONS, busbar_chamber_h: '300', cable_chamber_w: '250' }, true)
    expect(saved.enclosure_layout.busbar_chamber).toEqual({ h_mm: 300 })
    expect(saved.enclosure_layout.cable_chamber).toEqual({ w_mm: 250 })
  })

  it('accepts a weight of zero, which is a real answer, unlike a size', () => {
    expect(fromDimensionValues({ ...EMPTY_DIMENSIONS, weight_kg: '0' }, false).weight_kg).toBe(0)
  })

  it('ignores a mounting type the database would refuse', () => {
    expect(fromDimensionValues({ ...EMPTY_DIMENSIONS, mounting_type: 'glued' }, false).mounting_type).toBeNull()
    expect(fromDimensionValues({ ...EMPTY_DIMENSIONS, mounting_type: 'din_rail' }, false).mounting_type).toBe('din_rail')
  })
})

describe('what the costing screen says about space', () => {
  const base = { used_pct: 50, kits_unmeasured: 0, cubicles: [{ known: true }] }

  it('says how full the board is when it fits', () => {
    const { tone, text } = fitSentence({ ...base, verdict: 'fits' })
    expect(tone).toBe('ok')
    expect(text).toMatch(/about 50 % of the cubicles/)
  })

  it('warns when it is tight, and says to check a drawing', () => {
    const { tone, text } = fitSentence({ ...base, verdict: 'tight', used_pct: 96 })
    expect(tone).toBe('muted')
    expect(text).toMatch(/tight/)
    expect(text).toMatch(/against a drawing/)
  })

  it('says what to do when it does not fit', () => {
    const { tone, text } = fitSentence({ ...base, verdict: 'no_fit', used_pct: 140 })
    expect(tone).toBe('error')
    expect(text).toMatch(/Add a cubicle, or a wider one/)
  })

  it('admits when part of the panel is unmeasured', () => {
    const { text } = fitSentence({ ...base, verdict: 'fits', kits_unmeasured: 2 })
    expect(text).toMatch(/2 kits not measured yet/)
  })

  it('explains an unknown verdict by what is missing', () => {
    expect(fitSentence({ ...base, verdict: 'unknown', cubicles: [] }).text).toMatch(/no enclosure cubicle/)
    expect(fitSentence({ ...base, verdict: 'unknown' }).text).toMatch(/measure the kits and the cubicle/)
  })
})
