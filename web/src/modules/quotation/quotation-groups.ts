import type { QuotationRow } from '../../lib/database.types'

/**
 * One job read as one job. A quotation belongs to a costing, a costing to a
 * family (its revisions) and a family to an enquiry. So the list is grouped
 * enquiry → family, with the newest revision of each family first and the
 * earlier ones behind it, instead of five rows that look like five jobs.
 *
 * Pure, so it is unit-tested rather than eyeballed on a screen.
 */

export interface FamilyGroup {
  /** The family the revisions share; the quotation's own id when there is none. */
  key: string
  costingNo: string
  /** Newest revision first. */
  quotations: QuotationRow[]
  latest: QuotationRow
  earlier: QuotationRow[]
}

export interface EnquiryGroup {
  enquiryId: string | null
  families: FamilyGroup[]
  /** The newest release anywhere in the group, which is how groups are ordered. */
  releasedAt: string
}

const NO_ENQUIRY = ''

export function groupQuotations(rows: QuotationRow[]): EnquiryGroup[] {
  const byEnquiry = new Map<string, Map<string, QuotationRow[]>>()

  for (const row of rows) {
    const enquiry = row.costing?.enquiry_id ?? NO_ENQUIRY
    const family = row.costing?.family_id ?? row.id
    if (!byEnquiry.has(enquiry)) byEnquiry.set(enquiry, new Map())
    const families = byEnquiry.get(enquiry)!
    families.set(family, [...(families.get(family) ?? []), row])
  }

  const groups: EnquiryGroup[] = []
  for (const [enquiry, families] of byEnquiry) {
    const built: FamilyGroup[] = []
    for (const [key, quotations] of families) {
      const sorted = [...quotations].sort(byRevision)
      const [latest, ...earlier] = sorted
      if (!latest) continue
      built.push({
        key,
        costingNo: latest.costing?.costing_no ?? latest.reference_no,
        quotations: sorted,
        latest,
        earlier,
      })
    }
    built.sort((a, b) => released(b.latest).localeCompare(released(a.latest)))
    const newest = built[0]
    if (!newest) continue
    groups.push({
      enquiryId: enquiry === NO_ENQUIRY ? null : enquiry,
      families: built,
      releasedAt: released(newest.latest),
    })
  }

  // Newest job first, and the quotations with no enquiry behind them last:
  // they are the odd ones out, raised without a request to answer.
  return groups.sort((a, b) => {
    if ((a.enquiryId === null) !== (b.enquiryId === null)) return a.enquiryId === null ? 1 : -1
    return b.releasedAt.localeCompare(a.releasedAt)
  })
}

function released(row: QuotationRow): string {
  return row.released_at ?? ''
}

/** Newest revision first; without a revision number, the newest release. */
function byRevision(a: QuotationRow, b: QuotationRow): number {
  const ra = a.costing?.revision_no
  const rb = b.costing?.revision_no
  if (ra != null && rb != null && ra !== rb) return rb - ra
  return released(b).localeCompare(released(a))
}
