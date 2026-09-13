import { describe, expect, it } from 'vitest'
import type { CostingDetail } from '../../costing/api'
import type { LayoutSection } from '../../../lib/database.types'
import { buildGaSheets, gaTagLine, type SavedPanelLayout } from './ga'
import { devicePlace, gaGeometry, scaleWords, sheetTags } from './ga-geometry'
import { buildTechnical } from './prepare'

function detail(over: Partial<CostingDetail> = {}): CostingDetail {
  return {
    costing: {
      id: 'c', company_id: 'co', enquiry_id: null, costing_no: 'CM-2026-0001', revision_no: 0, family_id: 'f',
      previous_revision_id: null, is_current: true, title: 'MCC', notes: null, status: 'approved',
      currency_code: 'KES', currency_label: 'KSH', exchange_rate: 1, discount_pct: 0,
      material_margin_pct: 10, labour_margin_pct: 20, negotiation_margin_pct: 0,
      price_rounding_step: 100, tax_pct: 16, enclosure_uplift_pct: 0, chosen_option_label: null,
      submitted_at: null, approved_at: null,
      returned_at: null, return_comment: null, created_at: '', updated_at: '',
    },
    panels: [], assemblies: [], items: [], labour: [], assemblyTotals: [],
    panelPrices: [], totals: null, optionTotals: [], kits: [],
    ...over,
  }
}

const panel = (id: string, name: string, enclosure: string | null = null) => ({
  id, costing_id: 'c', company_id: 'co', name, tag: null, option_label: null, uom: 'PC',
  quantity: 1, is_option: false, technical_description: null, enclosure_dimensions: enclosure, sort_order: 0,
})

const incomer: LayoutSection = {
  name: 'S1', width_mm: 800, depth_mm: 800, busbar_compartment_mm: 0, access: 'single_front',
  design: 'busbar_fed', form: '2b', cable_alley: 'beside',
  faces: [{ side: 'front', connection: 'front', design: 'busbar_fed', placements: [
    { costing_assembly_id: 'ca1', face: 'front', name: '1600 A ACB', slot: 0, height_mm: 1200, unsized: false },
  ] }],
}

const feeders: LayoutSection = {
  name: 'S2', width_mm: 800, depth_mm: 800, busbar_compartment_mm: 200, access: 'single_front',
  design: 'mccb_plates', form: '2b', cable_alley: 'beside',
  faces: [{ side: 'front', connection: 'front', design: 'mccb_plates', placements: [
    { costing_assembly_id: 'ca2', face: 'front', name: '400 A MCCB', slot: 0, height_mm: 250, y_mm: 0, unsized: false },
    { costing_assembly_id: 'ca3', face: 'front', name: '250 A MCCB', slot: 1, height_mm: 200, y_mm: 250, unsized: false },
  ] }],
}

const saved = (sections: LayoutSection[], over: Partial<SavedPanelLayout> = {}): SavedPanelLayout => ({
  panel_id: 'p1', sections, construction_code: 'S4', version: 2, ...over,
})

