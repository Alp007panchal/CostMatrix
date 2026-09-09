import type { CostingAssembly, Kit } from '../../lib/database.types'

/**
 * Total reactive power of the APFC step kits on a panel (decision 4): the sum of
 * rating × quantity over the panel's kits whose rating is in kVAr. Null when the
 * panel has none, so the card can stay quiet.
 */
export function kvarTotal(assemblies: CostingAssembly[], kits: Kit[]): number | null {
  const byId = new Map(kits.map((k) => [k.id, k]))
  let total = 0
  let found = false
  for (const a of assemblies) {
    if (a.kind !== 'kit' || !a.source_assembly_id) continue
    const kit = byId.get(a.source_assembly_id)
    if (!kit || kit.rating_unit !== 'KVAR' || kit.rating == null) continue
    total += Number(kit.rating) * Number(a.quantity)
    found = true
  }
  return found ? total : null
}
