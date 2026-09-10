import { Fragment } from 'react'
import { money } from '../../lib/format'
import type {
  AssemblyTotals,
  CostingAssembly,
  CostingItem,
  CostingLabour,
  PanelPrice,
} from '../../lib/database.types'
import { AssemblyLine } from './AssemblyLine'
import { groupBySection } from './sections'

/**
 * What a panel is made of, read section by section: incomer, outgoers, APFC
 * bank, the way the costing sheets have always been written. Each section
 * carries its own subtotal; a panel whose lines are in no section at all reads
 * exactly as it did before, with no headings.
 */
export function PanelLines({
  assemblies,
  items,
  labour,
  assemblyTotals,
  sections,
  price,
  kvar,
  label,
  editable,
  processNames,
  handlers,
}: {
  assemblies: CostingAssembly[]
  items: CostingItem[]
  labour: CostingLabour[]
  assemblyTotals: AssemblyTotals[]
  sections: string[]
  price: PanelPrice | undefined
  kvar: number | null
  label: string
  editable: boolean
  processNames: Record<string, string>
  handlers: {
    onAssemblyQuantity: (id: string, quantity: number) => void
    onAssemblyRemove: (id: string) => void
    onAssemblySection: (id: string, section: string | null) => void
    onItemQuantity: (id: string, quantity: number) => void
    onItemRemove: (id: string) => void
    onHours: (id: string, hours: number) => void
  }
}) {
  const totalsById = new Map(assemblyTotals.map((t) => [t.costing_assembly_id, t]))
  const groups = groupBySection(assemblies, assemblyTotals, sections)
  // Nothing to head when the whole panel is in one unnamed heap, which is how
  // every costing built before sections looks.
  const showHeadings = groups.length > 1 || (groups[0]?.section ?? null) !== null

  return (
    <div className="table-wrap" style={{ marginTop: '.75rem' }}>
      <table>
        <thead>
          <tr>
            <th>Kit</th>
            <th className="right">Qty</th>
            <th className="right">Material each</th>
            <th className="right">Labour each</th>
            <th className="right">Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {assemblies.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">Nothing yet — add a kit or a component below.</td>
            </tr>
          )}
          {groups.map((group) => (
            <Fragment key={group.heading}>
              {showHeadings && (
                <tr style={{ background: 'var(--page)' }}>
                  <th colSpan={2}>{group.heading}</th>
                  <th className="right">{money(group.material, label)}</th>
                  <th className="right">{money(group.labour, label)}</th>
                  <th className="right">{money(group.material + group.labour, label)}</th>
                  <th></th>
                </tr>
              )}
              {group.lines.map((a) => (
                <AssemblyLine
                  key={a.id}
                  line={a}
                  items={items.filter((i) => i.costing_assembly_id === a.id)}
                  labour={labour.filter((l) => l.costing_assembly_id === a.id)}
                  totals={totalsById.get(a.id)}
                  label={label}
                  editable={editable}
                  processNames={processNames}
                  sections={sections}
                  onQuantity={handlers.onAssemblyQuantity}
                  onRemove={handlers.onAssemblyRemove}
                  onSection={handlers.onAssemblySection}
                  onItemQuantity={handlers.onItemQuantity}
                  onItemRemove={handlers.onItemRemove}
                  onHours={handlers.onHours}
                />
              ))}
            </Fragment>
          ))}
        </tbody>
        {price && (
          <tfoot>
            {kvar != null && (
              <tr>
                <td colSpan={6} className="muted">APFC bank: {kvar} kVAr in steps (the kits above, rating × quantity)</td>
              </tr>
            )}
            <tr>
              <th colSpan={2}>Cost of one panel</th>
              <th className="right">{money(price.material_cost, label)}</th>
              <th className="right">{money(price.labour_cost, label)}</th>
              <th className="right">{money(price.material_cost + price.labour_cost, label)}</th>
              <th></th>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
