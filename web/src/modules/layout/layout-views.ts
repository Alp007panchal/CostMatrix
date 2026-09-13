import type {
  CableAlley,
  LayoutDoorDevice,
  LayoutFace,
  LayoutSection,
  LayoutWeight,
} from '../../lib/database.types'
import { SCALE, frontFace } from './layout'

/**
 * The other four views of the board (roadmap 3.8, stage two).
 *
 * Geometry only. Nothing here decides whether anything fits — `layout_fit` in the
 * database does that, and the plan view simply draws the arrangement the verdict
 * was reached on. Every figure is in millimetres until a component scales it, so
 * these helpers can be tested against the mockups' own numbers.
 */

/** What a plan view needs to draw one section, looking down on it. */
export interface PlanZones {
  widthMm: number
  depthMm: number
  /** The dropper and earth-bar zone along the back wall. */
  dropperMm: number
  /** The vertical busbar chamber, and which side of the section it is on. */
  busbarMm: number
  busbarSide: 'left' | 'right'
  /** The mounting plate: how wide, and how far in from the door. */
  plateWidthMm: number
  plateFromDoorMm: number
  /** The cable alley, and whether it takes width or depth. */
  alley: CableAlley
  alleyMm: number
  doorSwingMm: number
}

/** The measurements the plan view draws with, all of them company settings. */
export interface PlanSettings {
  verticalBusbarMm: number
  cableAlleyMm: number
  alleyBehindMm: number
  rearDropperMm: number
  doorSwingMm: number
}

export const PLAN_DEFAULTS: PlanSettings = {
  verticalBusbarMm: 150,
  cableAlleyMm: 200,
  alleyBehindMm: 250,
  rearDropperMm: 100,
  doorSwingMm: 100,
}

/**
 * Looking down on one section. The plate is what is left once the busbar has its
 * chamber and — when the alley is beside the plates — the cables theirs; with the
 * alley behind, the plate runs the full width and the alley takes depth instead.
 * These are the mockup's two arrangements, and the same rule `section_capacity`
 * applies, so the drawing and the verdict cannot disagree.
 */
export function planZones(
  section: LayoutSection,
  settings: PlanSettings = PLAN_DEFAULTS,
): PlanZones {
  const alley: CableAlley = section.cable_alley ?? 'beside'
  const busbarMm = Math.max(section.busbar_compartment_mm ?? 0, settings.verticalBusbarMm)
  const alleyMm = alley === 'behind' ? settings.alleyBehindMm : settings.cableAlleyMm
  const plateWidthMm = Math.max(
    section.width_mm - busbarMm - (alley === 'beside' ? alleyMm : 0),
    0,
  )
  return {
    widthMm: section.width_mm,
    depthMm: section.depth_mm ?? 800,
    dropperMm: settings.rearDropperMm,
    busbarMm,
    busbarSide: section.busbar_side ?? 'left',
    plateWidthMm,
    plateFromDoorMm: alley === 'behind' ? settings.doorSwingMm : settings.cableAlleyMm,
    alley,
    alleyMm,
    doorSwingMm: settings.doorSwingMm,
  }
}

/**
 * The sections as a person standing behind the board sees them: the same widths,
 * right to left. The mockup's own caption — "sections mirrored (F at left)".
 */
export function rearRuns(sections: LayoutSection[]): { section: LayoutSection; x: number }[] {
  let x = 0
  return [...sections].reverse().map((section) => {
    const at = { section, x }
    x += section.width_mm
    return at
  })
}

/** The face a view is drawing: the rear one where there is one, else the front. */
export function faceOn(section: LayoutSection, side: 'front' | 'rear'): LayoutFace | null {
  return section.faces?.find((f) => f.side === side) ?? null
}

/** The placements on a given side; a single-front section has nothing at the rear. */
export function placementsOn(section: LayoutSection, side: 'front' | 'rear') {
  return side === 'front' ? frontFace(section) : (faceOn(section, 'rear')?.placements ?? [])
}

export function isDoubleFront(section: LayoutSection): boolean {
  return section.access === 'double_front' && (section.faces?.length ?? 0) > 1
}

/**
 * What is behind a section, in the words the mockup uses. A rear-connection
 * section shows its cable lugs; a front-connection one shows only the shrouded
 * backs of its terminals, because the cables leave at the front.
 */
