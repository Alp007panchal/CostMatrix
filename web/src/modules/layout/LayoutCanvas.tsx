import type { LayoutFit, LayoutSection } from '../../lib/database.types'
import { LayoutDefs } from './LayoutDefs'
import {
  BASE_MM,
  BUSBAR_CHAMBER_MM,
  boardWidthMm,
  designWords,
  frontFace,
  mm,
  sectionRuns,
  stackedCovers,
  symbolFor,
} from './layout'

/**
 * The front view: the board at true scale, section by section, drawn the way the
 * owner's mockup draws it — steel frame, ventilation, a copper busbar chamber
 * across the top, covers stacked down each device compartment with the device
 * on them, and a base under the lot.
 *
 * It draws what the arrangement says. It decides nothing: a section's colour
 * comes from the verdict the database gave it.
 */
export function LayoutCanvas({
  sections,
  fit,
  heightMm,
  onDropKit,
  onRemove,
  selected,
  onSelect,
}: {
  sections: LayoutSection[]
  fit: LayoutFit | null
  heightMm: number
  onDropKit: (sectionName: string) => void
  onRemove: (sectionName: string, index: number) => void
  selected: string | null
  onSelect: (sectionName: string) => void
}) {
  const widthMm = boardWidthMm(sections)
  const totalHeight = heightMm + BASE_MM
  const runs = sectionRuns(sections)

  if (sections.length === 0) {
    return (
      <p className="muted" style={{ padding: '1rem' }}>
        No sections yet. The button above arranges the kits on this panel by the rules of their
        mounting designs, and you correct what it got wrong.
      </p>
    )
  }

  return (
    <svg
      viewBox={`-40 -60 ${mm(widthMm) + 80} ${mm(totalHeight) + 120}`}
      style={{ display: 'block', width: '100%', maxHeight: '62vh' }}
      role="img"
      aria-label={`Front view, ${sections.length} sections, ${widthMm} mm wide`}
    >
      <LayoutDefs />

      {/* The horizontal busbar chamber, across every section. */}
      <rect x={0} y={mm(-6)} width={mm(widthMm)} height={mm(6)} fill="url(#steelV)" stroke="#6b7280" strokeWidth={0.8} />
      <rect x={mm(24)} y={mm(24)} width={mm(widthMm - 48)} height={mm(BUSBAR_CHAMBER_MM - 48)} fill="#e5e7eb" stroke="#9ca3af" strokeWidth={0.6} />
      {[0, 1, 2, 3].map((phase) => (
        <rect
          key={phase}
          x={mm(40)}
          y={mm(70 + phase * 50)}
          width={mm(widthMm - 80)}
          height={mm(10)}
          fill="url(#copper)"
          stroke="#6b3d12"
          strokeWidth={0.4}
        />
      ))}

      {runs.map(({ section, x }) => {
        const row = fit?.sections.find((s) => s.name === section.name)
        const isSelected = selected === section.name
        return (
          <g
            key={section.name}
            aria-label={`Section ${section.name}`}
            onClick={() => onSelect(section.name)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              onDropKit(section.name)
            }}
            style={{ cursor: 'pointer' }}
          >
            {/* The cubicle itself. */}
            <rect x={mm(x)} y={0} width={mm(section.width_mm)} height={mm(heightMm)} fill="url(#steel)" stroke={isSelected ? '#1d4ed8' : '#6b7280'} strokeWidth={isSelected ? 2 : 1.2} />
            <rect x={mm(x + 16)} y={mm(16)} width={mm(section.width_mm - 32)} height={mm(heightMm - 32)} fill="#f2f3f5" stroke="#9ca3af" strokeWidth={0.6} />
            <rect x={mm(x + 48)} y={mm(32)} width={mm(section.width_mm - 96)} height={mm(40)} fill="url(#vent)" />
            <rect x={mm(x + 48)} y={mm(heightMm - 72)} width={mm(section.width_mm - 96)} height={mm(40)} fill="url(#vent)" />
            <rect x={mm(x)} y={mm(heightMm)} width={mm(section.width_mm)} height={mm(BASE_MM)} fill="url(#base)" stroke="#111827" strokeWidth={0.8} />

            {/* The distribution-busbar compartment, where the section has one. */}
            {section.busbar_compartment_mm > 0 && (
              <>
                <rect x={mm(x + 16)} y={mm(BUSBAR_CHAMBER_MM)} width={mm(section.busbar_compartment_mm - 16)} height={mm(heightMm - BUSBAR_CHAMBER_MM - 16)} fill="#eceef0" stroke="#9ca3af" strokeWidth={0.5} />
                {[0, 1, 2].map((phase) => (
                  <rect key={phase} x={mm(x + 40 + phase * 45)} y={mm(BUSBAR_CHAMBER_MM + 40)} width={mm(10)} height={mm(heightMm - BUSBAR_CHAMBER_MM - 120)} fill="url(#copper)" />
                ))}
              </>
            )}

            {/* What is on it. */}
            {stackedCovers(section).map(({ placement, y, height }, index) => {
              const left = x + section.busbar_compartment_mm + 24
              const width = section.width_mm - section.busbar_compartment_mm - 48
              const top = BUSBAR_CHAMBER_MM + 24 + y
              const drawn = height > 0 ? height : 200
              return (
                <g key={`${placement.costing_assembly_id}-${index}`} onDoubleClick={() => onRemove(section.name, index)}>
                  <rect x={mm(left)} y={mm(top)} width={mm(width)} height={mm(drawn - 8)} rx={2} fill={placement.unsized ? '#fffbeb' : 'url(#cover)'} stroke={placement.unsized ? '#f59e0b' : '#9ca3af'} strokeWidth={0.6} />
                  <svg x={mm(left + width / 2 - 60)} y={mm(top + 16)} width={mm(120)} height={mm(Math.max(drawn - 48, 40))} viewBox="0 0 100 110" preserveAspectRatio="xMidYMid meet">
                    <use href={`#${symbolFor(section.design)}`} width="100" height="110" />
                  </svg>
                  <text x={mm(left + 8)} y={mm(top + drawn - 20)} fontSize={mm(44)} fill="#374151">
                    {placement.name}
                  </text>
                </g>
              )
            })}

            {/* The label under it, and how full it is. */}
            <text x={mm(x + section.width_mm / 2)} y={mm(totalHeight + 70)} fontSize={mm(64)} textAnchor="middle" fill="#111827" fontWeight={600}>
              {section.name}
            </text>
            <text x={mm(x + section.width_mm / 2)} y={mm(totalHeight + 130)} fontSize={mm(48)} textAnchor="middle" fill="#6b7280">
              {section.width_mm} mm · {designWords(section.design)}
            </text>
            {row && (
              <text x={mm(x + section.width_mm / 2)} y={mm(totalHeight + 190)} fontSize={mm(48)} textAnchor="middle" fill={verdictColour(row.verdict)}>
                {row.capacity === null ? row.unit : `${round(row.used)} / ${round(row.capacity)} ${row.unit}`}
              </text>
            )}
            {frontFace(section).length === 0 && (
              <text x={mm(x + section.width_mm / 2)} y={mm(heightMm / 2)} fontSize={mm(56)} textAnchor="middle" fill="#9ca3af">
                empty
              </text>
            )}
          </g>
        )
      })}

      {/* A dimension line under the board, as the mockup draws it. */}
      <line x1={0} y1={mm(totalHeight + 240)} x2={mm(widthMm)} y2={mm(totalHeight + 240)} stroke="#6b7280" strokeWidth={0.6} />
      <text x={mm(widthMm / 2)} y={mm(totalHeight + 300)} fontSize={mm(56)} textAnchor="middle" fill="#374151">
        {widthMm} mm overall
      </text>
    </svg>
  )
}

function verdictColour(verdict: string): string {
  if (verdict === 'no_fit') return '#b3261e'
  if (verdict === 'unknown') return '#b45309'
  return '#374151'
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
