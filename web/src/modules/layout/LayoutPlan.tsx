import type { LayoutFit, LayoutSection } from '../../lib/database.types'
import { LayoutDefs } from './LayoutDefs'
import { mm } from './layout'
import { PLAN_DEFAULTS, type PlanSettings, planZones } from './layout-views'

/**
 * Looking down on one section (roadmap 3.8, stage two) — the view that shows the
 * dimension the front cannot: depth.
 *
 * It is drawn for the selected section rather than the whole board, as the
 * mockup draws it, because depth is a property of a section: the vertical busbar
 * on its side, the mounting plate, and the cable alley either *beside* the plates
 * or *behind* them. Behind gives a wider plate and costs depth — and where the
 * section is too shallow for it, the verdict says so and this view says why.
 */
export function LayoutPlan({
  section,
  fit,
  settings = PLAN_DEFAULTS,
}: {
  section: LayoutSection | null
  fit: LayoutFit | null
  settings?: PlanSettings
}) {
  if (section === null) {
    return (
      <p className="muted" style={{ padding: '1rem' }}>
        Pick a section on the front view. The plan looks down on one section at a time, because
        depth belongs to a section rather than to the board.
      </p>
    )
  }

  const z = planZones(section, settings)
  const row = fit?.sections.find((s) => s.name === section.name)
  const busbarLeft = z.busbarSide === 'left'
  // Everything below is in millimetres, looking down: x across the width, y from
  // the back wall towards the door.
  const busbarX = busbarLeft ? 0 : z.widthMm - z.busbarMm
  const plateX = busbarLeft ? z.busbarMm : 0
  const alleyBeside = z.alley === 'beside'
  const plateY = z.alley === 'behind' ? z.depthMm - z.doorSwingMm - 200 : z.dropperMm + 120

  return (
    <div style={{ padding: '.5rem' }}>
      <svg
        viewBox={`-140 -80 ${mm(z.widthMm) + 280} ${mm(z.depthMm) + 300}`}
        style={{ display: 'block', width: '100%', maxHeight: '56vh' }}
        role="img"
        aria-label={`Plan view of section ${section.name}, ${z.widthMm} by ${z.depthMm} mm`}
      >
        <LayoutDefs />

        <rect x={0} y={0} width={mm(z.widthMm)} height={mm(z.depthMm)} fill="#ffffff" stroke="#9ca3af" strokeWidth={2} />

        {/* The back wall: horizontal-busbar droppers and the earth bar. */}
        <rect x={0} y={0} width={mm(z.widthMm)} height={mm(z.dropperMm)} fill="#e5e7eb" stroke="#9ca3af" strokeWidth={0.6} />
        <text x={mm(z.widthMm / 2)} y={mm(z.dropperMm * 0.7)} fontSize={mm(40)} textAnchor="middle" fill="#374151">
          rear · busbar droppers and earth bar · {z.dropperMm} mm
        </text>

        {/* The vertical busbar chamber, on whichever side the section carries it. */}
        <rect x={mm(busbarX)} y={mm(z.dropperMm)} width={mm(z.busbarMm)} height={mm(z.depthMm - z.dropperMm - z.doorSwingMm)} fill="#e5e7eb" stroke="#9ca3af" strokeWidth={0.6} />
        {[0, 1, 2].map((phase) => (
          <rect key={phase} x={mm(busbarX + 30 + phase * 36)} y={mm(z.dropperMm + 40)} width={mm(14)} height={mm(z.depthMm - z.dropperMm - z.doorSwingMm - 80)} fill="url(#copper)" />
        ))}
        <text x={mm(busbarX + z.busbarMm / 2)} y={mm(z.depthMm - z.doorSwingMm - 20)} fontSize={mm(36)} textAnchor="middle" fill="#374151">
          VBB {z.busbarMm}
        </text>

        {/* The cable alley: beside the plates, or behind them. */}
        {alleyBeside ? (
          <rect x={mm(busbarLeft ? z.widthMm - z.alleyMm : 0)} y={mm(z.dropperMm)} width={mm(z.alleyMm)} height={mm(z.depthMm - z.dropperMm - z.doorSwingMm)} fill="#e5e7eb" stroke="#9ca3af" strokeWidth={0.6} />
        ) : (
          <rect x={mm(plateX)} y={mm(z.dropperMm)} width={mm(z.widthMm - z.busbarMm)} height={mm(z.alleyMm)} fill="#e5e7eb" stroke="#9ca3af" strokeWidth={0.6} />
        )}
        <text
          x={mm(alleyBeside ? (busbarLeft ? z.widthMm - z.alleyMm / 2 : z.alleyMm / 2) : plateX + (z.widthMm - z.busbarMm) / 2)}
          y={mm(alleyBeside ? z.depthMm / 2 : z.dropperMm + z.alleyMm * 0.6)}
          fontSize={mm(36)}
          textAnchor="middle"
          fill="#374151"
        >
          cable alley {z.alleyMm} · {alleyBeside ? 'beside' : 'behind · rear access'}
        </text>

        {/* The mounting plate, and the depth a device needs off it. */}
        <rect x={mm(plateX)} y={mm(plateY)} width={mm(z.plateWidthMm)} height={mm(30)} fill="#fef9c3" stroke="#ca8a04" strokeWidth={0.8} />
        <text x={mm(plateX + z.plateWidthMm / 2)} y={mm(plateY - 20)} fontSize={mm(36)} textAnchor="middle" fill="#374151">
          mounting plate {z.plateWidthMm} mm wide
        </text>

        {/* The door, and the room it needs to open. */}
        <rect x={0} y={mm(z.depthMm - z.doorSwingMm)} width={mm(z.widthMm)} height={mm(z.doorSwingMm)} fill="#f3f4f6" stroke="#9ca3af" strokeWidth={0.6} />
        <text x={mm(z.widthMm / 2)} y={mm(z.depthMm - z.doorSwingMm * 0.3)} fontSize={mm(40)} textAnchor="middle" fill="#374151">
          front door · {z.doorSwingMm} mm swing
        </text>

        {/* Dimension lines, as the mockup draws them. */}
        <g stroke="#6b7280" strokeWidth={0.6} fill="#6b7280" fontSize={mm(44)}>
          <line x1={0} y1={mm(z.depthMm + 80)} x2={mm(z.widthMm)} y2={mm(z.depthMm + 80)} />
          <text x={mm(z.widthMm / 2)} y={mm(z.depthMm + 150)} textAnchor="middle" stroke="none">{z.widthMm} (W)</text>
          <line x1={mm(z.widthMm + 80)} y1={0} x2={mm(z.widthMm + 80)} y2={mm(z.depthMm)} />
          <text x={mm(z.widthMm + 130)} y={mm(z.depthMm / 2)} textAnchor="middle" stroke="none">{z.depthMm} (D)</text>
        </g>
      </svg>

      {row?.too_shallow && <p className="error" style={{ fontSize: '.8125rem' }}>{row.too_shallow}</p>}
      <p className="muted" style={{ fontSize: '.75rem' }}>
        {z.alley === 'behind'
          ? `With the alley behind, the plate runs the full ${z.plateWidthMm} mm left of the busbar — a wider or a second device fits, and the section needs the depth and rear access.`
          : `With the alley beside, the plate is ${z.plateWidthMm} mm and the cables stay reachable from the front.`}
      </p>
    </div>
  )
}
