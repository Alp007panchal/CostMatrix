import type { CostingAssembly, CostingItem, CostingPanel, Kit } from '../../lib/database.types'

/**
 * Busbar never appears: Annexure IV describes what is being offered, and the
 * copper inside the board is not part of that.
 *
 * A first draft of a panel's technical description (Annexure IV of the
 * quotation), written from what is actually in the panel: each line under the
 * section it was built into — incomer, outgoers, APFC bank — with a kit's own
 * lines indented beneath it. A line with no section falls back to its kit
 * group, and loose parts with no section to "other components" and the
 * enclosure, exactly as before sections existed.
 * The engineer edits the result. Pure, so it is unit-tested.
 */

export interface DescribeInput {
  panel: CostingPanel
  assemblies: CostingAssembly[]     // this panel's lines (kits and the loose-parts holders)
  items: CostingItem[]              // every item of the costing; filtered here
  kits?: Kit[]                      // library kits, for group names and main devices
}

const ENCLOSURE = 'enclosure_parts'
// Busbar is how a board is built, not what the customer is choosing between,
// and printing its sizes and metres in the technical offer tells a competitor
// how the board is made. Cable is filed under accessories and still prints,
// which is what the owner asked for.
const BUSBAR = 'busbar'

export function describePanel({ panel, assemblies, items, kits = [] }: DescribeInput): string {
  const kitById = new Map(kits.map((k) => [k.id, k]))
  const mine = assemblies
    .filter((a) => a.panel_id === panel.id)
    .sort((a, b) => a.sort_order - b.sort_order)

  // One block per heading, in the order the panel uses them. A line's own
  // section is the heading when it has one — that is how the panel was built,
  // and how the customer reads it; a kit with no section falls back to its kit
  // group, as it did before sections existed.
  const sections = new Map<string, string[]>()
  const add = (heading: string, lines: string[]) =>
    sections.set(heading, [...(sections.get(heading) ?? []), ...lines])

  for (const line of mine) {
    const section = (line.section ?? '').trim()
    const lineItems = items
      .filter((x) => x.costing_assembly_id === line.id && x.category_code !== BUSBAR)
      .sort((a, b) => a.sort_order - b.sort_order)

    if (line.kind !== 'free') {
      const kit = line.source_assembly_id ? kitById.get(line.source_assembly_id) : undefined
      const heading = (section || kit?.group_name || 'KITS').toUpperCase()
      add(heading, [
        `${count(line.quantity)} ${line.name}${kit?.poles ? `, ${kit.poles}P` : ''}`,
        ...lineItems.map((i) => `   - ${itemText(i)}`),
      ])
      continue
    }

    // Loose parts: under their section when they have one, else split the old
    // way into other components and the enclosure.
    if (section) {
      if (lineItems.length) add(section.toUpperCase(), lineItems.map((i) => itemText(i)))
      continue
    }
    const loose = lineItems.filter((i) => i.category_code !== ENCLOSURE)
    const enclosure = lineItems.filter((i) => i.category_code === ENCLOSURE)
    if (loose.length) add('OTHER COMPONENTS', loose.map((i) => itemText(i)))
    if (enclosure.length) add('ENCLOSURE', enclosure.map((i) => itemText(i)))
  }

  const out: string[] = []
  for (const [heading, lines] of sections) {
    out.push(heading, ...lines, '')
  }
  return out.join('\n').trim()
}

/** "2 No. 800A 4P ACB, SIEMENS (3WJ1108-2AE12-4DD0)" or "6.5 m Busbar 60X10MM". */
function itemText(i: CostingItem): string {
  const who = [i.manufacturer, i.part_number && i.part_number !== i.code ? `(${i.part_number})` : null]
    .filter(Boolean)
    .join(' ')
  return `${count(i.quantity, i.unit)} ${i.name}${who ? `, ${who}` : ''}`
}

function count(qty: number, unit = 'pcs'): string {
  const n = Number.isInteger(qty) ? String(qty) : String(Number(qty.toFixed(3)))
  return unit === 'pcs' || unit === 'PC' || unit === 'set' ? `${n} No.` : `${n} ${unit}`
}
