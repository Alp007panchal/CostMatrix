import type { ContentPart, Provider, ProviderErrorCode, ProviderMessage, Usage } from './provider.ts'
import { ProviderError } from './provider.ts'
import { TOOL_SPECS, runTool, type Db, type ToolContext } from './tools.ts'

/**
 * The conversation loop: model ⇄ tools, at most `maxSteps` times (AI spec §4).
 *
 * A manual loop rather than a vendor's runner, because the provider is a seam
 * (provider.ts) and the same loop must drive the fake provider in the tests.
 *
 * Limits: a step cap so a confused model cannot run forever; a wall-clock cap
 * for the same reason; every tool call in one turn run together and its results
 * returned together, failures included (`is_error`), because dropping one
 * silently teaches the model to stop calling tools in parallel.
 *
 * Emits events as it goes so the Edge Function can stream them to the panel.
 */

export interface AgentLimits {
  /** Model ⇄ tool round trips. The spec suggests 12. */
  maxSteps: number
  /** Output tokens per model turn. */
  maxTokens: number
  /** Whole run, in milliseconds. */
  maxMillis: number
}

export const DEFAULT_LIMITS: AgentLimits = { maxSteps: 12, maxTokens: 8000, maxMillis: 170_000 }

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; is_error: boolean; chars: number }
  | { type: 'proposal'; proposal_id: string }
  | { type: 'refused'; text: string }
  | { type: 'error'; text: string; retryable: boolean; code: ProviderErrorCode }
  | {
      type: 'done'
      usage: Usage
      steps: number
      stop: 'end_turn' | 'max_steps' | 'max_tokens' | 'refusal' | 'timeout' | 'error'
      /** The assistant's content, for the message row. */
      content: ContentPart[]
      /** Tool calls made and results received, trimmed, for the message row. */
      tool_calls: { name: string; input: Record<string, unknown> }[]
      tool_results: { name: string; is_error: boolean; summary: string }[]
      proposal_ids: string[]
    }

export interface AgentInput {
  provider: Provider
  db: Db
  system: string
  /** Earlier turns of this conversation, oldest first. */
  history: ProviderMessage[]
  userText: string
  context: ToolContext
  /** The stored id of the assistant message being built, so proposals can point at it. */
  messageId: string | null
  limits?: Partial<AgentLimits>
}

export async function* runAgent(input: AgentInput): AsyncIterable<AgentEvent> {
  const limits = { ...DEFAULT_LIMITS, ...input.limits }
  const started = Date.now()
  const messages: ProviderMessage[] = [
    ...input.history,
    { role: 'user', content: [{ type: 'text', text: input.userText }] },
  ]
  const usage: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  const toolCalls: { name: string; input: Record<string, unknown> }[] = []
  const toolResults: { name: string; is_error: boolean; summary: string }[] = []
  const proposalIds: string[] = []
  const finalContent: ContentPart[] = []

  const done = (stop: Extract<AgentEvent, { type: 'done' }>['stop'], steps: number): AgentEvent => ({
    type: 'done',
    usage,
    steps,
    stop,
    content: finalContent,
    tool_calls: toolCalls,
    tool_results: toolResults,
    proposal_ids: proposalIds,
  })

  for (let step = 1; step <= limits.maxSteps; step += 1) {
    if (Date.now() - started > limits.maxMillis) {
      yield { type: 'text', text: '\n\n(I stopped: this is taking too long. Ask again with a narrower question.)' }
      yield done('timeout', step - 1)
      return
    }

    let final: Extract<import('./provider.ts').ProviderEvent, { type: 'final' }> | null = null
    try {
      for await (const event of input.provider.complete({
        system: input.system,
        messages,
        tools: TOOL_SPECS,
        maxTokens: limits.maxTokens,
      })) {
        if (event.type === 'text') yield { type: 'text', text: event.text }
        else final = event
      }
    } catch (error) {
      const e = error instanceof ProviderError ? error : new ProviderError(String(error), false)
      yield { type: 'error', text: e.message, retryable: e.retryable, code: e.code }
      yield done('error', step)
      return
    }
    if (!final) {
      yield { type: 'error', text: 'The model ended without a reply.', retryable: true, code: 'unknown' }
      yield done('error', step)
      return
    }

    addUsage(usage, final.usage)
    finalContent.push(...final.content)

    if (final.stop_reason === 'refusal') {
      yield { type: 'refused', text: 'The model declined to answer this. Nothing has been changed.' }
      yield done('refusal', step)
      return
    }

    const calls = final.content.filter((p): p is Extract<ContentPart, { type: 'tool_use' }> => p.type === 'tool_use')
    if (calls.length === 0) {
      if (final.stop_reason === 'max_tokens') {
        yield { type: 'text', text: '\n\n(My reply was cut short at the length limit.)' }
        yield done('max_tokens', step)
        return
      }
      yield done('end_turn', step)
      return
    }

    // The assistant turn, then every result in ONE user turn.
    messages.push({ role: 'assistant', content: final.content })
    const results: ContentPart[] = []
    for (const call of calls) {
      yield { type: 'tool_call', name: call.name, input: call.input }
      toolCalls.push({ name: call.name, input: call.input })
      const outcome = await runTool(call.name, call.input, input.db, input.context, input.messageId)
      results.push({ type: 'tool_result', tool_use_id: call.id, content: outcome.content, is_error: outcome.is_error })
      toolResults.push({ name: call.name, is_error: outcome.is_error, summary: outcome.content.slice(0, 200) })
      yield { type: 'tool_result', name: call.name, is_error: outcome.is_error, chars: outcome.content.length }
      if (outcome.proposal_id) {
        proposalIds.push(outcome.proposal_id)
        yield { type: 'proposal', proposal_id: outcome.proposal_id }
      }
    }
    messages.push({ role: 'user', content: results })
  }

  yield {
    type: 'text',
    text: `\n\n(I stopped after ${limits.maxSteps} steps without finishing. Nothing has been changed; ask again with a narrower question.)`,
  }
  yield done('max_steps', limits.maxSteps)
}

function addUsage(total: Usage, turn: Usage): void {
  total.input_tokens += turn.input_tokens
  total.output_tokens += turn.output_tokens
  total.cache_read_input_tokens = (total.cache_read_input_tokens ?? 0) + (turn.cache_read_input_tokens ?? 0)
  total.cache_creation_input_tokens = (total.cache_creation_input_tokens ?? 0) + (turn.cache_creation_input_tokens ?? 0)
}
