import { useEffect, useState } from 'react'
import type { GridCell as Cell } from './grid'

/**
 * One quantity in the grid. Blank means the panel does not use that row; typing a
 * figure into a blank cell adds it, clearing a cell removes the line. The edit is
 * committed on blur or Enter, the way the panel editor's fields are.
 */
export function GridCell({
  cell, editable, highlight, inCompare, onCommit,
}: {
  cell: Cell | undefined
  editable: boolean
  /** This row differs from the panel it is being compared with. */
  highlight: boolean
  inCompare: boolean
  onCommit: (typed: number | null) => void
}) {
  const quantity = cell?.quantity ?? 0
  const shown = quantity === 0 ? '' : String(Math.round(quantity * 1000) / 1000)
  const [draft, setDraft] = useState(shown)
  useEffect(() => { setDraft(shown) }, [shown])

  const background = highlight
    ? 'rgba(245, 158, 11, .18)'
    : inCompare
      ? 'rgba(245, 158, 11, .06)'
      : undefined

  if (!editable) {
    return (
      <td className="right" style={{ background }}>
        {shown === '' ? <span className="muted">–</span> : shown}
      </td>
    )
  }

  const commit = () => {
    if (draft.trim() === shown) return
    if (draft.trim() === '') return onCommit(null)
    const typed = Number(draft)
    if (Number.isNaN(typed)) return setDraft(shown)
    onCommit(typed)
  }

  return (
    <td className="right" style={{ background }}>
      <input
        aria-label={cell?.ambiguous ? 'On more than one line' : 'Quantity'}
        value={draft}
        inputMode="decimal"
        style={{ width: '4.5rem', textAlign: 'right' }}
        title={cell?.ambiguous ? 'This panel has it on more than one line; change it in the panel editor.' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </td>
  )
}
