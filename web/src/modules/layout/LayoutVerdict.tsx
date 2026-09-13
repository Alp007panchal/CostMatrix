import type { LayoutFit, LayoutPlan } from '../../lib/database.types'
import { designWords, verdictWords } from './layout'

/**
 * Does it fit? Per section, in the unit that design counts in, with the sentence
 * that explains the figure — and the enclosure the drawing says the costing
 * should carry, which is the one thing here that can change a price, and only
 * when somebody presses the button.
 */
export function LayoutVerdict({
  fit,
  plan,
  editable,
  busy,
  onApply,
}: {
  fit: LayoutFit | null
  plan: LayoutPlan | null
  editable: boolean
  busy: boolean
  onApply: (replace: boolean) => void
}) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: '6px', padding: '.5rem', overflowY: 'auto', maxHeight: '62vh' }}>
      <strong style={{ fontSize: '.75rem' }}>Does it fit?</strong>
      {fit === null && <p className="muted" style={{ fontSize: '.75rem' }}>Nothing drawn yet.</p>}

      {fit !== null && (
        <>
          <p style={{ fontSize: '.8125rem', margin: '.25rem 0' }}>
            <strong>{verdictWords(fit.verdict)}</strong> · {fit.section_count} sections ·{' '}
            {fit.total_width_mm} mm overall
          </p>
          <table style={{ fontSize: '.7rem' }}>
            <thead>
              <tr><th>Section</th><th style={{ textAlign: 'right' }}>Used</th><th style={{ textAlign: 'right' }}>Holds</th><th>Verdict</th></tr>
            </thead>
            <tbody>
              {fit.sections.map((section) => (
                <tr key={section.name} title={section.why}>
                  <td>{section.name}<div className="muted">{designWords(section.design)}</div></td>
                  <td style={{ textAlign: 'right' }}>{round(section.used)}</td>
                  <td style={{ textAlign: 'right' }}>{section.capacity === null ? '—' : round(section.capacity)}</td>
                  <td className={section.verdict === 'no_fit' ? 'error' : section.verdict === 'unknown' ? 'warn' : undefined}>
                    {verdictWords(section.verdict)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {plan !== null && plan.explain.length > 0 && (
        <details style={{ marginTop: '.4rem', fontSize: '.7rem' }}>
          <summary>Why each section is there</summary>
          <ul style={{ margin: '.2rem 0 0 .9rem', padding: 0 }}>
            {plan.explain.map((line) => <li key={line.section}>{line.section}: {line.why}</li>)}
          </ul>
        </details>
      )}

      <div style={{ borderTop: '1px solid var(--line)', marginTop: '.5rem', paddingTop: '.5rem' }}>
        <strong style={{ fontSize: '.75rem' }}>The enclosure line</strong>
        <p className="muted" style={{ fontSize: '.7rem', margin: '.2rem 0' }}>
          The cubicles this drawing asks for, added to the costing in an <em>Enclosure</em> section,
          priced and frozen like any other line.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="primary" disabled={busy || !editable || fit === null} onClick={() => onApply(false)}>
            Put these cubicles on the costing
          </button>
          <button disabled={busy || !editable || fit === null} onClick={() => onApply(true)}>
            Replace the ones already there
          </button>
        </div>
      </div>
    </div>
  )
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
