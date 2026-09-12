import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Kit } from '../../lib/database.types'
import { listKitParameters } from '../library/kits-api'
import { answerProblems, startingAnswers } from '../library/kit-parameters'

/**
 * Choose a kit the way the costing team thinks: kit group, then rating, then
 * the kit itself (main device and poles shown), then how many.
 *
 * A kit that asks for parameters (roadmap 3.3) asks here, with its own defaults
 * filled in: the quantities of its lines are worked out from the answers, so
 * they are wanted before it can be added.
 */
export function KitPicker({
  kits,
  onAdd,
}: {
  kits: Kit[]
  onAdd: (kitId: string, qty: number, params: Record<string, string> | null) => Promise<void>
}) {
  const [group, setGroup] = useState('')
  const [rating, setRating] = useState('')
  const [choice, setChoice] = useState('')
  const [qty, setQty] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = useMemo(() => kits.filter((k) => k.is_active), [kits])
  const groups = useMemo(
    () => Array.from(new Set(active.map((k) => k.group_name ?? 'No group'))).sort(),
    [active],
  )
  const inGroup = active.filter((k) => (k.group_name ?? 'No group') === group)
  const ratings = Array.from(
    new Set(inGroup.filter((k) => k.rating != null).map((k) => `${k.rating} ${k.rating_unit ?? ''}`.trim())),
  ).sort((a, b) => parseFloat(a) - parseFloat(b))
  const hasUnrated = inGroup.some((k) => k.rating == null)
  const candidates = inGroup.filter((k) =>
    rating === '' ? true : rating === '—' ? k.rating == null : `${k.rating} ${k.rating_unit ?? ''}`.trim() === rating,
  )
  const chosen = candidates.find((k) => k.id === choice)

  // Only the chosen kit's parameters, and only once one is chosen: almost every
  // kit in the library has none, and this must stay out of the way of those.
  const parameters = useQuery({
    queryKey: ['kit-parameters', choice],
    queryFn: () => listKitParameters(choice),
    enabled: Boolean(choice),
  })
  const wanted = parameters.data ?? []
  const [answers, setAnswers] = useState<Record<string, string>>({})
  useEffect(() => { setAnswers(startingAnswers(wanted)) }, [choice, parameters.dataUpdatedAt])
  const problems = wanted.length > 0 ? answerProblems(wanted, answers) : []

  return (
    <div style={{ marginTop: '.75rem' }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select value={group} style={{ flex: 1, minWidth: '9rem' }} onChange={(e) => { setGroup(e.target.value); setRating(''); setChoice('') }}>
          <option value="">Kit group…</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={rating} disabled={!group} style={{ width: '8rem' }} onChange={(e) => { setRating(e.target.value); setChoice('') }}>
          <option value="">Any rating</option>
          {ratings.map((r) => <option key={r} value={r}>{r}</option>)}
          {hasUnrated && <option value="—">No rating</option>}
        </select>
        <select value={choice} disabled={!group} style={{ flex: 3, minWidth: '14rem' }} onChange={(e) => setChoice(e.target.value)}>
          <option value="">{group ? `Kit (${candidates.length})…` : 'Kit…'}</option>
          {candidates.map((k) => (
            <option key={k.id} value={k.id} disabled={k.has_unpriced_part}>
              {k.name}{k.poles ? ` · ${k.poles}P` : ''}{k.main_device_code ? ` · ${k.main_device_code}` : ''}
              {k.company_id ? ' (yours)' : ''}{k.has_unpriced_part ? ' — unpriced part' : ''}
            </option>
          ))}
        </select>
        <input type="number" step="1" min="1" value={qty} style={{ width: '5rem' }} aria-label="Quantity" onChange={(e) => setQty(e.target.value)} />
        <button
          className="primary"
          disabled={!choice || busy || problems.length > 0}
          onClick={() => {
            setBusy(true); setError(null)
            onAdd(choice, Number(qty) || 1, wanted.length > 0 ? answers : null)
              .then(() => { setChoice(''); setQty('1'); setAnswers({}) })
              .catch((e: unknown) => setError(String(e)))
              .finally(() => setBusy(false))
          }}
        >
          {busy ? 'Adding…' : 'Add kit'}
        </button>
      </div>

      {wanted.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', marginTop: '.4rem' }}>
          <span className="muted" style={{ fontSize: '.8125rem' }}>This kit asks for</span>
          {wanted.map((p) => (
            <label key={p.id} className="row" style={{ gap: '.3rem', fontSize: '.8125rem' }}>
              <span className="muted">{p.name.replace(/_/g, ' ')}</span>
              <input
                value={answers[p.name] ?? ''}
                aria-label={p.name}
                style={{ width: '5.5rem' }}
                onChange={(e) => setAnswers((a) => ({ ...a, [p.name]: e.target.value }))}
              />
              {p.unit && <span className="muted">{p.unit}</span>}
            </label>
          ))}
          <span className="muted" style={{ fontSize: '.75rem', width: '100%' }}>
            The line quantities are worked out from these — busbar metres, steps, and the like.
          </span>
        </div>
      )}
      {problems.length > 0 && <p className="error" style={{ fontSize: '.8125rem' }}>{problems.join('. ')}.</p>}
      {chosen && (
        <p className="muted" style={{ margin: '.3rem 0 0', fontSize: '.8125rem' }}>
          {chosen.line_count} line{chosen.line_count === 1 ? '' : 's'}
          {chosen.main_device_name ? `; main device ${chosen.main_device_name}` : ''}.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
