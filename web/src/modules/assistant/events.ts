import type { AssistantEntityType } from '../../lib/database.types'

/**
 * The assistant's answer arrives as server-sent events from the Edge Function.
 * This file is the whole vocabulary of that stream plus the plain-words rules
 * for failures — no React, no Supabase, so the tests read it directly.
 *
 * Every sentence a person may see when a call fails lives in `reasonFor`. The
 * owner's rule: a failure says what happened and what to do about it, never
 * "something went wrong".
 */

export type FailureCode =
  // from the database, before any model is called
  | 'switched_off' | 'no_budget' | 'budget_spent' | 'too_many'
  // from the provider
  | 'no_credit' | 'bad_key' | 'unknown_model' | 'not_allowed' | 'rate_limit' | 'unreachable' | 'bad_request'
  // neither: the function itself, or the network
  | 'offline' | 'unknown'

export type AssistantEvent =
  | { type: 'start'; conversation_id: string; message_id: string; warning: string | null }
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; is_error: boolean; chars: number }
  | { type: 'proposal'; proposal_id: string }
  | { type: 'refused'; text: string }
  | { type: 'error'; text: string; retryable?: boolean; code?: FailureCode }
  | {
      type: 'done'
      stop: string
      steps: number
      usage: { input_tokens: number; output_tokens: number }
      cost_usd: number
      latency_ms: number
      proposal_ids: string[]
      model: string | null
    }

export interface AskInput {
  entityType: AssistantEntityType
  entityId: string
  message: string
  task: 'draft' | 'review' | 'question'
  conversationId?: string | null
}

/** A failure as the panel shows it: one sentence, and what to do next. */
export interface Failure {
  code: FailureCode
  /** What happened, in the team's words. */
  text: string
  /** What to do about it, when there is something. */
  remedy: string | null
  /** True when trying the same thing again in a moment may work. */
  retryable: boolean
}

const REMEDIES: Record<FailureCode, { text?: string; remedy: string | null; retryable?: boolean }> = {
  no_credit: {
    text: 'The assistant could not answer: the Anthropic account has no credit left.',
    remedy: 'An administrator tops it up at console.anthropic.com → Billing. Nothing in CostMatrix needs changing, and nothing has been lost.',
  },
  bad_key: {
    text: 'The assistant could not answer: Anthropic refused the key.',
    remedy: 'An administrator checks ANTHROPIC_API_KEY in the Supabase project’s Edge Function secrets.',
  },
  unknown_model: {
    text: 'The assistant could not answer: the model it is set to use does not exist, or this account may not use it.',
    remedy: 'An administrator checks the AI_MODEL and AI_MODEL_FAST settings on the function.',
  },
  not_allowed: {
    text: 'The assistant could not answer: the Anthropic account is not permitted to do this.',
    remedy: 'An administrator checks the key’s workspace and its permissions.',
  },
  switched_off: { remedy: 'The master administrator switches it on for your company.' },
  no_budget: { remedy: 'Your company administrator sets a monthly token budget on the Assistant screen.' },
  budget_spent: { remedy: 'It resets on the 1st; your company administrator can raise it on the Assistant screen.' },
  too_many: { remedy: 'Wait a few seconds and ask again.', retryable: true },
  rate_limit: { remedy: 'Try again in a moment.', retryable: true },
  unreachable: { remedy: 'Try again in a moment; nothing has been changed.', retryable: true },
  bad_request: { remedy: 'Tell the administrator what you asked for: this one is a fault in the app, not a setting.' },
  offline: {
    text: 'Could not reach CostMatrix’s server to ask the assistant.',
    remedy: 'Check your connection and try again.',
    retryable: true,
  },
  unknown: { remedy: null },
}

/**
 * Turns whatever came back — a refusal from the database, a provider failure, a
 * dropped connection — into the sentence and the remedy the panel shows. The
 * server's own words are preferred when it sent any; the remedy is ours.
 */
export function reasonFor(code: FailureCode | undefined, serverText?: string | null): Failure {
  const known = code && code in REMEDIES ? (code as FailureCode) : 'unknown'
  const entry = REMEDIES[known]
  const text = (serverText ?? '').trim() || entry.text || 'The assistant could not answer, and did not say why.'
  return { code: known, text, remedy: entry.remedy, retryable: entry.retryable ?? false }
}

/** Parses one SSE body chunk into whole events, keeping any half-line for next time. */
export function parseSse(buffer: string): { events: AssistantEvent[]; rest: string } {
  const events: AssistantEvent[] = []
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''
  for (const part of parts) {
    for (const line of part.split('\n')) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      try {
        events.push(JSON.parse(payload) as AssistantEvent)
      } catch {
        // A line that is not JSON is not an event. Ignoring it is better than
        // throwing away the rest of a good answer.
      }
    }
  }
  return { events, rest }
}

/** The buttons above the prompt box (AI spec §3.1), by what the panel is open on. */
export function suggestedActions(
  entityType: AssistantEntityType,
  opts: { hasDocuments: boolean; hasLines: boolean },
): { label: string; task: 'draft' | 'review' | 'question'; message: string; hint?: string }[] {
  const draft = {
    label: 'Draft this costing from the attached documents',
    task: 'draft' as const,
    message: 'Draft this costing from the attached documents. List anything you could not match.',
    ...(opts.hasDocuments ? {} : { hint: 'Attach the specification first — the Files card above.' }),
  }
  const review = {
    label: 'Review before submission',
    task: 'review' as const,
    message: 'Review this costing before it is submitted. Most serious first.',
    ...(opts.hasLines ? {} : { hint: 'There is nothing costed to review yet.' }),
  }
  const ask = {
    label: 'What kits match a 630 A outgoer?',
    task: 'question' as const,
    message: 'What kits match a 630 A outgoer?',
  }
  return entityType === 'enquiry' ? [draft, ask] : [draft, review, ask]
}
