import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AssistantProposal, QuotationWording } from '../../lib/database.types'
import { ask, getAllowance, listProposals, rejectProposal, useQuotationWording } from '../assistant/api'
import type { AssistantEvent, Failure } from '../assistant/events'
import { isOpen } from '../assistant/proposal-rows'
import { draftedLines, latestWording, replacedCount, useWording, type LetterFields } from './letter-draft'

/**
 * "Draft the wording" on the Release page (roadmap 3.7, migration 0133): the
 * assistant writes the subject, the opening, the closing and the notes on offer
 * from this costing, and the approver decides whether to take them.
 *
 * Three things it deliberately does not do. It never saves: what it fills in is
 * the same form the approver was already editing, and pressing **Release** is
 * still the only thing that releases a quotation. It never touches a price, a
 * term, the customer or the signatory — the proposal is four pieces of text, and
 * the Edge Function refuses one that names a figure. And it never overwrites
 * silently: `draftedLines` marks every field where the approver's own words
 * would go, and says how many, before the button is pressed.
 *
 * It rides the `assistant` switch, which is off by default and switched on only
 * by the master administrator. Off, this card is not rendered at all.
 */
export function LetterDraft({
  costingId, form, onUse,
}: {
  costingId: string
  form: LetterFields
  onUse: (next: LetterFields) => void
}) {
  const allowance = useQuery({ queryKey: ['assistant-allowance'], queryFn: getAllowance })
  const proposals = useQuery({
    queryKey: ['assistant-proposals', 'costing', costingId],
    queryFn: () => listProposals('costing', costingId),
  })

  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState('')
  const [failure, setFailure] = useState<Failure | null>(null)

  const draft = async () => {
    setBusy(true); setLive(''); setFailure(null)
    const onEvent = (event: AssistantEvent) => {
      if (event.type === 'text') setLive((t) => t + event.text)
      else if (event.type === 'refused') setLive((t) => `${t}\n\n${event.text}`)
    }
    const problem = await ask({
      entityType: 'costing',
      entityId: costingId,
      task: 'letter',
      message: 'Draft the wording of the cover letter for this quotation.',
      conversationId: null,
    }, onEvent)
    setFailure(problem)
    setBusy(false)
    await proposals.refetch()
  }

  const decide = async (take: boolean, proposal: AssistantProposal, wording: QuotationWording) => {
    setBusy(true); setFailure(null)
    try {
      if (take) {
        onUse(useWording(wording, form))
        await useQuotationWording(proposal.id)
      } else {
        await rejectProposal(proposal.id, 'The approver preferred their own wording')
      }
      setLive('')
      await proposals.refetch()
    } catch (e) {
      setFailure({ code: 'unknown', text: String(e), remedy: null, retryable: false })
    }
    setBusy(false)
  }

  if (!allowance.data?.enabled) return null

  const proposal = latestWording((proposals.data ?? []).filter(isOpen))
  const wording = (proposal?.payload ?? {}) as QuotationWording
  const lines = proposal ? draftedLines(wording, form) : []
  const replaces = proposal ? replacedCount(wording, form) : 0

  return (
    <div style={{ borderTop: '1px solid var(--line, #ddd)', marginTop: '.75rem', paddingTop: '.75rem' }}>
      {!proposal && (
        <>
          <div className="spread">
            <p className="muted" style={{ margin: 0 }}>
              The assistant can draft these four boxes from the costing. It cannot quote a price, a
              discount or a delivery date, and nothing is saved until you release.
            </p>
            <button disabled={busy} onClick={() => void draft()}>{busy ? 'Drafting…' : 'Draft the wording'}</button>
          </div>
          {busy && !live && <p className="muted">Reading the costing and writing…</p>}
          {live && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{live}</p>}
        </>
      )}

      {proposal && (
        <>
          <h3 style={{ margin: '0 0 .5rem' }}>The assistant’s wording</h3>
          {lines.length === 0 && <p className="muted">It wrote nothing it was willing to stand behind.</p>}
          {lines.map((line) => (
            <div key={line.key} style={{ marginBottom: '.5rem' }}>
              <strong style={{ fontWeight: 550 }}>{line.label}</strong>
              {line.replaces && <span className="error" style={{ marginLeft: '.5rem', fontSize: '.8125rem' }}>replaces what you wrote</span>}
              <p style={{ whiteSpace: 'pre-wrap', margin: '.15rem 0 0' }}>{line.text}</p>
            </div>
          ))}
          {replaces > 0 && (
            <p className="muted">
              Using this replaces {replaces} line{replaces === 1 ? '' : 's'} you had already written.
            </p>
          )}
          <div className="row end">
            <button disabled={busy} onClick={() => void decide(false, proposal, wording)}>Discard</button>
            <button className="primary" disabled={busy || lines.length === 0} onClick={() => void decide(true, proposal, wording)}>
              Use this wording
            </button>
          </div>
        </>
      )}

      {failure && (
        <div className="error" role="alert">
          <p style={{ margin: 0 }}>{failure.text}</p>
          {failure.remedy && <p className="muted" style={{ margin: '.25rem 0 0' }}>{failure.remedy}</p>}
        </div>
      )}
    </div>
  )
}