describe('the general-arrangement sheets', () => {
  it('are made only for panels somebody has actually drawn', () => {
    const d = detail({ panels: [panel('p1', 'MAIN LV BOARD'), panel('p2', 'SUB BOARD')] })
    const sheets = buildGaSheets(d, [saved([incomer])])
    expect(sheets.map((s) => s.panelId)).toEqual(['p1'])
  })

  it('and not at all when nothing has been drawn', () => {
    expect(buildGaSheets(detail({ panels: [panel('p1', 'A')] }), [])).toEqual([])
    expect(buildGaSheets(detail({ panels: [panel('p1', 'A')] }), [saved([])])).toEqual([])
  })

  it('number the devices Q1, Q2 … straight through the board', () => {
    const [sheet] = buildGaSheets(detail({ panels: [panel('p1', 'MAIN LV BOARD')] }), [saved([incomer, feeders])])
    expect(sheetTags(sheet!)).toEqual(['Q1', 'Q2', 'Q3'])
    expect(sheet!.sections[1]?.devices[0]?.label).toBe('400 A MCCB')
  })

  it('add the widths up to the board, and carry its deepest section', () => {
    const [sheet] = buildGaSheets(detail({ panels: [panel('p1', 'B')] }), [
      saved([incomer, { ...feeders, depth_mm: 1000 }]),
    ])
    expect(sheet!.widthMm).toBe(1600)
    expect(sheet!.depthMm).toBe(1000)
  })

  it('name each section the way a drawing office would', () => {
    const [sheet] = buildGaSheets(detail({ panels: [panel('p1', 'B')] }), [saved([incomer, feeders])])
    expect(sheet!.sections[0]?.designWords).toBe('INCOMER / BUSBAR-FED')
    expect(sheet!.sections[1]?.designWords).toBe('OUTGOING FEEDERS')
  })

  it('say on the sheet that a double-front board has a face this elevation cannot show', () => {
    const doubled: LayoutSection = {
      ...feeders, access: 'double_front',
      faces: [
        feeders.faces[0]!,
        { side: 'rear', connection: 'rear', design: 'mccb_plates', placements: [
          { costing_assembly_id: 'ca9', face: 'rear', name: 'CHANGEOVER', slot: 0, height_mm: 300, unsized: false },
        ] },
      ],
    }
    const [sheet] = buildGaSheets(detail({ panels: [panel('p1', 'B')] }), [saved([doubled])])
    expect(sheet!.hasRearFace).toBe(true)
    expect(sheet!.sections[0]?.designWords).toContain('DOUBLE-FRONT')
    // The rear device is still tagged, so the schedule and the drawing agree.
    expect(sheetTags(sheet!)).toEqual(['Q1', 'Q2', 'Q3'])
  })

  it('take the form from the drawing and claim nothing else', () => {
    const [sheet] = buildGaSheets(detail({ panels: [panel('p1', 'B')] }), [saved([incomer])])
    expect(sheet!.specLine).toContain('FORM 2B')
    expect(sheet!.specLine).toContain('FRONT ACCESS')
    expect(sheet!.specLine).toContain('IEC 61439-1 & 2')
    expect(sheet!.specLine).not.toContain('IP')
  })

  it('print the panel’s own enclosure note where it has one', () => {
    const [sheet] = buildGaSheets(
      detail({ panels: [panel('p1', 'B', '2 x 800 x 2000 x 800')] }),
      [saved([incomer])],
    )
    expect(sheet!.specLine).toContain('2 X 800 X 2000 X 800')
  })

  it('mark a device the library has never measured rather than sizing it', () => {
    const vague: LayoutSection = {
      ...incomer,
      faces: [{ side: 'front', connection: 'front', design: 'busbar_fed', placements: [
        { costing_assembly_id: 'ca1', face: 'front', name: 'MYSTERY KIT', slot: 0, height_mm: null, unsized: true },
      ] }],
    }
    const [sheet] = buildGaSheets(detail({ panels: [panel('p1', 'B')] }), [saved([vague])])
    expect(sheet!.sections[0]?.devices[0]?.unsized).toBe(true)
    expect(sheet!.sections[0]?.devices[0]?.heightMm).toBe(0)
  })
})

describe('the tags the technical offer repeats', () => {
  it('are exactly the tags on the drawing — the spec’s own test', () => {
    const d = detail({ panels: [panel('p1', 'MAIN LV BOARD')] })
    const sheets = buildGaSheets(d, [saved([incomer, feeders])])
    const rows = buildTechnical(d, sheets)
    const line = rows[0]?.description ?? ''
    for (const tag of sheetTags(sheets[0]!)) {
      expect(line).toContain(tag)
    }
    expect(gaTagLine(sheets[0]!)).toContain('Q1 1600 a acb')
  })

  it('are left out entirely when the panel has no drawing, so the offer reads as it always did', () => {
    const d = detail({ panels: [panel('p1', 'MAIN LV BOARD')] })
    expect(buildTechnical(d, [])[0]?.description ?? '').not.toContain('Device tags')
  })
})

describe('fitting the drawing on the page', () => {
  const sheetOf = (widthMm: number) => ({
    panelId: 'p1', panelName: 'B', optionLabel: null, construction: 'S4', version: 1,
    widthMm, heightMm: 2000, baseMm: 100, depthMm: 800, sections: [], specLine: '', hasRearFace: false,
  })

  it('scales the board to the frame, so a long board and a short one both fill it', () => {
    const wide = gaGeometry(sheetOf(6000))
    const narrow = gaGeometry(sheetOf(800))
    expect(Math.round(wide.boardWidth)).toBe(700)
    // The short board is limited by height instead, never stretched past it.
    expect(Math.round(narrow.boardHeight + narrow.baseHeight)).toBe(300)
  })

  it('prints the scale, so nobody measures off the paper', () => {
    expect(scaleWords(0.1167)).toBe('1 : 3')
    expect(scaleWords(0.02)).toBe('1 : 18')
    // Past 1 : 20 it rounds to fives, the way a drawing office writes it.
    expect(scaleWords(0.01)).toBe('1 : 35')
  })

  it('keeps every device inside the compartment, clear of the busbars', () => {
    const g = gaGeometry(sheetOf(1600))
    const place = devicePlace(
      { tag: 'Q1', label: 'X', costingAssemblyId: 'ca1', face: 'front', heightMm: 4000, yMm: 0, quantity: 1, unsized: false },
      g,
    )
    expect(place.y).toBeGreaterThanOrEqual(g.chamber)
    expect(place.y + place.height).toBeLessThanOrEqual(g.boardHeight - g.chamber + 0.01)
  })

  it('gives an unmeasured device a nominal height rather than none at all', () => {
    const g = gaGeometry(sheetOf(1600))
    const place = devicePlace(
      { tag: 'Q1', label: 'X', costingAssemblyId: 'ca1', face: 'front', heightMm: 0, yMm: 0, quantity: 1, unsized: true },
      g,
    )
    expect(place.height).toBeGreaterThan(6)
  })
})
