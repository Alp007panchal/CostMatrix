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
  if (warnings.length === 0) {
    return <p className="muted" style={{ margin: 0 }}>Nothing flagged on this panel.</p>
  }

  return (
    <>
      <p
        className={warnings.some((w) => w.severity === 'blocker') ? 'error' : undefined}
        style={{ fontSize: '.8125rem', margin: '0 0 .4rem', fontWeight: 600 }}
      >
        {warningsHeading(warnings)}
      </p>
      {/* An alert item with a source line (house style §4 rule 2): the rule that
          said it is named, so the warning can be argued with rather than obeyed. */}
      {warnings.map((w) => (
        <div className="alert-item" key={`${w.rule_id}-${w.subject}-${w.message}`}>
          <span className={w.severity === 'blocker' ? 'alert-dot bad' : 'alert-dot warn'} />
          <div>
            {w.message}
            <span className="t">{KIND_LABELS[w.rule_kind]} · {w.rule_name}</span>
          </div>
        </div>
      ))}
    </>
  )
}
