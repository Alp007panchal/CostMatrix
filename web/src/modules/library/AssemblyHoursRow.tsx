import { useState } from 'react'
import { money } from '../../lib/format'
import type { AssemblyHours } from '../../lib/database.types'

/** One process type: hours, rate and cost, editable per the caller's rules. */
export function AssemblyHoursRow({
  row,
  rate,
  label,
  mode,
  onSave,
  onClearOverride,
}: {
  row: AssemblyHours
  rate: number
  label: string
  mode: 'edit' | 'override' | 'view'
  onSave: (hours: number) => Promise<void>
  onClearOverride?: (() => Promise<void>) | undefined
}) {
  const [error, setError] = useState<string | null>(null)
  const commit = (value: string) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0) return
    onSave(n).catch((e: unknown) => setError(String(e)))
  }
  const shownBase = mode === 'override' ? row.master_hours ?? row.group_hours : row.effective_hours
  const origin =
    row.source === 'kit_group'
      ? 'from the kit group'
      : row.source === 'company_override'
        ? 'your override'
        : row.master_hours != null && row.group_hours != null
          ? `kit's own (group says ${row.group_hours})`
          : null

  return (
    <tr>
      <td>
        {row.process_name}
        {origin && <div className="muted" style={{ fontSize: '.75rem' }}>{origin}</div>}
      </td>
      <td className="right">
        {mode === 'edit' ? (
          <input
            type="number"
            step="0.25"
            min="0"
            defaultValue={row.master_hours ?? ''}
            placeholder={row.group_hours != null ? `group: ${row.group_hours}` : '0'}
            style={{ width: '6rem', textAlign: 'right' }}
            onBlur={(e) => e.target.value !== '' && commit(e.target.value)}
          />
        ) : (
          (shownBase ?? 0).toFixed(2)
        )}
      </td>
      {mode === 'override' && (
        <td className="right">
          <input
            type="number"
            step="0.25"
            min="0"
            defaultValue={row.company_hours ?? ''}
            placeholder="same as master"
            style={{ width: '7rem', textAlign: 'right' }}
            onBlur={(e) => e.target.value !== '' && commit(e.target.value)}
          />
          {row.company_hours != null && onClearOverride && (
            <div>
              <button onClick={() => void onClearOverride()} style={{ fontSize: '.75rem' }}>
                use master
              </button>
            </div>
          )}
        </td>
      )}
      <td className="right muted">{money(rate, label)}/h</td>
      <td className="right">
        {money(row.effective_hours * rate, label)}
        {error && <div className="error">{error}</div>}
      </td>
    </tr>
  )
}
