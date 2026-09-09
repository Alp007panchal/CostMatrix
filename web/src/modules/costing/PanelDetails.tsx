/** One editable detail of a panel: tag, option, unit, enclosure. */
export function Detail({ label, hint, value, editable, onCommit }: {
  label: string
  hint?: string
  value: string | null
  editable: boolean
  onCommit: (value: string | null) => void
}) {
  return (
    <label className="field" style={{ margin: 0 }}>
      <span>{label}{hint && <em className="hint"> — {hint}</em>}</span>
      {editable ? (
        <input defaultValue={value ?? ''} onBlur={(e) => e.target.value !== (value ?? '') && onCommit(e.target.value || null)} />
      ) : (
        <div>{value || <span className="muted">—</span>}</div>
      )}
    </label>
  )
}
