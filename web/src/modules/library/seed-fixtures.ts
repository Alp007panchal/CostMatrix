import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from '../../lib/csv'
import type {
  Assembly,
  AssemblyComponentRow,
  ComponentCategory,
  ComponentPrice,
  KitGroup,
} from '../../lib/database.types'

/**
 * The owner's seed files (data/seed) shaped the way the database hands them to
 * the screens after an import: v_component_prices rows, kits, kit groups and
 * kit lines. Test support only — it reads from disk. The point is realism of
 * the awkward rows (parts without a price, busbar priced by weight), not of
 * every figure, so the arithmetic mirrors migrations 0008 and 0010 in outline.
 */

const LANDED_FACTOR_EUR = 200
const COPPER_EUR_PER_KG = 15
const COPPER_KES_PER_KG = COPPER_EUR_PER_KG * LANDED_FACTOR_EUR

const BOM_CODES: Record<string, string> = {
  SWITCHGEAR: 'switchgear',
  BUSBAR: 'busbar',
  'ACCESSORIES & HARDWARE': 'accessories_hardware',
  'FABRICATED ENCLOSURE PARTS': 'enclosure_parts',
}
const CATEGORY_NAMES: Record<string, string> = {
  switchgear: 'Switchgear',
  busbar: 'Busbar',
  accessories_hardware: 'Accessories & hardware',
  enclosure_parts: 'Enclosure parts',
}

export interface SeedFixtures {
  components: ComponentPrice[]
  categories: ComponentCategory[]
  assemblies: Assembly[]
  groups: KitGroup[]
  /** The lines of one kit, as listAssemblyComponents would return them. */
  linesFor: (assemblyId: string) => AssemblyComponentRow[]
  /** A kit built on a part that has no price yet. */
  placeholderKit: Assembly
}

// Resolved by hand (not `new URL(..., import.meta.url)`) so Vite does not
// mistake the seed folder for a bundle of assets.
const seedDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../data/seed')

function readSeed(name: string): Record<string, string>[] {
  return parseCsv(readFileSync(resolve(seedDir, name), 'utf8')).rows
}

/** Same rule as app.kit_code in migration 0010. */
export function kitCode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Same rule as app.parse_kit_name in migration 0010. */
export function parseKitName(name: string): Pick<Assembly, 'rating' | 'rating_unit' | 'poles'> {
  const rating = /(\d+(?:\.\d+)?)\s*(KVAR|A)\b/i.exec(name)
  const poles = /\b(SP|DP|TP|FP|[1-4]P)\b/i.exec(name)
  const poleMap: Record<string, number> = { SP: 1, '1P': 1, DP: 2, '2P': 2, TP: 3, '3P': 3, FP: 4, '4P': 4 }
  return {
    rating: rating ? Number(rating[1]) : null,
    rating_unit: rating ? (rating[2]!.toUpperCase() as 'A' | 'KVAR') : null,
    poles: poles ? (poleMap[poles[1]!.toUpperCase()] ?? null) : null,
  }
}

