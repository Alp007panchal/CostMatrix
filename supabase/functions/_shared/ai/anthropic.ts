import Anthropic from '@anthropic-ai/sdk'
import {
  ProviderError,
  type CompleteRequest,
  type ContentPart,
  type Provider,
  type ProviderEvent,
  type StopReason,
  type Usage,
} from './provider.ts'

/**
 * Claude, through the official SDK (AI spec A1: Anthropic first).
 *
 * The only file that knows the SDK exists. It translates the provider-neutral
 * shapes in provider.ts to and from the SDK's, streams text as it arrives, and
 * maps the SDK's typed errors onto one plain sentence.
 *
 * Model names come from configuration, never from here (spec §4): the Edge
 * Function reads AI_MODEL and passes it in. The default below is only what a
 * missing setting falls back to.
 *
 * No Deno in this file either — the API key is handed in — so it typechecks
 * in CI alongside everything else. What CI cannot do is call Anthropic, so the
 * request shape here is the one thing in this PR that is verified only by the
 * first real run on staging.
 */

export const DEFAULT_MODEL = 'claude-opus-5'
export const DEFAULT_FAST_MODEL = 'claude-haiku-4-5'

/** US dollars per million tokens, input and output. Used for the cost column only. */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}

export interface AnthropicOptions {
  apiKey: string
  model?: string
  /**
   * Server-side refusal fallbacks: if the model declines a request on safety
   * grounds, the API re-runs it on a fallback model inside the same call. On by
   * default, as the current guidance for this model recommends. AI_FALLBACKS=off
   * turns it off if the beta ever misbehaves — one setting, no redeploy.
   */
  fallbacks?: boolean
}

export class AnthropicProvider implements Provider {
  readonly name = 'anthropic'
  readonly model: string
  private readonly client: Anthropic
  private readonly fallbacks: boolean

  constructor(options: AnthropicOptions) {
    if (!options.apiKey) throw new ProviderError('ANTHROPIC_API_KEY is not set on the function', false)
    this.client = new Anthropic({ apiKey: options.apiKey })
    this.model = options.model || DEFAULT_MODEL
    this.fallbacks = options.fallbacks ?? true
  }

  async *complete(request: CompleteRequest): AsyncIterable<ProviderEvent> {
    const params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: request.maxTokens,
      // Stable first, so the prefix caches: the system prompt and the tool list
      // do not change between turns of one conversation.
      system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
      tools: request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Beta.Messages.BetaTool.InputSchema,
      })),
      messages: request.messages.map(toSdkMessage),
    }
    if (this.fallbacks) {
      // The scalar form routes by refusal category, so there is no model list to
      // keep current. Its beta header is the 07-01 one; the array form uses 06-01.
      params.betas = ['server-side-fallback-2026-07-01']
      params.fallbacks = 'default'
    }

    let stream: ReturnType<typeof this.client.beta.messages.stream>
    try {
      stream = this.client.beta.messages.stream(params)
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text }
        }
      }
    } catch (error) {
      throw translate(error)
    }

    let message: Anthropic.Beta.Messages.BetaMessage
    try {
      message = await stream.finalMessage()
    } catch (error) {
      throw translate(error)
    }

    yield {
      type: 'final',
      content: fromSdkContent(message.content),
      stop_reason: mapStop(message.stop_reason),
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      },
      model: message.model,
    }
  }

  costUsd(usage: Usage): number {
    const price = PRICES[this.model] ?? PRICES[DEFAULT_MODEL]!
    // Cached reads are billed at a tenth; the uncached input at full rate.
    const cached = usage.cache_read_input_tokens ?? 0
    const uncached = Math.max(usage.input_tokens - cached, 0)
    return (uncached * price.input + cached * price.input * 0.1 + usage.output_tokens * price.output) / 1_000_000
  }
}

