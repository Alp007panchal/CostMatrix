import type { BusbarBar, BusbarRun, BusbarTotals } from '../../lib/database.types'
import { describeBar, fmt, runMetres } from './busbar'

/**
 * The schedule itself: a run a row, the way the `CU-OPT1` sheet reads, with the
 * metres worked out as the figures are typed and the totals by bar size under it.
 * Kept apart from the card so the card is about what happens and this is about
 * what it looks like.
 */
export function BusbarSchedule({
  bars,
  runs,
  totals,
  onChange,
  onAdd,
}: {
  bars: BusbarBar[]
  runs: BusbarRun[]
  totals: BusbarTotals
  onChange: (runs: BusbarRun[]) => void
  onAdd: () => void
}) {
  const set = (i: number, change: Partial<BusbarRun>) =>
    onChange(runs.map((run, at) => (at === i ? { ...run, ...change } : run)))

  return (
    <>
      <table style={{ fontSize: '.8125rem', marginTop: '.5rem' }}>
        <thead>
          <tr>
            <th>Run</th>
            <th>Bar</th>
            <th style={{ textAlign: 'right' }}>Phases</th>
            <th style={{ textAlign: 'right' }}>Runs / phase</th>
            <th style={{ textAlign: 'right' }}>Length (m)</th>
            <th style={{ textAlign: 'right' }}>Sets</th>
            <th style={{ textAlign: 'right' }}>Metres</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {runs.map((run, i) => (
            <tr key={i}>
              <td>
                <input
                  value={run.label}
                  aria-label={`Run ${i + 1} name`}
                  style={{ width: '14rem' }}
                  onChange={(e) => set(i, { label: e.target.value })}
                />
              </td>
              <td>
                <select
                  value={run.bar_code}
                  aria-label={`Run ${i + 1} bar size`}
                  onChange={(e) => set(i, { bar_code: e.target.value })}
                >
                  <option value="">Pick a bar</option>
                  {bars.map((bar) => (
                    <option key={bar.code} value={bar.code}>
                      {describeBar(bar)}
                      {bar.is_priced ? '' : ' — no price yet'}
                    </option>
                  ))}
                </select>
              </td>
              {(['phases', 'runs_per_phase', 'length_m', 'sets'] as const).map((field) => (
                <td key={field} style={{ textAlign: 'right' }}>
                  <input
                    type="number" min="0" step={field === 'length_m' ? '0.1' : '1'}
                    value={run[field]}
                    aria-label={`Run ${i + 1} ${LABELS[field]}`}
                    style={{ width: '5rem', textAlign: 'right' }}
                    onChange={(e) => set(i, { [field]: Number(e.target.value) })}
                  />
                </td>
              ))}
              <td style={{ textAlign: 'right' }}>{fmt(runMetres(run))}</td>
              <td>
                <button
                  aria-label={`Remove run ${i + 1}`}
                  onClick={() => onChange(runs.filter((_, at) => at !== i))}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          {runs.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">
                No runs yet. The button above lists the runs a board like this one needs; or add
                them one at a time.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <button style={{ marginTop: '.25rem', fontSize: '.8125rem' }} onClick={onAdd}>
        Add a run
      </button>

      {totals.bars.length > 0 && (
        <table style={{ fontSize: '.8125rem', marginTop: '.5rem' }}>
          <thead>
            <tr>
              <th>Bar size</th>
              <th style={{ textAlign: 'right' }}>Metres</th>
              <th style={{ textAlign: 'right' }}>Kilograms</th>
              <th style={{ textAlign: 'right' }}>At today&rsquo;s copper rate</th>
            </tr>
          </thead>
          <tbody>
            {totals.bars.map((bar) => (
              <tr key={bar.bar_code}>
                <td>{bar.bar_code}</td>
                <td style={{ textAlign: 'right' }}>{fmt(bar.metres)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(bar.kg)}</td>
                <td style={{ textAlign: 'right' }}>{bar.value === null ? 'no price' : money(bar.value)}</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td>
              <td style={{ textAlign: 'right' }}><strong>{fmt(totals.total_metres)}</strong></td>
              <td style={{ textAlign: 'right' }}><strong>{fmt(totals.total_kg)}</strong></td>
              <td style={{ textAlign: 'right' }}><strong>{money(totals.total_value)}</strong></td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  )
}

const LABELS = {
  phases: 'phases',
  runs_per_phase: 'runs per phase',
  length_m: 'length',
  sets: 'sets',
} as const

function money(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
