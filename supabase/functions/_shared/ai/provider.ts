/**
 * The one seam between CostMatrix and whichever model it talks to (AI spec A1).
 *
 * Everything above this file — the tools, the context, the loop, the Edge
 * Function — speaks these shapes and nothing else. A provider is added by
 * implementing `Provider`, never by touching a feature. The shapes are
 * deliberately not a vendor SDK's types: the whole point of the seam is that
 * the fake provider in fake.ts and the Anthropic adapter in anthropic.ts are
 * interchangeable to everything that uses them.
 *
 * No Deno, no browser, no network in this file: it runs in the Edge Function and
 * in vitest alike.
 */

export type Role = 'user' | 'assistant'

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface ProviderMessage {
  role: Role
  content: ContentPart[]
}

/** A tool as the model sees it: name, what it does, and the JSON Schema of its input. */
export interface ToolSpec {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface Usage {
  input_tokens: number
  output_tokens: number
  /** Served from cache, where the provider reports it. */
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/** Why the model stopped. `refusal` is a safety decline, never an error. */
export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other'

export type ProviderEvent =
  | { type: 'text'; text: string }
  | { type: 'final'; content: ContentPart[]; stop_reason: StopReason; usage: Usage; model: string }

export interface CompleteRequest {
  system: string
  messages: ProviderMessage[]
  tools: ToolSpec[]
  maxTokens: number
}

export interface Provider {
  /** A short name for the log: anthropic, fake. */
  readonly name: string
  /** The model name as configured, recorded on every message row. */
  readonly model: string
  /** Streams text as it arrives, then exactly one `final` event. */
  complete(request: CompleteRequest): AsyncIterable<ProviderEvent>
  /** What the turn cost in US dollars, from the provider's price list. */
  costUsd(usage: Usage): number
}

/**
 * A failure talking to the provider, in one plain sentence for the screen. The
 * adapter maps its SDK's typed errors onto this; nothing above it needs to know
 * the SDK exists.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    /** `retryable` means the same request may work in a moment: rate limit, outage. */
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}
