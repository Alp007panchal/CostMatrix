import type { LayoutFit, LayoutSection } from '../../lib/database.types'
import { LayoutDefs } from './LayoutDefs'
import { BASE_MM, BUSBAR_CHAMBER_MM, boardWidthMm, mm, stackedCovers, symbolFor } from './layout'
import { isDoubleFront, placementsOn, rearRuns, rearWords } from './layout-views'

/**
 * The back of the board (roadmap 3.8, stage two).
 *
 * Two jobs in one view, because a board has two kinds of back. Where a section is
 * **double-front** its rear is a device compartment of its own and this view is an
 * editor: kits drop onto face B. Where it is single-front the rear is where the
 * cables are, and the view is read-only — lugs on a rear-connection section,
 * shrouded terminals on a front-connection one.
 *
 * The sections are mirrored, because that is the order a person walking round the
 * board sees them in.
 */
export function LayoutRear({
  sections,
  fit,
  heightMm,
  onDropKit,
  onRemove,
  showCables,
}: {
  sections: LayoutSection[]
  fit: LayoutFit | null
  heightMm: number
  onDropKit: (sectionName: string) => void
  onRemove: (sectionName: string, index: number) => void
  showCables: boolean
}) {
  const widthMm = boardWidthMm(sections)
  const totalHeight = heightMm + BASE_MM
  const runs = rearRuns(sections)

  if (sections.length === 0) {
    return (
      <p className="muted" style={{ padding: '1rem' }}>
        Work the board out on the front view first. The back of a board is the back of its sections.
      </p>
    )
  }

  return (
    <svg
      viewBox={`-40 -60 ${mm(widthMm) + 80} ${mm(totalHeight) + 140}`}
      style={{ display: 'block', width: '100%', maxHeight: '62vh' }}
      role="img"
      aria-label={`Rear view, ${sections.length} sections mirrored, ${widthMm} mm wide`}
    >
      <LayoutDefs />

      <rect x={0} y={mm(-6)} width={mm(widthMm)} height={mm(6)} fill="url(#steelV)" stroke="#6b7280" strokeWidth={0.8} />

      {runs.map(({ section, x }) => {
        const row = fit?.sections.find((s) => s.name === section.name)
        const rearRow = row?.faces?.find((f) => f.side === 'rear')
        const doubled = isDoubleFront(section)
        return (
          <g
            key={section.name}
            aria-label={`Rear of section ${section.name}`}
            // The drop is always taken and always answered: a section with one face
            // refuses it in words rather than swallowing it (spec §4).
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onDropKit(section.name) }}
          >
            <rect x={mm(x)} y={0} width={mm(section.width_mm)} height={mm(heightMm)} fill="url(#steel)" stroke="#6b7280" strokeWidth={1.2} />
            <rect x={mm(x + 16)} y={mm(16)} width={mm(section.width_mm - 32)} height={mm(heightMm - 32)} fill="#f2f3f5" stroke="#9ca3af" strokeWidth={0.6} />
            <rect x={mm(x)} y={mm(heightMm)} width={mm(section.width_mm)} height={mm(BASE_MM)} fill="url(#base)" stroke="#111827" strokeWidth={0.8} />
            <text x={mm(x + section.width_mm / 2)} y={mm(-20)} fontSize={mm(44)} textAnchor="middle" fill="#111827" fontWeight={600}>
              {section.name}{doubled ? ' · face B' : ' · rear panel removed'}
            </text>

            {doubled ? (
              // Face B: the same drawing as the front, on the other side of the frame.
              stackedCovers({ ...section, faces: [{ side: 'rear', connection: 'rear', design: section.design, placements: placementsOn(section, 'rear') }] }).map(
                ({ placement, y, height }, index) => {
                  const left = x + 24
                  const width = section.width_mm - 48
                  const top = BUSBAR_CHAMBER_MM + 24 + y
                  const drawn = height > 0 ? height : 200
                  return (
                    <g key={`${placement.costing_assembly_id}-${index}`} onDoubleClick={() => onRemove(section.name, index)}>
                      <rect x={mm(left)} y={mm(top)} width={mm(width)} height={mm(drawn - 8)} rx={2} fill={placement.unsized ? '#fffbeb' : 'url(#cover)'} stroke={placement.unsized ? '#f59e0b' : '#9ca3af'} strokeWidth={0.6} />
                      <svg x={mm(left + width / 2 - 60)} y={mm(top + 16)} width={mm(120)} height={mm(Math.max(drawn - 48, 40))} viewBox="0 0 100 110" preserveAspectRatio="xMidYMid meet">
                        <use href={`#${symbolFor(section.design)}`} width="100" height="110" />
                      </svg>
                      <text x={mm(left + 8)} y={mm(top + drawn - 20)} fontSize={mm(44)} fill="#374151">{placement.name}</text>
                    </g>
                  )
                },
              )
            ) : (
              <RearConnection x={x} section={section} heightMm={heightMm} showCables={showCables} />
            )}

            <text x={mm(x + section.width_mm / 2)} y={mm(totalHeight + 70)} fontSize={mm(42)} textAnchor="middle" fill="#6b7280">
              {rearWords(section)}
            </text>
            {doubled && rearRow && (
              <text x={mm(x + section.width_mm / 2)} y={mm(totalHeight + 130)} fontSize={mm(44)} textAnchor="middle" fill={rearRow.verdict === 'no_fit' ? '#b3261e' : '#374151'}>
                {rearRow.capacity === null ? rearRow.unit : `${Math.round(rearRow.used)} / ${Math.round(rearRow.capacity)} ${rearRow.unit}`}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** What a single-front section shows at the back: its busbar taps and its cables. */
function RearConnection({
  x,
  section,
  heightMm,
  showCables,
}: {
  x: number
  section: LayoutSection
  heightMm: number
  showCables: boolean
}) {
  const connection = section.faces?.[0]?.connection ?? 'front'
  const ways = Math.max(placementsOn(section, 'front').length, 1)
  const top = BUSBAR_CHAMBER_MM + 80
  const span = heightMm - top - 200
  return (
    <>
      {/* The distribution busbar's tap-offs, one set per way. */}
      {[0, 1, 2].map((phase) => (
        <rect key={phase} x={mm(x + 60 + phase * 50)} y={mm(top)} width={mm(12)} height={mm(span)} fill="url(#copper)" />
      ))}
      {Array.from({ length: ways }).map((_, way) => {
        const y = top + 60 + (span / ways) * way
        return (
          <g key={way}>
            <line x1={mm(x + 60)} y1={mm(y)} x2={mm(x + section.width_mm - 120)} y2={mm(y)} stroke="#b8692a" strokeWidth={1.2} />
            {/* The lug itself, where the cables land. */}
            <rect x={mm(x + section.width_mm - 140)} y={mm(y - 18)} width={mm(40)} height={mm(36)} fill={connection === 'rear' ? '#6b7480' : '#d1d5db'} stroke="#4b5563" strokeWidth={0.5} />
            {showCables && connection === 'rear' && (
              <path
                d={`M ${mm(x + section.width_mm - 100)} ${mm(y)} C ${mm(x + section.width_mm - 40)} ${mm(y)}, ${mm(x + section.width_mm - 40)} ${mm(heightMm - 80)}, ${mm(x + section.width_mm - 160)} ${mm(heightMm - 40)}`}
                fill="none"
                stroke="#1f2937"
                strokeWidth={1.4}
                opacity={0.7}
              />
            )}
          </g>
        )
      })}
    </>
  )
}
