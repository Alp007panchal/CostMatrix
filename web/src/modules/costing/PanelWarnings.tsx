import type { PanelWarning } from '../../lib/database.types'
import { KIND_LABELS, warningsHeading } from './warnings'

/**
 * What the compatibility rules found on this panel (roadmap 3.4): a device that
 * will not go into the cubicle bought for it, a part listed for another device,
 * outgoing ways that do not add up against the incomer.
 *
 * Advisory. Nothing here moves a price, an hour or a total, and a panel whose
 * parts nobody has measured or described shows nothing at all — the same
 * silence the space check keeps.
 */
export function PanelWarnings({ warnings }: { warnings: PanelWarning[] }) {
  if (warnings.length === 0) return null

  return (
    <div style={{ marginTop: '.4rem' }}>
      <p
        className={warnings.some((w) => w.severity === 'blocker') ? 'error' : undefined}
        style={{ fontSize: '.8125rem', margin: 0, fontWeight: 600 }}
      >
        {warningsHeading(warnings)}
      </p>
      <ul style={{ fontSize: '.8125rem', margin: '.2rem 0 0', paddingLeft: '1.1rem' }}>
        {warnings.map((w) => (
          <li key={`${w.rule_id}-${w.subject}-${w.message}`} className={w.severity === 'blocker' ? 'error' : 'muted'}>
            {w.message}{' '}
            <span className="muted" title={`${KIND_LABELS[w.rule_kind]} — ${w.rule_name}`}>
              ({w.rule_name})
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
