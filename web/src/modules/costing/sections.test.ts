import { describe, expect, it } from 'vitest'
import type { AssemblyTotals, CostingAssembly } from '../../lib/database.types'
import { NO_SECTION, groupBySection } from './sections'

const offered = ['Incomer', 'AVR bypass', 'ATS', '2nd incomer', 'Outgoers', 'Accessories', 'APFC bank']

const line = (over: Partial<CostingAssembly>): CostingAssembly => ({
  id: 'a', costing_id: 'c', panel_id: 'p', kind: 'kit', section: null, source_assembly_id: 'k',
  code: 'KIT', name: 'A kit', quantity: 1, parameters: {}, sort_order: 0, ...over,
})
const totals = (id: string, material: number, labour: number): AssemblyTotals => ({
  costing_assembly_id: id, material_each: material, labour_each: labour,
  material_total: material, labour_total: labour, hours_each: 0, hours_total: 0,
})

describe('groupBySection', () => {
  it('puts the offered sections in the library order whatever order they were added', () => {
    const groups = groupBySection(
      [
        line({ id: '1', section: 'Outgoers', sort_order: 0 }),
        line({ id: '2', section: 'Incomer', sort_order: 1 }),
        line({ id: '3', section: 'APFC bank', sort_order: 2 }),
      ],
      [],
      offered,
    )
    expect(groups.map((g) => g.heading)).toEqual(['Incomer', 'Outgoers', 'APFC bank'])
  })

  it('adds up the material and labour of each section', () => {
    const groups = groupBySection(
      [
        line({ id: '1', section: 'Incomer', sort_order: 0 }),
        line({ id: '2', section: 'Incomer', kind: 'free', sort_order: 1 }),
        line({ id: '3', section: 'Outgoers', sort_order: 2 }),
      ],
      [totals('1', 100, 10), totals('2', 25, 0), totals('3', 40, 5)],
      offered,
    )
    expect(groups[0]).toMatchObject({ heading: 'Incomer', material: 125, labour: 10 })
    expect(groups[1]).toMatchObject({ heading: 'Outgoers', material: 40, labour: 5 })
  })

  it('keeps a typed section after the offered ones and the unsectioned lines last', () => {
    const groups = groupBySection(
      [
        line({ id: '1', section: null, sort_order: 0 }),
        line({ id: '2', section: 'Battery charger', sort_order: 1 }),
        line({ id: '3', section: 'Incomer', sort_order: 2 }),
      ],
      [],
      offered,
    )
    expect(groups.map((g) => g.heading)).toEqual(['Incomer', 'Battery charger', NO_SECTION])
    expect(groups[2]?.section).toBeNull()
  })

  it('treats blank, spaces and a different case as the same section', () => {
    const groups = groupBySection(
      [
        line({ id: '1', section: '  Incomer ', sort_order: 0 }),
        line({ id: '2', section: '   ', kind: 'free', sort_order: 1 }),
      ],
      [],
      offered,
    )
    expect(groups.map((g) => g.heading)).toEqual(['Incomer', NO_SECTION])
  })

  it('puts a kit before the loose parts of the same section', () => {
    const groups = groupBySection(
      [
        line({ id: 'free', kind: 'free', section: 'Incomer', sort_order: 0 }),
        line({ id: 'kit', section: 'Incomer', sort_order: 1 }),
      ],
      [],
      offered,
    )
    expect(groups[0]?.lines.map((l) => l.id)).toEqual(['kit', 'free'])
  })
})
