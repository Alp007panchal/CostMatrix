import type { CostingAssembly, CostingItem, CostingPanel, Kit } from '../../lib/database.types'

/**
 * A first draft of a panel's technical description (Annexure IV of the
 * quotation), written from what is actually in the panel: its kits, grouped
 * by kit group, each with its lines; then the loose components; then the
 * enclosure. The engineer edits the result. Pure, so it is unit-tested.
 */

export interface DescribeInput {
  panel: CostingPanel
  assemblies: CostingAssembly[]     // this panel's lines (kits and the free holder)
  items: CostingItem[]              // every item of the costing; filtered here
  kits?: Kit[]                      // library kits, for group names and main devices
}

const ENCLOSURE = 'enclosure_parts'

export function describePanel({ panel, assemblies, items, kits = [] }: DescribeInput): string {
  const kitById = new Map(kits.map((k) => [k.id, k]))
  const mine = assemblies.filter((a) => a.panel_id === panel.id)
  const kitLines = mine.filter((a) => a.kind !== 'free').sort((a, b) => a.sort_order - b.sort_order)
  const free = mine.find((a) => a.kind === 'free')

  // Kits, grouped by kit group in order of first appearance.
  const sections = new Map<string, string[]>()
  for (const line of kitLines) {
    const kit = line.source_assembly_id ? kitById.get(line.source_assembly_id) : undefined
    const heading = (kit?.group_name ?? 'KITS').toUpperCase()
    const block = [`${count(line.quantity)} ${line.name}${kit?.poles ? `, ${kit.poles}P` : ''}`]
    for (const i of items.filter((x) => x.costing_assembly_id === line.id).sort((a, b) => a.sort_order - b.sort_order)) {
      block.push(`   - ${itemText(i)}`)
    }
    sections.set(heading, [...(sections.get(heading) ?? []), ...block])
  }

  const freeItems = free ? items.filter((i) => i.costing_assembly_id === free.id).sort((a, b) => a.sort_order - b.sort_order) : []
  const loose = freeItems.filter((i) => i.category_code !== ENCLOSURE)
  const enclosure = freeItems.filter((i) => i.category_code === ENCLOSURE)
  if (loose.length) sections.set('OTHER COMPONENTS', loose.map((i) => `${itemText(i)}`))
  if (enclosure.length) sections.set('ENCLOSURE', enclosure.map((i) => `${itemText(i)}`))

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