function bomCategory(category: string, notes: string, map: Map<string, string>): string {
  const note = /BOM category:\s*([A-Za-z &]+?)(?:\s*\(|$)/.exec(notes)
  const fromNote = note ? BOM_CODES[note[1]!.trim().toUpperCase()] : undefined
  return fromNote ?? map.get(category.toUpperCase()) ?? 'switchgear'
}

let cached: SeedFixtures | null = null

export function seedFixtures(): SeedFixtures {
  if (cached) return cached

  const catMap = new Map(
    readSeed('category-map.csv').map((r) => [r['category']!.toUpperCase(), BOM_CODES[r['bomCategory']!.toUpperCase()] ?? 'switchgear']),
  )

  const components: ComponentPrice[] = readSeed('components.csv').map((r, i): ComponentPrice => {
    const category = r['category'] ?? ''
    const priceText = (r['priceEur'] ?? '').trim()
    const price = priceText === '' ? null : Number(priceText)
    const isBusbar = category.toUpperCase() === 'BUSBAR'
    const isCable = category.toUpperCase() === 'CABLE'
    const weight = isBusbar && price != null ? Math.round((price / COPPER_EUR_PER_KG) * 1000) / 1000 : null
    const unitPrice = isBusbar
      ? weight == null ? null : Math.round(weight * COPPER_KES_PER_KG * 100) / 100
      : price == null ? null : Math.round(price * LANDED_FACTOR_EUR * 100) / 100
    const categoryCode = bomCategory(category, r['notes'] ?? '', catMap)
    return {
      id: `c-${i + 1}`,
      company_id: null,
      category_code: categoryCode,
      category_name: CATEGORY_NAMES[categoryCode] ?? categoryCode,
      code: r['partNumber'] ?? '',
      name: r['description'] ?? '',
      description: (r['notes'] ?? '') || null,
      unit: isBusbar || isCable ? 'm' : (r['unit'] ?? '') || 'pcs',
      manufacturer: (r['brand'] ?? '') || null,
      part_number: null,
      // added by migration 0100 (foundations F1): every one optional, and the
      // owner's seed fills none of them.
      supplier: null,
      attributes: {},
      replaced_by: null,
      datasheet_url: null,
      lead_time_days: null,
      price_valid_from: null,
      price_source: null,
      // Foundations F12: nothing in the seed is measured yet.
      width_mm: null,
      height_mm: null,
      depth_mm: null,
      mounting_type: null,
      clearances: {},
      weight_kg: null,
      enclosure_layout: {},
      status: price == null && !isBusbar ? 'placeholder' : 'active',
      pricing_mode: isBusbar ? 'weight_rate' : 'fixed',
      purchase_currency: isBusbar ? 'KES' : (r['purchaseCurrency'] ?? '') || 'EUR',
      weight_per_unit: weight,
      material_rate_code: isBusbar ? 'copper_busbar' : null,
      is_enclosure_cubicle: category.toUpperCase() === 'ENCLOSURE',
      is_placeholder: !isBusbar && price == null,
      rating: (r['rating'] ?? '') || null,
      poles: (r['poles'] ?? '') || null,
      is_active: true,
      raw_price: isBusbar ? null : price,
      unit_price: unitPrice,
      currency_code: 'KES',
      currency_label: 'KES',
      source: 'master',
      landed_factor: isBusbar ? 1 : LANDED_FACTOR_EUR,
      landed_price_kes: isBusbar || price == null ? null : Math.round(price * LANDED_FACTOR_EUR * 100) / 100,
    }
  })
  const componentByCode = new Map(components.map((c) => [c.code.toUpperCase(), c]))

  const categories: ComponentCategory[] = Object.entries(CATEGORY_NAMES).map(([code, name], i) => ({
    code,
    name,
    sort_order: i + 1,
  }))

  const template = new Map(
    readSeed('kit-labour-template.csv').map((r) => [r['kitName']!, { group: r['labourGroup']!, main: r['mainPart']! }]),
  )
  const groups: KitGroup[] = []
  const groupIdByName = new Map<string, string>()
  const groupIdFor = (name: string): string => {
    const existing = groupIdByName.get(name)
    if (existing) return existing
    const id = `g-${groups.length + 1}`
    groups.push({ id, company_id: null, name, description: null, sort_order: groups.length + 1 })
    groupIdByName.set(name, id)
    return id
  }

  const kitRows = readSeed('kits.csv')
  const assemblies: Assembly[] = []
  const assemblyByName = new Map<string, Assembly>()
  const linesByAssembly = new Map<string, AssemblyComponentRow[]>()
  for (const row of kitRows) {
    const name = row['kitName']!
    let kit = assemblyByName.get(name)
    if (!kit) {
      const tpl = template.get(name)
      kit = {
        id: `k-${assemblies.length + 1}`,
        company_id: null,
        code: kitCode(name),
        name,
        description: null,
        kit_group_id: groupIdFor(tpl?.group ?? row['kitGroup'] ?? 'Other'),
        is_active: true,
        // added by migration 0100 (foundations F2)
        version: 1,
        customer_wording: null,
        tags: [],
        compatibility_rules: {},
        status: 'active',
        // added by migration 0106 (foundations F12): no kit overrides its
        // footprint until somebody measures one.
        footprint_w_mm: null,
        footprint_h_mm: null,
        footprint_d_mm: null,
        ...parseKitName(name),
      }
      assemblies.push(kit)
      assemblyByName.set(name, kit)
      linesByAssembly.set(kit.id, [])
    }
    const part = componentByCode.get((row['partNumber'] ?? '').toUpperCase())
    if (!part) continue
    const lines = linesByAssembly.get(kit.id)!
    lines.push({
      id: `${kit.id}-l${lines.length + 1}`,
      assembly_id: kit.id,
      component_id: part.id,
      quantity: Number(row['quantity'] ?? '1'),
      is_main_device: (template.get(name)?.main ?? '').toUpperCase() === part.code.toUpperCase(),
      sort_order: lines.length + 1,
    })
  }

  const unpriced = new Set(components.filter((c) => c.unit_price == null).map((c) => c.id))
  const placeholderKit = assemblies.find((a) =>
    (linesByAssembly.get(a.id) ?? []).some((l) => unpriced.has(l.component_id)),
  )
  if (!placeholderKit) throw new Error('the seed no longer holds a kit built on an unpriced part')

  cached = {
    components,
    categories,
    assemblies,
    groups,
    linesFor: (assemblyId) => linesByAssembly.get(assemblyId) ?? [],
    placeholderKit,
  }
  return cached
}
