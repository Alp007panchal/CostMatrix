import { describe, expect, it } from 'vitest'
import type { CostingAssembly, CostingItem, CostingPanel, Kit } from '../../lib/database.types'
import { describePanel } from './technical'

const panel = { id: 'p1', costing_id: 'c', company_id: 'co', name: 'MAIN LV BOARD', tag: null, option_label: 'Option 1', uom: 'PC', quantity: 1, technical_description: null, enclosure_dimensions: null, sort_order: 0 } as CostingPanel
const line = (over: Partial<CostingAssembly>): CostingAssembly => ({
  id: 'a1', costing_id: 'c', panel_id: 'p1', kind: 'kit', source_assembly_id: 'k1', code: 'ACB-KIT', name: '1600A 4P WITHDRAWABLE MOTORIZED ACB-KIT', quantity: 1, sort_order: 0, ...over,
})
const item = (over: Partial<CostingItem>): CostingItem => ({
  id: 'i', costing_id: 'c', costing_assembly_id: 'a1', source_component_id: 'x', code: 'X', name: 'Thing',
  category_code: 'switchgear', unit: 'pcs', manufacturer: null, part_number: null, quantity: 1, pricing_mode: 'fixed',
  purchase_price: null, purchase_currency: null, landed_factor: null, uplift_pct: null, unit_price: 1, is_manual: false, sort_order: 0, ...over,
})
const kit: Kit = { id: 'k1', company_id: null, code: 'ACB-KIT', name: '1600A 4P WITHDRAWABLE MOTORIZED ACB-KIT', description: null, is_active: true, kit_group_id: 'g', group_name: 'Incomer-kit', rating: 1600, rating_unit: 'A', poles: 4, main_device_code: '3WJ1116', main_device_name: 'ACB', has_unpriced_part: false, line_count: 2 }

describe('describePanel', () => {
  it('groups kits under their kit group with their lines indented', () => {
    const text = describePanel({
      panel,
      assemblies: [line({})],
      items: [
        item({ id: 'i1', name: '1600A 4P WITHDRAWABLE MOTORIZED ACB', manufacturer: 'SIEMENS', part_number: '3WJ1116-2AE42-4DD0', code: '3WJ1116-2AE42-4DD0' }),
        item({ id: 'i2', name: '100X10MM', code: '100X10MM', unit: 'm', quantity: 6.5, category_code: 'busbar', sort_order: 1 }),
      ],
      kits: [kit],
    })
    expect(text).toBe([
      'INCOMER-KIT',
      '1 No. 1600A 4P WITHDRAWABLE MOTORIZED ACB-KIT, 4P',
      '   - 1 No. 1600A 4P WITHDRAWABLE MOTORIZED ACB, SIEMENS',
      '   - 6.5 m 100X10MM',
    ].join('\n'))
  })
  it('lists loose components and the enclosure in their own sections', () => {
    const text = describePanel({
      panel,
      assemblies: [line({ id: 'f', kind: 'free', source_assembly_id: null, code: 'FREE', name: 'Components and enclosure', sort_order: 9 })],
      items: [
        item({ id: 'i3', costing_assembly_id: 'f', name: 'SYNCHRO CHECK RELAYS', code: 'MANUAL-001', quantity: 2, is_manual: true }),
        item({ id: 'i4', costing_assembly_id: 'f', name: 'FREE STANDING', code: '800(W)X800(D)X2100(H)-2B', part_number: '800(W)X800(D)X2100(H)-2B', manufacturer: 'LOCAL', category_code: 'enclosure_parts', quantity: 5, sort_order: 1 }),
      ],
    })
    expect(text).toBe(['OTHER COMPONENTS', '2 No. SYNCHRO CHECK RELAYS', '', 'ENCLOSURE', '5 No. FREE STANDING, LOCAL'].join('\n'))
  })
  it('is empty for an empty panel and ignores other panels', () => {
    expect(describePanel({ panel, assemblies: [line({ panel_id: 'p2' })], items: [item({})] })).toBe('')
  })
  it('falls back to a plain KITS heading when the library kit is unknown', () => {
    const text = describePanel({ panel, assemblies: [line({ source_assembly_id: null })], items: [] })
    expect(text).toBe('KITS\n1 No. 1600A 4P WITHDRAWABLE MOTORIZED ACB-KIT')
  })
})
