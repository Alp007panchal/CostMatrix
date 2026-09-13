import type { PdfGaSection, PdfGaSheet } from './types'

/**
 * Where everything sits on a general-arrangement sheet, in the sheet's own
 * points (roadmap 3.8, spec §5).
 *
 * Kept apart from the drawing so the geometry can be checked without rendering a
 * PDF, and apart from the browser canvas because this is a different medium: an
 * A4 landscape page with a fixed drawing frame, so the scale **follows the
 * board** rather than being fixed at 1 : 4. A 6 m board and a 1 m one both fill
 * the frame, and the scale is printed so nobody measures off the paper.
 */

/** The drawing frame inside A4 landscape (842 × 595 pt) less margins and bands. */
export const FRAME = { x: 0, y: 0, width: 700, height: 300 }

export interface GaGeometry {
  /** Points per millimetre, chosen so the board fills the frame. */
  scale: number
  /** The scale as a ratio a draughtsman would read, e.g. "1 : 12". */
  scaleWords: string
  boardWidth: number
  boardHeight: number
  baseHeight: number
  /** The horizontal busbar chamber and the cable chamber, top and bottom. */
  chamber: number
  sections: { section: PdfGaSection; x: number; width: number }[]
}

export function gaGeometry(sheet: PdfGaSheet, frame = FRAME): GaGeometry {
  const widthMm = Math.max(sheet.widthMm, 1)
  const totalMm = sheet.heightMm + sheet.baseMm
  // Whichever dimension runs out first decides the scale, so nothing is clipped.
  const scale = Math.min(frame.width / widthMm, frame.height / totalMm)
  let x = 0
  const sections = sheet.sections.map((section) => {
    const width = section.widthMm * scale
    const at = { section, x, width }
    x += width
    return at
  })
  return {
    scale,
    scaleWords: scaleWords(scale),
    boardWidth: widthMm * scale,
    boardHeight: sheet.heightMm * scale,
    baseHeight: sheet.baseMm * scale,
    // A sixth of the height for the busbar chamber, as the mockup draws it.
    chamber: sheet.heightMm * scale * 0.143,
    sections,
  }
}

/** 1 : n, rounded to something a person would say. */
export function scaleWords(scale: number): string {
  // A point is 1/72 inch and a millimetre 1/25.4, so 1 pt = 25.4/72 mm on paper.
  const ratio = (25.4 / 72) / scale
  const rounded = ratio >= 20 ? Math.round(ratio / 5) * 5 : Math.round(ratio)
  return `1 : ${rounded}`
}

/**
 * Where one device sits down its section, in points, kept inside the compartment
 * between the two chambers so nothing is ever drawn over the busbars.
 */
export function devicePlace(
  device: PdfGaSection['devices'][number],
  geometry: GaGeometry,
): { y: number; height: number } {
  const room = Math.max(geometry.boardHeight - geometry.chamber * 2, 6)
  // Clamped to the compartment, not just positioned in it: a module height larger
  // than the board — bad data, or a device in the wrong kind of section — must
  // still be drawn inside the steel rather than over the busbars.
  const height = Math.min(
    Math.max(
      device.heightMm > 0
        ? device.heightMm * geometry.scale
        // A device the library has never measured is drawn at a nominal height and
        // marked on the sheet, rather than given a size it does not have.
        : Math.min(200 * geometry.scale, geometry.boardHeight / 6),
      6,
    ),
    room,
  )
  const top = geometry.chamber + device.yMm * geometry.scale
  return { y: Math.min(top, geometry.chamber + (room - height)), height }
}

/** The tags of every device on the sheet, in order — the technical offer's list. */
export function sheetTags(sheet: PdfGaSheet): string[] {
  return sheet.sections.flatMap((s) => s.devices.map((d) => d.tag))
}
