import type { LayoutSection } from '../../lib/database.types'
import { LayoutDefs } from './LayoutDefs'
import { BASE_MM, mm, sectionRuns, symbolFor } from './layout'
import { isoOffset, placementsOn } from './layout-views'

/**
 * The board in isometric (roadmap 3.8, stage two) — the picture for the customer,
 * not a drawing to build from.
 *
 * It is the same sections and the same placements as the front view, with the depth
 * drawn at the mockup's own foreshortening, and a **fixed** viewpoint: from the
 * left or from the right, chosen by a button. Free rotation is not here, and the
 * footer says so rather than implying a 3D model that does not exist.
 */
export function LayoutIso({
  sections,
  heightMm,
  depthMm,
  from,
  openDoors,
}: {
  sections: LayoutSection[]
  heightMm: number
  depthMm: number
  from: 'left' | 'right'
  openDoors: boolean
}) {
  const runs = sectionRuns(sections)
  const widthMm = runs.reduce((total, r) => total + r.section.width_mm, 0)
  const { dx, dy } = isoOffset(depthMm)
  const board = mm(widthMm)
  const tall = mm(heightMm)
  const mirrored = from === 'right'
  // Looking from the right, the depth falls away to the left instead.
  const ox = mirrored ? -dx : dx

  if (sections.length === 0) {
    return <p className="muted" style={{ padding: '1rem' }}>Work the board out first; there is nothing to show yet.</p>
  }

  return (
    <div style={{ padding: '.5rem' }}>
      <svg
        viewBox={`${Math.min(0, ox) - 60} ${-dy - 70} ${board + Math.abs(ox) + 120} ${tall + mm(BASE_MM) + dy + 180}`}
        style={{ display: 'block', width: '100%', maxHeight: '56vh' }}
        role="img"
        aria-label={`Isometric view from the ${from}, ${widthMm} by ${depthMm} mm`}
      >
        <LayoutDefs />

        {/* The floor the board stands on. */}
        <polygon
          points={`0,${tall + mm(BASE_MM)} ${board},${tall + mm(BASE_MM)} ${board + ox},${tall + mm(BASE_MM) - dy} ${ox},${tall + mm(BASE_MM) - dy}`}
          fill="#e5e7eb"
        />
        {/* The top, falling away from the front face. */}
        <polygon points={`0,0 ${board},0 ${board + ox},${-dy} ${ox},${-dy}`} fill="#dfe3e8" stroke="#6b7280" strokeWidth={1} />
        {/* The side the viewpoint shows. */}
        <polygon
          points={mirrored
            ? `0,0 ${ox},${-dy} ${ox},${tall + mm(BASE_MM) - dy} 0,${tall + mm(BASE_MM)}`
            : `${board},0 ${board + ox},${-dy} ${board + ox},${tall + mm(BASE_MM) - dy} ${board},${tall + mm(BASE_MM)}`}
          fill="#b9bfc7"
          stroke="#6b7280"
          strokeWidth={1}
        />

        {runs.map(({ section, x }) => {
          const placements = placementsOn(section, 'front')
          let y = 0
          return (
            <g key={section.name}>
              <rect x={mm(x)} y={0} width={mm(section.width_mm)} height={tall} fill="url(#steel)" stroke="#6b7280" strokeWidth={1} />
              <rect x={mm(x)} y={tall} width={mm(section.width_mm)} height={mm(BASE_MM)} fill="url(#base)" stroke="#111827" strokeWidth={0.8} />
              {openDoors
                ? placements.map((placement, index) => {
                    const height = placement.height_mm ?? 200
                    const top = placement.y_mm ?? y
                    y = top + height
                    return (
                      <g key={`${placement.costing_assembly_id}-${index}`}>
                        <rect x={mm(x + 30)} y={mm(280 + top)} width={mm(section.width_mm - 60)} height={mm(height - 10)} rx={2} fill="url(#cover)" stroke="#9ca3af" strokeWidth={0.5} />
                        <svg x={mm(x + section.width_mm / 2 - 60)} y={mm(290 + top)} width={mm(120)} height={mm(Math.max(height - 40, 40))} viewBox="0 0 100 110" preserveAspectRatio="xMidYMid meet">
                          <use href={`#${symbolFor(section.design)}`} width="100" height="110" />
                        </svg>
                      </g>
                    )
                  })
                : (
                  <>
                    <rect x={mm(x + 20)} y={mm(20)} width={mm(section.width_mm - 40)} height={mm(heightMm - 40)} fill="#f2f3f5" stroke="#9ca3af" strokeWidth={0.5} />
                    <rect x={mm(x + section.width_mm - 70)} y={mm(heightMm / 2 - 90)} width={mm(22)} height={mm(180)} rx={3} fill="#9aa3ad" stroke="#6b7280" strokeWidth={0.5} />
                  </>
                )}
              <text x={mm(x + section.width_mm / 2)} y={mm(-30)} fontSize={mm(48)} textAnchor="middle" fill="#374151" fontWeight={600}>
                {section.name}
              </text>
            </g>
          )
        })}

        <text x={board / 2} y={tall + mm(BASE_MM) + mm(170)} fontSize={mm(52)} textAnchor="middle" fill="#374151">
          {widthMm} × {heightMm} (+{BASE_MM} base) × {depthMm} mm
        </text>
      </svg>
    </div>
  )
}
