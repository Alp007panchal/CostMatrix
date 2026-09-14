import { useEffect, useState } from 'react'
import type { CostingPanel, PanelFit } from '../../lib/database.types'

/**
 * One panel's column heading in the grid, and the place its details are changed.
 *
 * The grid could edit every quantity in the costing but not the name of the
 * column the quantity was in — a panel had to be renamed in its own tab, which
 * is exactly the trip the grid exists to save. So the heading carries the same
 * fields the panel tab's Details row does, committed the same way: on blur or
 * Enter, through `updatePanel`, which is what the panel tab calls.
 *
 * Three of that row's fields are deliberately not here — the unit, the enclosure
 * dimensions and the technical description. They want room to read, and a column
 * heading is the one place in the app that has none.
 */
export function GridPanelHead({
  panel,
  isOption,
  fit,
  editable,
  inCompare,
  onChange,
  onRemove,
}: {
  panel: CostingPanel
  /** Whether this column counts towards the costing's total (roadmap 2.7). */
  isOption: boolean
  fit: PanelFit | undefined
  editable: boolean
  inCompare: boolean
  onChange: (changes: Partial<CostingPanel>) => void
  /** Asks first; the question is in `remove-panel.ts`. */
  onRemove: () => void
}) {
  const warning = spaceWarning(fit)
  const style = inCompare ? { background: 'rgba(245, 158, 11, .12)' } : undefined

  if (!editable) {
    return (
      <th className="right" style={style}>
        {panel.name}
        <div className="sub">{readOnlyLine(panel, isOption)}</div>
        {warning !== null && <div className="error sub" title={warning}>{warning}</div>}
      </th>
    )
  }

  return (
    <th className="right" style={style}>
      <div className="panel-head">
        <div className="row">
          <Text
            label={`Name of ${panel.name}`}
            value={panel.name}
            className="nm"
            // A panel with no name at all would leave a nameless column and a
            // nameless line on the quotation, so an empty box means "unchanged".
            onCommit={(v) => v.trim() !== '' && onChange({ name: v.trim() })}
          />
          <button
            type="button"
            className="ghost small rm"
            aria-label={`Remove ${panel.name}`}
            title={`Remove ${panel.name} and everything on it`}
            onClick={onRemove}
          >
            ×
          </button>
        </div>
        <div className="row">
          <QtyBox
            label={`Quantity of ${panel.name}`}
            value={panel.quantity}
            onCommit={(v) => v > 0 && onChange({ quantity: v })}
          />
          <Text
            label={`Tag of ${panel.name}`}
            value={panel.tag ?? ''}
            placeholder="tag"
            onCommit={(v) => onChange({ tag: v.trim() === '' ? null : v.trim() })}
          />
        </div>
        <div className="row">
          <Text
            label={`Option of ${panel.name}`}
            value={panel.option_label ?? ''}
            placeholder="option"
            onCommit={(v) => onChange({ option_label: v.trim() === '' ? null : v.trim() })}
          />
          <label title="Priced and printed on the quotation, left out of the total">
            <input
              type="checkbox"
              checked={panel.is_option}
              onChange={(e) => onChange({ is_option: e.target.checked })}
            />
            extra
          </label>
        </div>
        {warning !== null && <div className="error sub" title={warning}>{warning}</div>}
      </div>
    </th>
  )
}

/** What the heading says when nobody may change it. */
function readOnlyLine(panel: CostingPanel, isOption: boolean): string {
  return [panel.tag, `qty ${Number(panel.quantity)}`, isOption ? 'option' : null]
    .filter(Boolean)
    .join(' · ')
}

/**
 * A box that keeps what is typed until it is committed, and goes back to the
 * saved value if the edit is refused. Same contract as `GridCell`.
 */
function Text({
  label, value, placeholder, className, onCommit,
}: {
  label: string
  value: string
  placeholder?: string
  className?: string
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <input
      aria-label={label}
      value={draft}
      className={className}
      {...(placeholder === undefined ? {} : { placeholder })}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

function QtyBox({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const shown = String(value)
  const [draft, setDraft] = useState(shown)
  useEffect(() => { setDraft(shown) }, [shown])
  return (
    <input
      aria-label={label}
      value={draft}
      inputMode="numeric"
      className="qty"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === shown) return
        const typed = Number(draft)
        if (Number.isNaN(typed) || typed <= 0) return setDraft(shown)
        onCommit(typed)
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}
/** Only when the space check has something an engineer can act on (F12). */
export function spaceWarning(fit: PanelFit | undefined): string | null {
  if (fit === undefined || fit.used_pct === null) return null
  if (fit.verdict === 'no_fit') return `space ${Math.round(fit.used_pct)} % · will not fit`
  if (fit.verdict === 'tight') return `space ${Math.round(fit.used_pct)} % · check`
  return null
}
