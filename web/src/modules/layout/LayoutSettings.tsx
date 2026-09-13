import type { CableAlley, LayoutSection } from '../../lib/database.types'
import { designWords } from './layout'
import { isDoubleFront, planZones } from './layout-views'

/**
 * The settings of one section (roadmap 3.8, stage two), as the plan mockup lists
 * them: where the cable alley goes, which side the vertical busbar is on, how deep
 * the section is, and whether it carries a second face.
 *
 * Each change re-asks the database for the verdict, so a choice that makes a
 * section too shallow or too narrow is refused by the same rule the costing uses —
 * this panel never decides anything itself.
 */
export function LayoutSettings({
  section,
  depths,
  forms,
  allowsDoubleFront,
  editable,
  onChange,
}: {
  section: LayoutSection | null
  depths: number[]
  forms: string[]
  allowsDoubleFront: boolean
  editable: boolean
  onChange: (patch: Partial<LayoutSection>) => void
}) {
  if (section === null) {
    return (
      <p className="muted" style={{ fontSize: '.75rem' }}>
        Click a section on the drawing to change its depth, its busbar side or where its cables run.
      </p>
    )
  }

  const z = planZones(section)
  const disabled = !editable

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', fontSize: '.75rem' }}>
      <strong style={{ fontSize: '.8125rem' }}>
        {section.name} · {designWords(section.design)}
      </strong>

      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.4rem' }}>
        Cable alley
        <select
          aria-label={`Cable alley on ${section.name}`}
          value={section.cable_alley ?? 'beside'}
          disabled={disabled}
          onChange={(e) => onChange({ cable_alley: e.target.value as CableAlley })}
        >
          <option value="beside">beside the plates</option>
          <option value="behind">behind the plates</option>
        </select>
      </label>

      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.4rem' }}>
        Vertical busbar
        <select
          aria-label={`Vertical busbar side on ${section.name}`}
          value={section.busbar_side ?? 'left'}
          disabled={disabled}
          onChange={(e) => onChange({ busbar_side: e.target.value as 'left' | 'right' })}
        >
          <option value="left">left</option>
          <option value="right">right</option>
        </select>
      </label>

      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.4rem' }}>
        Depth
        <select
          aria-label={`Depth of ${section.name}`}
          value={String(section.depth_mm ?? 800)}
          disabled={disabled}
          onChange={(e) => onChange({ depth_mm: Number(e.target.value) })}
        >
          {(depths.length > 0 ? depths : [600, 800, 1000]).map((d) => (
            <option key={d} value={d}>{d} mm</option>
          ))}
        </select>
      </label>

      {forms.length > 0 && (
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.4rem' }}>
          Form
          <select
            aria-label={`Form of ${section.name}`}
            value={section.form ?? forms[0]}
            disabled={disabled}
            onChange={(e) => onChange({ form: e.target.value })}
          >
            {forms.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      )}

      {allowsDoubleFront && (
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.4rem' }}>
          Two faces
          <input
            type="checkbox"
            aria-label={`Double-front on ${section.name}`}
            checked={isDoubleFront(section)}
            disabled={disabled}
            onChange={(e) => onChange({ access: e.target.checked ? 'double_front' : 'single_front' })}
          />
        </label>
      )}

      <p className="muted" style={{ margin: 0 }}>
        {z.plateWidthMm} mm of plate · {z.alley === 'behind'
          ? 'the alley behind needs rear access and the depth to go with it'
          : 'the alley beside keeps the cables reachable from the front'}
      </p>
    </div>
  )
}
