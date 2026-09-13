import type { LayoutDoorDevice, LayoutSection } from '../../lib/database.types'
import { LayoutDefs } from './LayoutDefs'
import { BASE_MM, mm, sectionRuns } from './layout'
import { doorRows, doorUnmeasured } from './layout-views'

/**
 * The doors of the board (roadmap 3.8, stage two) — the meters, lamps and switches
 * that are mounted on the door rather than inside it.
 *
 * What counts as door-mounted is not guessed from a name: it is the component's own
 * `mounting_type` from F12. A part whose type says nothing is not drawn here, and a
 * door-mounted part with no size on record is **named below the drawing** rather
 * than drawn at an invented size.
 */
export function LayoutDoor({
  sections,
  devices,
  heightMm,
}: {
  sections: LayoutSection[]
  devices: LayoutDoorDevice[]
  heightMm: number
}) {
  const runs = sectionRuns(sections)
  const widthMm = runs.reduce((total, r) => total + r.section.width_mm, 0)
  const unmeasured = doorUnmeasured(devices)

  if (sections.length === 0) {
    return <p className="muted" style={{ padding: '1rem' }}>Work the board out first; a door belongs to a section.</p>
  }

  // Which section a kit's door parts belong on: the section it is placed on.
  const sectionOf = new Map<string, string>()
  for (const { section } of runs) {
    for (const face of section.faces ?? []) {
      for (const placement of face.placements) {
        sectionOf.set(placement.costing_assembly_id, section.name)
      }
    }
  }

  return (
    <div style={{ padding: '.5rem' }}>
      <svg
        viewBox={`-40 -70 ${mm(widthMm) + 80} ${mm(heightMm + BASE_MM) + 140}`}
        style={{ display: 'block', width: '100%', maxHeight: '56vh' }}
        role="img"
        aria-label={`Door view, ${sections.length} doors, ${devices.length} door-mounted parts`}
      >
        <LayoutDefs />
        {runs.map(({ section, x }) => {
          const mine = devices.filter((d) => sectionOf.get(d.costing_assembly_id) === section.name)
          const placed = doorRows(mine, section.width_mm)
          return (
            <g key={section.name} aria-label={`Door of section ${section.name}`}>
              <rect x={mm(x)} y={0} width={mm(section.width_mm)} height={mm(heightMm)} fill="url(#steel)" stroke="#6b7280" strokeWidth={1.2} />
              <rect x={mm(x + 20)} y={mm(20)} width={mm(section.width_mm - 40)} height={mm(heightMm - 40)} fill="#f2f3f5" stroke="#9ca3af" strokeWidth={0.5} />
              {/* The handle, so a door reads as a door. */}
              <rect x={mm(x + section.width_mm - 70)} y={mm(heightMm / 2 - 90)} width={mm(22)} height={mm(180)} rx={3} fill="#9aa3ad" stroke="#6b7280" strokeWidth={0.5} />
              <rect x={mm(x)} y={mm(heightMm)} width={mm(section.width_mm)} height={mm(BASE_MM)} fill="url(#base)" stroke="#111827" strokeWidth={0.8} />

              {placed.map(({ device, x: dx, y: dy, w, h }, index) => (
                <g key={`${device.code}-${index}`}>
                  <rect x={mm(x + dx)} y={mm(dy + 200)} width={mm(w)} height={mm(h)} rx={2} fill="#1f242b" stroke="#111827" strokeWidth={0.5} />
                  <svg x={mm(x + dx)} y={mm(dy + 200)} width={mm(w)} height={mm(h)} viewBox="0 0 96 96" preserveAspectRatio="xMidYMid meet">
                    <use href={`#${w >= 60 ? 'mfm' : 'lamp'}`} width="96" height="96" />
                  </svg>
                </g>
              ))}

              <text x={mm(x + section.width_mm / 2)} y={mm(-24)} fontSize={mm(44)} textAnchor="middle" fill="#111827" fontWeight={600}>
                {section.name}
              </text>
              {placed.length === 0 && (
                <text x={mm(x + section.width_mm / 2)} y={mm(heightMm / 2)} fontSize={mm(44)} textAnchor="middle" fill="#9ca3af">
                  plain door
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {devices.length === 0 && (
        <p className="muted" style={{ fontSize: '.8125rem' }}>
          No part of this panel is recorded as door-mounted. A meter or a lamp appears here once its
          component carries <strong>Mounting: door</strong> on the Components screen.
        </p>
      )}
      {unmeasured.length > 0 && (
        <p className="warn" style={{ fontSize: '.8125rem' }}>
          Not drawn, because the library has no size for them:{' '}
          {unmeasured.map((d) => d.name).join(', ')}. Fill the width and height in on the component.
        </p>
      )}
    </div>
  )
}
