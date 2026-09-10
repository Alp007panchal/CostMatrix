import { describe, expect, it } from 'vitest'
import type { QuotationRow } from '../../lib/database.types'
import { groupQuotations } from './quotation-groups'

const row = (
  id: string,
  releasedAt: string,
  costing: Partial<NonNullable<QuotationRow['costing']>> | null,
): QuotationRow =>
  ({
    id,
    reference_no: `NPP-${id}`,
    released_at: releasedAt,
    status: 'released',
    costing: costing
      ? { family_id: 'f', revision_no: 0, costing_no: 'CM-1', enquiry_id: 'e1', title: 'A job', ...costing }
      : null,
  }) as QuotationRow

describe('groupQuotations', () => {
  it('puts the revisions of one job together, newest first', () => {
    const groups = groupQuotations([
      row('r0', '2026-01-01', { family_id: 'fam', revision_no: 0 }),
      row('r2', '2026-03-01', { family_id: 'fam', revision_no: 2 }),
      row('r1', '2026-02-01', { family_id: 'fam', revision_no: 1 }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.families).toHaveLength(1)
    expect(groups[0]?.families[0]?.latest.id).toBe('r2')
    expect(groups[0]?.families[0]?.earlier.map((q) => q.id)).toEqual(['r1', 'r0'])
  })

  it('keeps two offers against one enquiry as two families of one group', () => {
    const groups = groupQuotations([
      row('a', '2026-01-01', { family_id: 'famA', enquiry_id: 'e9', costing_no: 'CM-1' }),
      row('b', '2026-01-02', { family_id: 'famB', enquiry_id: 'e9', costing_no: 'CM-2' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.enquiryId).toBe('e9')
    expect(groups[0]?.families.map((f) => f.costingNo)).toEqual(['CM-2', 'CM-1'])
  })

  it('orders jobs by their newest release and leaves the enquiry-less ones last', () => {
    const groups = groupQuotations([
      row('none', '2026-05-01', null),
      row('old', '2026-01-01', { enquiry_id: 'eOld', family_id: 'f1' }),
      row('new', '2026-04-01', { enquiry_id: 'eNew', family_id: 'f2' }),
    ])
    expect(groups.map((g) => g.enquiryId)).toEqual(['eNew', 'eOld', null])
  })

  it('treats a quotation with no costing behind it as its own job', () => {
    const groups = groupQuotations([row('lonely', '2026-01-01', null)])
    expect(groups[0]?.families[0]?.key).toBe('lonely')
    expect(groups[0]?.families[0]?.costingNo).toBe('NPP-lonely')
  })
})
