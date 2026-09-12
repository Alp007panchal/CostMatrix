import { Fragment, useState } from 'react'
import type { BoardAnswers, BoardLine, BoardProposal } from '../../lib/database.types'
import { applyBoard, proposeBoard } from './api'
import {
  answersProblem, bySection, describeBoard, emptyAnswers, gapsSentence, linesToApply, notExact,
  toQuestionPayload,
} from './board'
import { BoardQuestions } from './BoardQuestions'

/**
 * The guided board configurator (roadmap 3.1): answer what the board is, and the
 * kits it needs are proposed at quantities. It proposes and a person applies —
 * the quantities are editable first, and what is added goes through the ordinary
 * kit function, into its section, priced and frozen like anything hand-added.
 *
 * A non-standard board is still built kit by kit, as it always was; this is for
 * the standard ones, which is most of them.
 */
export function BoardCard({
  panelId, hasLines, onApplied,
}: {
  panelId: string
  /** Already has kits on it: configuring adds to them rather than starting clean. */
  hasLines: boolean
  onApplied: () => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [answers, setAnswers] = useState<BoardAnswers>(emptyAnswers)
  const [proposal, setProposal] = useState<BoardProposal | null>(null)
  const [lines, setLines] = useState<BoardLine[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (!open) {
    return (
      <button style={{ marginTop: '.5rem', fontSize: '.8125rem' }} onClick={() => setOpen(true)}>
        Configure this board
      </button>
    )
  }

  const problem = answersProblem(answers)

  const propose = () => {
    setBusy(true); setError(null); setDone(null)
    proposeBoard(panelId, toQuestionPayload(answers))
      .then((p) => { setProposal(p); setLines(p.lines) })
      .catch((e: unknown) => { setProposal(null); setLines([]); setError(String(e)) })
      .finally(() => setBusy(false))
  }

  const apply = () => {
    if (!proposal) return
    setBusy(true); setError(null)
    applyBoard(panelId, linesToApply(lines), proposal.parameters)
      .then(async () => {
        setDone(`${describeBoard(lines)} added to this panel.`)
        setProposal(null); setLines([]); setAnswers(emptyAnswers())
        await onApplied()
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  const setQuantity = (assemblyId: string, section: string, quantity: number) =>
    setLines(lines.map((l) =>
      l.assembly_id === assemblyId && l.section === section ? { ...l, quantity } : l))

  return (
    <div style={{ marginTop: '.5rem', borderTop: '1px solid var(--line)', paddingTop: '.5rem' }}>
      <div className="spread">
        <strong style={{ fontSize: '.9rem' }}>Configure this board</strong>
        <button onClick={() => { setOpen(false); setProposal(null); setError(null); setDone(null) }}>Done</button>
      </div>
      {hasLines && (
        <p className="muted" style={{ fontSize: '.75rem', margin: '.3rem 0 0' }}>
          This panel already has kits on it. What you apply is <em>added</em> to them; nothing here
          removes anything.
        </p>
      )}

      <BoardQuestions answers={answers} onChange={setAnswers} />

      <div className="row" style={{ marginTop: '.6rem', gap: '.4rem' }}>
        <button className="primary" disabled={busy || problem !== null} onClick={propose}>
          {busy ? 'Working…' : 'Work the board out'}
        </button>
        {problem && <span className="muted" style={{ fontSize: '.8125rem' }}>{problem}</span>}
      </div>

      {error && <p className="error">{error}</p>}
      {done && <p className="muted">{done}</p>}

      {proposal && (
        <>
          <div className="table-wrap" style={{ marginTop: '.6rem' }}>
            <table>
              <thead>
                <tr><th>Kit</th><th>Why</th><th className="right">How many</th></tr>
              </thead>
              <tbody>
                {bySection(lines).map((group) => (
                  <Fragment key={group.section}>
                    <tr style={{ background: 'var(--tint, #f3f4f6)' }}>
                      <td colSpan={3} style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>
                        {group.section}
                      </td>
                    </tr>
                    {group.lines.map((line) => (
                      <tr key={`${line.section}-${line.assembly_id}`}>
                        <td>
                          {line.name}
                          {line.note && (
                            <div className="error" style={{ fontSize: '.75rem' }}>{line.note}</div>
                          )}
                        </td>
                        <td className="muted" style={{ fontSize: '.8125rem' }}>{line.why}</td>
                        <td className="right">
                          <input
                            type="number" min="0" step="1" style={{ width: '4.5rem', textAlign: 'right' }}
                            aria-label={`How many ${line.name}`}
                            value={line.quantity}
                            onChange={(e) => setQuantity(line.assembly_id, line.section, Number(e.target.value))}
                          />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {gapsSentence(proposal) && (
            <p className="error" style={{ fontSize: '.8125rem' }}>
              Not covered — {gapsSentence(proposal)}
            </p>
          )}
          {notExact(lines).length > 0 && (
            <p className="muted" style={{ fontSize: '.8125rem' }}>
              {notExact(lines).length === 1 ? 'One kit is' : `${notExact(lines).length} kits are`} bigger
              than what was asked for: the library had nothing nearer.
            </p>
          )}

          <div className="row" style={{ marginTop: '.5rem', gap: '.4rem' }}>
            <button className="primary" disabled={busy || linesToApply(lines).length === 0} onClick={apply}>
              Add {describeBoard(lines)} to this panel
            </button>
            <span className="muted" style={{ fontSize: '.75rem' }}>
              Each kit priced and frozen as it is added, exactly as if you had picked it yourself.
            </span>
          </div>
        </>
      )}
    </div>
  )
}
