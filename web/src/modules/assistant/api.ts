import { supabase } from '../../lib/supabase'
import type {
  AssistantAllowance, AssistantConversation, AssistantEntityType, AssistantMessage,
  AssistantProposal, AssistantUsage,
} from '../../lib/database.types'
import { parseSse, reasonFor, type AskInput, type AssistantEvent, type Failure } from './events'

/**
 * The assistant, as the screen talks to it: ordinary reads of the conversation,
 * messages and proposals (row-level security shows only your company's), the
 * streaming call to the Edge Function, and the two decisions a person can take
 * on a proposal.
 *
 * Applying goes through one database function (`apply_proposal`, migration 0104)
 * which calls the ordinary engine functions, so a proposed line is priced and
 * frozen exactly as a hand-picked one. Nothing here multiplies anything, and
 * nothing here writes to a costing directly.
 */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

export async function listConversations(
  entityType: AssistantEntityType,
  entityId: string,
): Promise<AssistantConversation[]> {
  const { data, error } = await supabase
    .from('assistant_conversations')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('updated_at', { ascending: false })
  fail('Could not load the assistant’s conversations', error)
  return (data ?? []) as AssistantConversation[]
}

export async function listMessages(conversationId: string): Promise<AssistantMessage[]> {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at')
  fail('Could not load the conversation', error)
  return (data ?? []) as AssistantMessage[]
}

export async function listProposals(
  entityType: AssistantEntityType,
  entityId: string,
): Promise<AssistantProposal[]> {
  const { data, error } = await supabase
    .from('assistant_proposals')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
  fail('Could not load the proposals', error)
  return (data ?? []) as AssistantProposal[]
}

export async function getAllowance(): Promise<AssistantAllowance> {
  const { data, error } = await supabase.rpc('assistant_allowance')
  fail('Could not check whether the assistant is switched on', error)
  return data as AssistantAllowance
}

export async function getUsage(): Promise<AssistantUsage> {
  const { data, error } = await supabase.rpc('assistant_usage')
  fail('Could not load the assistant’s usage', error)
  return data as AssistantUsage
}

// --- asking -----------------------------------------------------------------

/**
 * One turn. Calls the `assistant` function and hands every event to `onEvent`
 * as it arrives, so the reply appears as it is written rather than after a
 * silent minute. `supabase.functions.invoke` buffers the whole body, which
 * would defeat that, so this uses fetch with the session's own token.
 *
 * A failure is never thrown as a raw error: it comes back as a `Failure`, which
 * carries the sentence and the remedy the panel shows (the owner's rule).
 */
export async function ask(input: AskInput, onEvent: (event: AssistantEvent) => void): Promise<Failure | null> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return reasonFor('unknown', 'You are not signed in any more. Sign in again and ask once more.')

  const url = `${import.meta.env['VITE_SUPABASE_URL'] as string}/functions/v1/assistant`
  const apikey = (import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ?? import.meta.env['VITE_SUPABASE_ANON_KEY']) as string

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, apikey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: input.conversationId ?? null,
        entity_type: input.entityType,
        entity_id: input.entityId,
        message: input.message,
        task: input.task,
      }),
    })
  } catch {
    return reasonFor('offline')
  }

  // A refusal (switched off, budget, rate) answers with JSON and a status, not
  // a stream: that is the whole point of deciding before any provider is built.
  if (!response.ok || !response.body) {
    let body: { error?: string; code?: Failure['code'] } = {}
    try {
      body = (await response.json()) as typeof body
    } catch {
      // no body, or not JSON
    }
    return reasonFor(body.code, body.error ?? `The assistant’s server answered ${response.status}.`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let failure: Failure | null = null
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { events, rest } = parseSse(buffer)
    buffer = rest
    for (const event of events) {
      if (event.type === 'error') failure = reasonFor(event.code, event.text)
      onEvent(event)
    }
  }
  const { events } = parseSse(`${buffer}\n\n`)
  for (const event of events) {
    if (event.type === 'error') failure = reasonFor(event.code, event.text)
    onEvent(event)
  }
  return failure
}

// --- deciding ----------------------------------------------------------------

export interface ApplyDecisions {
  /** Which proposed lines to apply, by their place in the proposal. */
  lines?: { panel: number; line: number; kind: 'kit' | 'component'; ref_id: string; qty: number; section?: string }[]
  /** Which finding of a review to apply the fix of. */
  finding?: number
  /** The panel a line change applies to, when the screen knows it. */
  panel_id?: string
  /** The title for a costing created from an enquiry's draft proposal. */
  title?: string
}

export interface ApplyResult {
  costing_id: string
  created_costing: boolean
  status: string
  lines: Record<string, unknown>[]
}

export async function applyProposal(proposalId: string, decisions: ApplyDecisions): Promise<ApplyResult> {
  const { data, error } = await supabase.rpc('apply_proposal', { proposal: proposalId, decisions })
  fail('Could not apply the proposal', error)
  return data as ApplyResult
}

export async function rejectProposal(proposalId: string, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('reject_proposal', { proposal: proposalId, reason })
  fail('Could not reject the proposal', error)
}

// --- the company's settings (the admin screen) --------------------------------

export async function getAssistantOptions(companyId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('company_options')
    .select('key, value')
    .eq('company_id', companyId)
  fail('Could not load the assistant’s settings', error)
  return Object.fromEntries(((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]))
}

/** The master administrator flips `ai_enabled`; a trigger refuses anyone else. */
export async function setAssistantOption(companyId: string, key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from('company_options')
    .update({ value })
    .eq('company_id', companyId)
    .eq('key', key)
  fail('Could not save the setting', error)
}
