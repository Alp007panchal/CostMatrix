import type { ReactNode } from 'react'

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
  if (query.isPending) return <p className="empty">Loading…</p>

  if (query.error) {
    const message = query.error instanceof Error ? query.error.message : String(query.error)
    return <p className="error">{message}</p>
  }

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
