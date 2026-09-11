import type { CompleteRequest, ContentPart, Provider, ProviderEvent, Usage } from './provider.ts'

/**
 * A provider that says what it is told to say. Used by the tests (spec §9, test
 * 5: "a fake provider adapter passes the same test suite") and available to the
 * Edge Function as `AI_PROVIDER=fake` for a dry run that calls nobody.
 *
 * Each scripted turn is what the model would have answered: some text, some
 * tool calls, or both. Every request it receives is kept, so a test can assert
 * what the loop sent — or that nothing was sent at all (test 6).
 */

export interface ScriptedTurn {
  text?: string
  tool_calls?: { name: string; input: Record<string, unknown> }[]
  /** Defaults to `tool_use` when there are tool calls, else `end_turn`. */
  stop_reason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal'
  usage?: Partial<Usage>
}

export class FakeProvider implements Provider {
  readonly name = 'fake'
  readonly requests: CompleteRequest[] = []
  private turn = 0
  private counter = 0

  constructor(
    private readonly script: ScriptedTurn[],
    readonly model = 'fake-model',
  ) {}

  async *complete(request: CompleteRequest): AsyncIterable<ProviderEvent> {
    this.requests.push(request)
    const scripted = this.script[this.turn] ?? { text: '(the script ran out)' }
    this.turn += 1

    const content: ContentPart[] = []
    if (scripted.text) {
      // Two deltas, so a consumer that concatenates is exercised.
      const half = Math.ceil(scripted.text.length / 2)
      yield { type: 'text', text: scripted.text.slice(0, half) }
      yield { type: 'text', text: scripted.text.slice(half) }
      content.push({ type: 'text', text: scripted.text })
    }
    for (const call of scripted.tool_calls ?? []) {
      this.counter += 1
      content.push({ type: 'tool_use', id: `fake_tool_${this.counter}`, name: call.name, input: call.input })
    }

    const usage: Usage = {
      input_tokens: scripted.usage?.input_tokens ?? 100,
      output_tokens: scripted.usage?.output_tokens ?? 20,
    }
    yield {
      type: 'final',
      content,
      stop_reason: scripted.stop_reason ?? ((scripted.tool_calls?.length ?? 0) > 0 ? 'tool_use' : 'end_turn'),
      usage,
      model: this.model,
    }
  }

  costUsd(): number {
    return 0
  }
}
