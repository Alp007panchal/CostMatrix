import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { offMessage } from './features'
import { useFeatures } from './use-features'

/**
 * A screen that only exists when its feature is switched on. A bookmark to one
 * that is off gets a sentence naming it rather than a "page not found", because
 * the page does exist — it is simply not switched on here.
 */
export function FeatureGate({ code, children }: { code: string; children: ReactNode }) {
  const { features, on } = useFeatures()
  if (on(code)) return <>{children}</>
  return (
    <div className="empty">
      <p>{offMessage(features, code)}</p>
      <p className="muted">
        The master administrator switches features on under <Link to="/admin/features">Features</Link>.
      </p>
    </div>
  )
}
