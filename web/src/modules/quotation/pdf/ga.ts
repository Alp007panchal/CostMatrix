import type { LayoutSection } from '../../../lib/database.types'
import type { CostingDetail } from '../../costing/api'
import type { PdfGaDevice, PdfGaSection, PdfGaSheet } from './types'

/**
 * The general-arrangement sheet, worked out (roadmap 3.8, spec §5).
 *
 * Pure, like everything else in `prepare`: what the sheet says is decided and
 * tested here, and `GaSheet.tsx` only draws it. The tags — Q1, Q2 … — are
 * numbered here **once** and used both on the drawing and in the technical
 * offer, so the two cannot disagree; that is the spec's test.
 *
 * A panel with no saved layout gets **no sheet**. The quotation says nothing
 * about a board nobody has drawn rather than printing a guessed one.
 */

/** One panel's saved layout, as the release page reads it. */
export interface SavedPanelLayout {
  panel_id: string
  sections: LayoutSection[]
  construction_code: string | null
  version: number
}

export function buildGaSheets(detail: CostingDetail, layouts: SavedPanelLayout[]): PdfGaSheet[] {
  const byPanel = new Map(layouts.map((l) => [l.panel_id, l]))
  const sheets: PdfGaSheet[] = []

  for (const panel of detail.panels) {
    const saved = byPanel.get(panel.id)
    if (saved === undefined || saved.sections.length === 0) continue

    let tag = 0
    const sections: PdfGaSection[] = saved.sections.map((section) => {
      const faces = section.faces ?? []
      const devices: PdfGaDevice[] = []
      let y = 0
      for (const face of faces) {
        for (const placement of face.placements) {
          tag += 1
          const height = placement.height_mm ?? 0
          devices.push({
            tag: `Q${tag}`,
            label: placement.name.toUpperCase(),
            costingAssemblyId: placement.costing_assembly_id,
            face: face.side,
            heightMm: height,
            yMm: placement.y_mm ?? y,
            quantity: Math.max(Math.round(placement.quantity ?? 1), 1),
            unsized: placement.unsized,
          })
          y = (placement.y_mm ?? y) + height
        }
        y = 0
      }
      return {
        name: section.name,
        widthMm: section.width_mm,
        depthMm: section.depth_mm ?? null,
        design: String(section.design),
        designWords: sectionWords(section),
        busbarCompartmentMm: section.busbar_compartment_mm ?? 0,
        form: section.form ?? null,
        doubleFront: (section.access ?? 'single_front') === 'double_front',
        devices,
      }
    })

    const widthMm = sections.reduce((total, s) => total + s.widthMm, 0)
    const depthMm = sections.reduce((deepest, s) => Math.max(deepest, s.depthMm ?? 0), 0)

    sheets.push({
      panelId: panel.id,
      panelName: panel.name.toUpperCase(),
      optionLabel: panel.option_label?.trim() ?? null,
      construction: saved.construction_code ?? 'S4',
      version: saved.version,
      widthMm,
      heightMm: 2000,
      baseMm: 100,
      depthMm: depthMm > 0 ? depthMm : null,
      sections,
      specLine: specLine(sections, panel.enclosure_dimensions),
      // Any rear face at all means the board has a back elevation worth a sheet
      // of its own; until that sheet exists the front one says the board is
      // double-front rather than quietly drawing half of it.
      hasRearFace: sections.some((s) => s.doubleFront),
    })
  }
  return sheets
}

/** "Q1 ACB 1600 A · Q2 …" — the line the technical offer carries, so the tags match. */
export function gaTagLine(sheet: PdfGaSheet): string {
  const tags = sheet.sections.flatMap((s) => s.devices.map((d) => `${d.tag} ${titleCase(d.label)}`))
  if (tags.length === 0) return ''
  return `Device tags (see Annexure V): ${tags.join(' · ')}`
}

/** What a section is, in the words the drawing prints under its name. */
function sectionWords(section: LayoutSection): string {
  const design = String(section.design)
  const base =
    design === 'busbar_fed' ? 'INCOMER / BUSBAR-FED'
    : design === 'mccb_plates' ? 'OUTGOING FEEDERS'
    : design === 'side_by_side_plates' ? 'CONTROLS / MODULAR'
    : design === 'compensation' ? 'POWER FACTOR CORRECTION'
    : design === 'meter_board_plate' ? 'METER PLATES'
    : design === 'inline_3nj6' ? 'IN-LINE FUSE SWITCHES'
    : 'SECTION'
  return (section.access ?? 'single_front') === 'double_front' ? `${base} · DOUBLE-FRONT` : base
}

/**
 * The line along the foot of the sheet. Everything in it comes from the drawing
 * or from the panel's own enclosure note — a board whose form nobody has chosen
 * says nothing about its form rather than claiming one.
 */
function specLine(sections: PdfGaSection[], enclosure: string | null): string {
  const forms = [...new Set(sections.map((s) => s.form).filter((f): f is string => f !== null))]
  const access = sections.some((s) => s.doubleFront) ? 'FRONT AND REAR ACCESS' : 'FRONT ACCESS'
  const parts = [
    forms.length === 1 ? `FORM ${forms[0]?.toUpperCase()}` : forms.length > 1 ? `FORMS ${forms.join('/').toUpperCase()}` : null,
    access,
    enclosure?.trim() ? enclosure.trim().toUpperCase() : null,
    'IEC 61439-1 & 2',
  ]
  return parts.filter((part): part is string => part !== null && part !== '').join(' · ')
}

function titleCase(text: string): string {
  return text.charAt(0) + text.slice(1).toLowerCase()
}