function toSdkMessage(message: { role: 'user' | 'assistant'; content: ContentPart[] }): Anthropic.Beta.Messages.BetaMessageParam {
  return {
    role: message.role,
    content: message.content.map((part): Anthropic.Beta.Messages.BetaContentBlockParam => {
      switch (part.type) {
        case 'text':
          return { type: 'text', text: part.text }
        case 'tool_use':
          return { type: 'tool_use', id: part.id, name: part.name, input: part.input }
        case 'tool_result':
          return part.is_error
            ? { type: 'tool_result', tool_use_id: part.tool_use_id, content: part.content, is_error: true }
            : { type: 'tool_result', tool_use_id: part.tool_use_id, content: part.content }
      }
    }),
  }
}

function fromSdkContent(blocks: Anthropic.Beta.Messages.BetaContentBlock[]): ContentPart[] {
  const parts: ContentPart[] = []
  for (const block of blocks) {
    if (block.type === 'text') parts.push({ type: 'text', text: block.text })
    else if (block.type === 'tool_use') {
      // Always parsed, never string-matched: the escaping of the input varies.
      parts.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input as Record<string, unknown> })
    }
    // Thinking blocks are not replayed in phase 1 and fallback blocks are a log
    // matter; neither is content the loop acts on.
  }
  return parts
}

function mapStop(reason: string | null): StopReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn'
    case 'tool_use':
      return 'tool_use'
    case 'max_tokens':
      return 'max_tokens'
    case 'refusal':
      return 'refusal'
    default:
      return 'other'
  }
}

/**
 * One plain sentence per kind of failure, with what to do about it, because the
 * panel shows this to a costing engineer (not a developer) and "a generic error"
 * was the owner's specific objection. Most specific class first, as the SDK's
 * own guidance has it; 402 has no class of its own, so it is matched on status.
 */
function translate(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error

  if (error instanceof Anthropic.AuthenticationError) {
    return new ProviderError(
      'The assistant’s API key was refused. Check ANTHROPIC_API_KEY in the Supabase project’s Edge Function secrets.',
      false,
      'bad_key',
    )
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new ProviderError(
      `The model “${DEFAULT_MODEL_HINT(error)}” was not found, or this Anthropic account may not use it. Check the AI_MODEL setting.`,
      false,
      'unknown_model',
    )
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError(
      'The Anthropic account is not permitted to do this. Check the key’s workspace and permissions.',
      false,
      'not_allowed',
    )
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError('The model is busy right now. Try again in a moment.', true, 'rate_limit')
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError('Could not reach the model. Try again in a moment.', true, 'unreachable')
  }
  if (error instanceof Anthropic.APIError) {
    // 402, and any 400 whose body says the balance is too low: the commonest
    // first-run failure, and nothing about the app is wrong when it happens.
    if (error.status === 402 || isCredit(error)) {
      return new ProviderError(
        'The Anthropic account has no credit left, so the model would not answer. Top it up at console.anthropic.com → Billing; nothing else needs changing.',
        false,
        'no_credit',
      )
    }
    if (error instanceof Anthropic.BadRequestError) {
      return new ProviderError(`The model refused the request as malformed: ${error.message}`, false, 'bad_request')
    }
    const status = error.status ?? 0
    return new ProviderError(
      status >= 500
        ? 'The model had a problem at its end. Try again in a moment.'
        : `The model returned an error (${status || '?'}): ${error.message}`,
      status >= 500,
      status >= 500 ? 'unreachable' : 'unknown',
    )
  }
  return new ProviderError(error instanceof Error ? error.message : String(error), false, 'unknown')
}

/** Anthropic's own words for a spent balance, whatever status it arrives under. */
function isCredit(error: { message?: string; type?: string | null }): boolean {
  if (error.type === 'billing_error') return true
  const message = (error.message ?? '').toLowerCase()
  return message.includes('credit balance') || message.includes('insufficient credit') || message.includes('billing')
}

/** The model name out of the error's own message, so the sentence names it. */
function DEFAULT_MODEL_HINT(error: { message?: string }): string {
  const found = /model:\s*([A-Za-z0-9._-]+)/.exec(error.message ?? '')
  return found?.[1] ?? 'the configured one'
}
