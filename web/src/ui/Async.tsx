import { useEffect, type ReactNode } from 'react'
import { reportError } from '../lib/report-error'

/** Consistent loading, error and empty states, so no screen invents its own. */
export function Async<T>({
  query,
  empty,
  children,
}: {
  query: { isPending: boolean; error: unknown; data: T | undefined }
  empty?: ReactNode
  children: (data: T) => ReactNode
}) {
  // A failed load never reaches the error boundary: TanStack Query catches it
  // and it arrives here as state. Every screen in the app funnels through this
  // component, so this one line is what makes a loading failure visible to the
  // administrator rather than only to the person looking at the red text.
  const failure = query.error
    ? query.error instanceof Error
      ? query.error.message
      : String(query.error)
    : null
  useEffect(() => {
    if (failure) reportError('load', failure)
  }, [failure])

  if (query.isPending) return <p className="empty">Loading…</p>
  if (failure) return <p className="error">{failure}</p>

  const data = query.data
  if (data === undefined) return <p className="empty">Nothing to show.</p>
  if (empty && Array.isArray(data) && data.length === 0) return <div className="empty">{empty}</div>

  return <>{children(data)}</>
}

/** A labelled input. Keeps every form on the same rhythm. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span>
        {label} {hint && <em className="hint">— {hint}</em>}
      </span>
      {children}
    </label>
  )
}