export function rearWords(section: LayoutSection): string {
  if (isDoubleFront(section)) {
    return 'face B · a device compartment of its own'
  }
  const connection = frontFaceConnection(section)
  return connection === 'rear'
    ? 'rear connection · cable lugs · outgoing cables behind the plates'
    : 'front connection · terminals shrouded · cables to the cable space'
}

function frontFaceConnection(section: LayoutSection): 'front' | 'rear' {
  return section.faces?.[0]?.connection ?? 'front'
}

/** The isometric offset for a depth, at the mockup's own foreshortening. */
export function isoOffset(depthMm: number): { dx: number; dy: number } {
  const d = depthMm * SCALE
  return { dx: Math.round(d * 0.55 * 100) / 100, dy: Math.round(d * 0.32 * 100) / 100 }
}

/**
 * Door devices laid out across a door, left to right and wrapping down, at their
 * real sizes. A part with no size on record is given none and reported separately,
 * never drawn at a guessed size.
 */
export function doorRows(
  devices: LayoutDoorDevice[],
  widthMm: number,
  gapMm = 40,
): { device: LayoutDoorDevice; x: number; y: number; w: number; h: number }[] {
  const out: { device: LayoutDoorDevice; x: number; y: number; w: number; h: number }[] = []
  let x = gapMm
  let y = gapMm
  let rowHeight = 0
  for (const device of devices) {
    if (device.width_mm === null || device.height_mm === null) continue
    for (let n = 0; n < Math.max(Math.round(device.quantity), 1); n += 1) {
      if (x + device.width_mm > widthMm - gapMm && rowHeight > 0) {
        x = gapMm
        y += rowHeight + gapMm
        rowHeight = 0
      }
      out.push({ device, x, y, w: device.width_mm, h: device.height_mm })
      x += device.width_mm + gapMm
      rowHeight = Math.max(rowHeight, device.height_mm)
    }
  }
  return out
}

/** Door parts the library has not measured, so the view can name them. */
export function doorUnmeasured(devices: LayoutDoorDevice[]): LayoutDoorDevice[] {
  return devices.filter((d) => d.width_mm === null || d.height_mm === null)
}

/** The board's weight as an estimate, saying plainly when it is incomplete. */
export function weightWords(weight: LayoutWeight | null): string {
  if (weight === null || weight.weight_kg === null) return 'no weights on record'
  const kg = Math.round(weight.weight_kg)
  if (weight.without_weight > 0) {
    return `≈ ${kg.toLocaleString()} kg, less ${weight.without_weight} part(s) with no weight`
  }
  return `≈ ${kg.toLocaleString()} kg`
}

/** The layers a person can turn off, in the order the mockup lists them. */
export const LAYERS = ['Doors', 'Covers', 'Busbars', 'Cables', 'Tags', 'Dimensions'] as const
export type Layer = (typeof LAYERS)[number]

/** A device tag — Q1, Q2 … — matching the technical offer's bullets (spec §5). */
export function deviceTags(sections: LayoutSection[]): Record<string, string> {
  const tags: Record<string, string> = {}
  let n = 0
  for (const section of sections) {
    for (const face of section.faces ?? []) {
      for (const placement of face.placements) {
        const key = `${section.name}/${face.side}/${placement.slot}`
        n += 1
        tags[key] = `Q${n}`
      }
    }
  }
  return tags
}

/**
 * Changes one setting on one section. Turning two faces on adds the back
 * compartment; turning it off takes it away — and says how many placements would
 * go with it, so the caller can refuse rather than silently lose them.
 */
export function patchSection(
  sections: LayoutSection[],
  name: string,
  patch: Partial<LayoutSection>,
): LayoutSection[] {
  return sections.map((section) => {
    if (section.name !== name) return section
    const next: LayoutSection = { ...section, ...patch }
    if (patch.access === 'double_front' && (next.faces?.length ?? 0) < 2) {
      next.faces = [
        ...next.faces,
        { side: 'rear', connection: 'rear', design: next.design, placements: [] },
      ]
    }
    if (patch.access === 'single_front') {
      next.faces = next.faces.slice(0, 1)
    }
    return next
  })
}

/** What turning a second face off would throw away, so it can be asked about. */
export function wouldLose(section: LayoutSection): number {
  return placementsOn(section, 'rear').length
}
