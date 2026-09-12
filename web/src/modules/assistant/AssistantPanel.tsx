import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { listDocuments } from '../documents/api'
import { listKits } from '../costing/api'
import type { AssistantEntityType, CostingPanel } from '../../lib/database.types'
import { ask, getAllowance, listConversations, listMessages, listProposals, type ApplyResult } from './api'
import { suggestedActions, type AssistantEvent, type Failure } from './events'
import { isOpen } from './proposal-rows'
import { ProposalCard } from './ProposalCard'
import { ReviewCard } from './ReviewCard'

/**
 * The Assistant panel (AI spec §3.1), the same component on the enquiry and the
 * costing screen: the conversation for this record, the suggested actions, the
 * prompt box, and whatever proposal is open.
 *
 * Collapsed until asked for, so a screen that nobody wants the assistant on
 * costs nothing. When the assistant is switched off, the panel says so in one
 * sentence and offers nothing else.
 */
export function AssistantPanel({
  entityType, entityId, panels = [], canApply, onApplied,
}: {
  entityType: AssistantEntityType
  entityId: string
  /** The costing's panels, so a review's fix knows where to go. */
  panels?: CostingPanel[]
  canApply: boolean
  onApplied?: (result: ApplyResult) => void
}) {
  const { hasRole, isMasterAdmin } = useSession()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const mayUse = hasRole('costing_engineer') || hasRole('approver') || isMasterAdmin

  const allowance = useQuery({ queryKey: ['assistant-allowance'], queryFn: getAllowance, enabled: open })
  const conversations = useQuery({
    queryKey: ['assistant-conversations', entityType, entityId],
    queryFn: () => listConversations(entityType, entityId),
    enabled: open,
  })
  const conversationId = conversations.data?.[0]?.id ?? null
  const messages = useQuery({
    queryKey: ['assistant-messages', conversationId],
    queryFn: () => listMessages(conversationId as string),
    enabled: open && Boolean(conversationId),
  })
  const proposals = useQuery({
    queryKey: ['assistant-proposals', entityType, entityId],
    queryFn: () => listProposals(entityType, entityId),
    enabled: open,
  })
  const documents = useQuery({
    queryKey: ['documents', entityType, entityId],
    queryFn: () => listDocuments(entityType, entityId),
    enabled: open,
  })
  const kits = useQuery({ queryKey: ['kits'], queryFn: listKits, enabled: open })

  const [prompt, setPrompt] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [live, setLive] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [failure, setFailure] = useState<Failure | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  // Keep the newest line in view. Guarded because not every environment has
  // scrollIntoView (jsdom does not), and a missing nicety must not throw.
  useEffect(() => {
    const end = bottom.current
    if (typeof end?.scrollIntoView === 'function') end.scrollIntoView({ block: 'nearest' })
  }, [live, steps.length])

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['assistant-conversations', entityType, entityId] })
    await queryClient.invalidateQueries({ queryKey: ['assistant-proposals', entityType, entityId] })
    await queryClient.invalidateQueries({ queryKey: ['assistant-messages'] })
    await queryClient.invalidateQueries({ queryKey: ['assistant-allowance'] })
  }

  const send = async (message: string, task: 'draft' | 'review' | 'question') => {
    if (!message.trim() || streaming) return
    setStreaming(true); setLive(''); setSteps([]); setFailure(null); setWarning(null)
    const onEvent = (event: AssistantEvent) => {
      if (event.type === 'text') setLive((t) => t + event.text)
      else if (event.type === 'start' && event.warning) setWarning(event.warning)
      else if (event.type === 'tool_call') setSteps((s) => [...s, toolSentence(event.name, event.input)])
      else if (event.type === 'refused') setLive((t) => `${t}\n\n${event.text}`)
    }
    const problem = await ask({ entityType, entityId, message: message.trim(), task, conversationId }, onEvent)
    setFailure(problem)
    setStreaming(false)
    setPrompt('')
    await refresh()
    setLive('')
  }

  if (!mayUse) return null

  const openProposal = (proposals.data ?? []).find(isOpen)
  const actions = suggestedActions(entityType, {
    hasDocuments: (documents.data ?? []).length > 0,
    hasLines: panels.length > 0,
  })

  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Assistant</h2>
        <button onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide' : 'Open'}</button>
      </div>

      {open && (
        <>
          {allowance.data && !allowance.data.enabled && (
            <p className="muted">
              The assistant is switched off for your company. The master administrator can turn it on.
            </p>
          )}
          {allowance.data?.enabled && (
            <>
              <div className="row" style={{ marginTop: '.5rem' }}>
                {actions.map((a) => (
                  <button key={a.label} disabled={streaming || Boolean(a.hint)} title={a.hint} onClick={() => void send(a.message, a.task)}>
                    {a.label}
                  </button>
                ))}
              </div>
              {actions.filter((a) => a.hint).map((a) => (
                <p key={a.label} className="muted" style={{ fontSize: '.8125rem', margin: '.25rem 0 0' }}>{a.hint}</p>
              ))}

              <div style={{ marginTop: '.75rem', maxHeight: '22rem', overflowY: 'auto' }}>
                {(messages.data ?? []).filter((m) => (m.content ?? '').trim()).map((m) => (
                  <p key={m.id} style={{ whiteSpace: 'pre-wrap', margin: '.5rem 0' }}>
                    <strong style={{ fontWeight: 550 }}>{m.role === 'user' ? 'You' : 'Assistant'}: </strong>
                    {m.content}
                  </p>
                ))}
                {steps.map((s, i) => <p key={i} className="muted" style={{ fontSize: '.8125rem', margin: '.2rem 0' }}>{s}</p>)}
                {live && <p style={{ whiteSpace: 'pre-wrap', margin: '.5rem 0' }}><strong style={{ fontWeight: 550 }}>Assistant: </strong>{live}</p>}
                {streaming && !live && <p className="muted">Reading and thinking…</p>}
                <div ref={bottom} />
              </div>

              {warning && <p className="muted">{warning}</p>}
              {failure && (
                <div className="error" role="alert">
                  <p style={{ margin: 0 }}>{failure.text}</p>
                  {failure.remedy && <p className="muted" style={{ margin: '.25rem 0 0' }}>{failure.remedy}</p>}
                </div>
              )}

              <div className="row" style={{ marginTop: '.5rem' }}>
                <textarea
                  placeholder="Ask about this costing, or say what to draft"
                  value={prompt}
                  disabled={streaming}
                  style={{ flex: 1, minHeight: '3.5rem' }}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <button className="primary" disabled={streaming || !prompt.trim()} onClick={() => void send(prompt, 'question')}>
                  {streaming ? 'Asking…' : 'Ask'}
                </button>
              </div>
              <p className="muted" style={{ fontSize: '.75rem' }}>
                The assistant proposes; nothing it suggests changes a costing until you apply it.
              </p>
            </>
          )}

          {openProposal && openProposal.type === 'review' && (
            <ReviewCard
              proposal={openProposal}
              documents={documents.data ?? []}
              panels={panels}
              canApply={canApply}
              onApplied={(r) => { void refresh(); onApplied?.(r) }}
            />
          )}
          {openProposal && openProposal.type !== 'review' && (
            <ProposalCard
              proposal={openProposal}
              documents={documents.data ?? []}
              kits={kits.data ?? []}
              canApply={canApply}
              onApplied={(r) => { void refresh(); onApplied?.(r) }}
            />
          )}
        </>
      )}
    </div>
  )
}

/** What the assistant is doing, in the team's words rather than tool names. */
export function toolSentence(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'get_document_text': return 'Reading an attached document…'
    case 'search_kits': return `Looking for kits${input['q'] ? ` matching “${String(input['q'])}”` : ''}…`
    case 'search_components': return 'Looking through the catalogue…'
    case 'get_kit': return 'Opening a kit…'
    case 'get_costing': return 'Reading this costing…'
    case 'get_enquiry': return 'Reading this enquiry…'
    case 'get_company_policy': return 'Checking your company’s settings…'
    case 'price_preview': return 'Pricing what it has found…'
    case 'create_proposal': return 'Writing up a proposal for you to review…'
    default: return 'Working…'
  }
}
