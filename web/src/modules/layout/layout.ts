import type {
  LayoutFit,
  LayoutKit,
  LayoutPlacement,
  LayoutSection,
  MountingDesign,
} from '../../lib/database.types'

/**
 * The panel layout, screen side (roadmap 3.8, stage one).
 *
 * The arithmetic that decides anything lives in the database — `arrange_panel`,
 * `section_capacity`, `layout_fit` — so the canvas can never show a figure the
 * costing would not be given. What is here is the drawing: millimetres to the
 * units the SVG is drawn in, where each section and each cover sits, and the two
 * refusals a drag can meet before the server is asked.
 */

/** The mockups are drawn at 1 : 4, so one millimetre is a quarter of a unit. */
export const SCALE = 0.25

/**
 * Drawing constants, not pricing ones: the chamber the horizontal busbar runs in
 * and the base a board stands on. They set where the compartment starts on the
 * page; what fits inside it is the database's answer, not this file's.
 */
export const BUSBAR_CHAMBER_MM = 280
export const BASE_MM = 100

export function mm(value: number): number {
  return Math.round(value * SCALE * 100) / 100
}

/** Where each section sits across the board, left to right, in millimetres. */
export function sectionRuns(sections: LayoutSection[]): { section: LayoutSection; x: number }[] {
  let x = 0
  return sections.map((section) => {
    const at = { section, x }
    x += section.width_mm
    return at
  })
}

export function boardWidthMm(sections: LayoutSection[]): number {
  return sections.reduce((total, section) => total + section.width_mm, 0)
}

export function boardHeightMm(heightMm = 2000): number {
  return heightMm + BASE_MM
}

/** The placements on a section's front face; a section always has one. */
export function frontFace(section: LayoutSection): LayoutPlacement[] {
  return section.faces?.[0]?.placements ?? []
}

/**
 * Where a cover sits down the device compartment. The arrangement gives each
 * placement its `y_mm`; one typed in by hand without it follows the one above.
 */
export function stackedCovers(
  section: LayoutSection,
): { placement: LayoutPlacement; y: number; height: number }[] {
  let y = 0
  return frontFace(section).map((placement) => {
    const height = placement.height_mm ?? 0
    const at = { placement, y: placement.y_mm ?? y, height }
    y = at.y + height
    return at
  })
}

/** How much of a section is used, in the unit its design counts in. */
export function usedBy(section: LayoutSection): number {
  return frontFace(section).reduce(
    (total, placement) => total + (placement.height_mm ?? 0) * Math.max(placement.quantity ?? 1, 1),
    0,
  )
}

/**
 * Whether a kit may be dropped on a section, and why not when it may not. Two
 * refusals, both the spec's (§4): a design a section is not built for, and a
 * section with no room left. Everything else the server decides.
 */
export function dropRefusal(
  section: LayoutSection,
  kit: LayoutKit,
  fit: LayoutFit | null,
): string | null {
  if (kit.mounting_design === null) {
    return `${kit.name} has no mounting design yet, so nothing knows how it is built in. Give it one on the kit.`
  }
  if (section.design !== kit.mounting_design) {
    return `${section.name} is a ${designWords(section.design)} section; ${kit.name} is ${designWords(
      kit.mounting_design,
    )}.`
  }
  const row = fit?.sections.find((s) => s.name === section.name)
  if (row && row.capacity !== null && kit.module_height_mm !== null) {
    const left = row.capacity - row.used
    if (kit.module_height_mm > left) {
      return `${section.name} has ${round(left)} mm of compartment left and ${kit.name} needs ${
        kit.module_height_mm
      } mm. Start another section, or use a wider one.`
    }
  }
  return null
}

/** Adds a kit to a section's front face. The caller has already asked for a refusal. */
export function placeKit(
  sections: LayoutSection[],
  sectionName: string,
  kit: LayoutKit,
): LayoutSection[] {
  return sections.map((section) => {
    if (section.name !== sectionName) return section
    const placements = frontFace(section)
    const face = section.faces[0]
    if (!face) return section
    return {
      ...section,
      faces: [
        {
          ...face,
          placements: [
            ...placements,
            {
              costing_assembly_id: kit.costing_assembly_id,
              face: 'front',
              name: kit.name,
              slot: placements.length,
              height_mm: kit.module_height_mm,
              unsized: !kit.is_sized,
            },
          ],
        },
        ...section.faces.slice(1),
      ],
    }
  })
}

/** Takes one placement off a section, by the slot the canvas drew it at. */
export function removePlacement(
  sections: LayoutSection[],
  sectionName: string,
  index: number,
): LayoutSection[] {
  return sections.map((section) => {
    const face = section.faces[0]
    if (section.name !== sectionName || !face) return section
    return {
      ...section,
      faces: [
        { ...face, placements: face.placements.filter((_, at) => at !== index) },
        ...section.faces.slice(1),
      ],
    }
  })
}

/** How many of each kit are placed, so the list can say "3 of 4 placed". */
export function placedCounts(sections: LayoutSection[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const section of sections) {
    for (const placement of frontFace(section)) {
      const id = placement.costing_assembly_id
      counts[id] = (counts[id] ?? 0) + Math.max(placement.quantity ?? 1, 1)
    }
  }
  return counts
}

/** A verdict in the words a person would use. */
export function verdictWords(verdict: string): string {
  switch (verdict) {
    case 'fits':
      return 'Fits'
    case 'tight':
      return 'Fits, tight'
    case 'no_fit':
      return 'Will not fit'
    case 'empty':
      return 'Nothing on it yet'
    default:
      return 'Unknown — something on it has never been measured'
  }
}

/** The mounting designs in the owner's words, for a sentence rather than a code. */
export function designWords(design: MountingDesign | string | null): string {
  switch (design) {
    case 'busbar_fed':
      return 'busbar-fed'
    case 'mccb_plates':
      return 'MCCB cover'
    case 'side_by_side_plates':
      return 'side-by-side plate'
    case 'compensation':
      return 'correction'
    case 'meter_board_plate':
      return 'meter board plate'
    case 'inline_3nj6':
      return 'in-line 3NJ6'
    default:
      return 'undescribed'
  }
}

/** Which symbol of the owner's drawing set stands for a kit of this design. */
export function symbolFor(design: MountingDesign | string | null): string {
  switch (design) {
    case 'busbar_fed':
      return 'acb'
    case 'mccb_plates':
      return 'mccb'
    case 'compensation':
      return 'cap'
    case 'meter_board_plate':
      return 'mfm'
    default:
      return 'mcb'
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
