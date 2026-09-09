import { describe, expect, it } from 'vitest'
import { kvarTotal } from './kvar'
import type { CostingAssembly, Kit } from '../../lib/database.types'

const kit = (id: string, rating: number | null, unit: 'A' | 'KVAR' | null): Kit => ({
  id, company_id: null, code: id, name: id, description: null, is_active: true, kit_group_id: null,
  group_name: null, rating, rating_unit: unit, poles: 3, main_device_code: null, main_device_name: null,
  has_unpriced_part: false, line_count: 2,
})
const line = (source: string | null, quantity: number, kind: 'kit' | 'free' = 'kit'): CostingAssembly => ({
  id: `${source}-${quantity}`, costing_id: 'c', panel_id: 'p', kind, source_assembly_id: source,
  code: source ?? 'FREE', name: '', quantity, sort_order: 0,
})

describe('kvarTotal', () => {
  const kits = [kit('k50', 50, 'KVAR'), kit('k25', 25, 'KVAR'), kit('mccb', 250, 'A')]
  it('adds rating × quantity over the kVAr kits only', () => {
    expect(kvarTotal([line('k50', 6), line('k25', 4), line('mccb', 3)], kits)).toBe(400)
  })
  it('is null when the panel has no kVAr kit', () => {
    expect(kvarTotal([line('mccb', 3), line(null, 1, 'free')], kits)).toBeNull()
  })
})
