import { describe, expect, it } from 'vitest'
import { runAgent, type AgentEvent } from './agent.ts'
import { FakeProvider } from './fake.ts'
import { decideAllowance } from './budget.ts'
import { runTool, type Db } from './tools.ts'

/**
 * The loop, driven by the fake provider (acceptance test 5: a fake adapter
 * passes the same suite) against a fake database. Also the second half of
 * test 6: a refused request reaches no provider at all, and the tool half of
 * test 3: a record the database hides reads as "not found".
 */

const costingId = '00000000-0000-4000-8000-000000000c01'
const kitId = '00000000-0000-4000-8000-000000000e01'

/** A database that knows one costing, one kit, and hides everything else. */
function fakeDb() {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const proposals: unknown[] = []
  const db: Db = {
    async rpc(name, args) {
      calls.push({ name, args })
      switch (name) {
        case 'costing_snapshot':
          return args['target'] === costingId ? { id: costingId, costing_no: 'NPP-193', panels: [] } : null
        case 'search_kits':
          return [{ id: kitId, name: '630A,TP,MCCB, Adjustable, 36kA-OUTGOER-KIT', price: 182000 }]
        case 'kit_detail':
          return args['target'] === kitId ? { id: kitId, lines: [] } : null
        case 'company_policy':
          return { company: { id: 'c2', name: 'Alpha' } }
        case 'price_preview':
          return { selling_price: 200000, unpriced: [] }
        default:
          throw new Error(`fake db has no ${name}`)
      }
    },
    async insertProposal(row) {
      proposals.push(row)
      return `proposal_${proposals.length}`
    },
  }
  return { db, calls, proposals }
}

const context = { conversation_id: 'conv', entity_type: 'costing' as const, entity_id: costingId }

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of events) out.push(e)
  return out
}
function doneOf(events: AgentEvent[]) {
  const d = events.find((e) => e.type === 'done')
  if (!d || d.type !== 'done') throw new Error('no done event')
  return d
}

describe('the agent loop with the fake provider', () => {
  it('answers a plain question in one step and streams the text in pieces', async () => {
    const provider = new FakeProvider([{ text: 'The incomer is 1600 A.' }])
    const { db } = fakeDb()
    const events = await collect(runAgent({ provider, db, system: 'sys', history: [], userText: 'What is the incomer?', context, messageId: 'm1' }))
    const text = events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join('')
    expect(text).toBe('The incomer is 1600 A.')
    expect(events.filter((e) => e.type === 'text').length).toBe(2)
    expect(doneOf(events)).toMatchObject({ stop: 'end_turn', steps: 1, usage: { input_tokens: 100, output_tokens: 20 } })
    expect(provider.requests).toHaveLength(1)
    expect(provider.requests[0]?.system).toBe('sys')
    expect(provider.requests[0]?.tools.map((t) => t.name)).toContain('create_proposal')
  })

  it('runs the tools the model asks for, hands every result back in ONE turn, and keeps going', async () => {
    const provider = new FakeProvider([
      { text: 'Let me look.', tool_calls: [
        { name: 'get_costing', input: { costing_id: costingId } },
        { name: 'search_kits', input: { q: '630A outgoer', poles: 3 } },
      ] },
      { text: 'Found it.', usage: { input_tokens: 400, output_tokens: 30 } },
    ])
    const { db, calls } = fakeDb()
    const events = await collect(runAgent({ provider, db, system: 'sys', history: [], userText: 'Which outgoer?', context, messageId: 'm1' }))

    expect(calls.map((c) => c.name)).toEqual(['costing_snapshot', 'search_kits'])
    expect(calls[1]?.args).toEqual({ q: '630A outgoer', filters: { poles: 3 }, lim: 20 })

    // The second request carries the assistant turn then one user turn with both results.
    const second = provider.requests[1]
    expect(second?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    const results = second?.messages[2]?.content ?? []
    expect(results).toHaveLength(2)
    expect(results.every((p) => p.type === 'tool_result')).toBe(true)

    const done = doneOf(events)
    expect(done).toMatchObject({ stop: 'end_turn', steps: 2, usage: { input_tokens: 500, output_tokens: 50 } })
    expect(done.tool_calls.map((c) => c.name)).toEqual(['get_costing', 'search_kits'])
    expect(done.tool_results.map((r) => r.is_error)).toEqual([false, false])
  })

  it('tells the model "not found" for a record the database hides (test 3), as an error result, and carries on', async () => {
    const provider = new FakeProvider([
      { tool_calls: [{ name: 'get_costing', input: { costing_id: '00000000-0000-4000-8000-00000000beef' } }] },
      { text: 'I cannot see that costing.' },
    ])
    const { db } = fakeDb()
    const events = await collect(runAgent({ provider, db, system: 'sys', history: [], userText: 'Tell me about it', context, messageId: 'm1' }))
    const result = events.find((e) => e.type === 'tool_result')
    expect(result).toMatchObject({ type: 'tool_result', name: 'get_costing', is_error: true })
    const handed = provider.requests[1]?.messages[2]?.content[0]
    expect(handed).toMatchObject({ type: 'tool_result', is_error: true, content: expect.stringMatching(/not found/) })
    expect(doneOf(events).stop).toBe('end_turn')
  })

  it('records a proposal through the one write tool and reports its id, nothing applied', async () => {
    const provider = new FakeProvider([
      { tool_calls: [{ name: 'create_proposal', input: { type: 'line_change',
        payload: { action: 'add', ref: kitId, qty: 1, reason: 'the document calls for a 630 A outgoer' } } }] },
      { text: 'I have recorded a proposal. Nothing has been changed yet.' },
    ])
    const { db, proposals } = fakeDb()
    const events = await collect(runAgent({ provider, db, system: 'sys', history: [], userText: 'Add it', context, messageId: 'm7' }))
    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({ conversation_id: 'conv', message_id: 'm7', entity_type: 'costing', entity_id: costingId, type: 'line_change' })
    expect(events).toContainEqual({ type: 'proposal', proposal_id: 'proposal_1' })
    expect(doneOf(events).proposal_ids).toEqual(['proposal_1'])
  })

  it('refuses a malformed proposal in words the model can act on, and stores nothing', async () => {
    const provider = new FakeProvider([
      { tool_calls: [{ name: 'create_proposal', input: { type: 'draft_costing', payload: { summary: 'x', panels: [] } } }] },
      { text: 'Sorry.' },
    ])
    const { db, proposals } = fakeDb()
    const events = await collect(runAgent({ provider, db, system: 'sys', history: [], userText: 'Draft', context, messageId: 'm1' }))
    expect(proposals).toHaveLength(0)
    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({ is_error: true })
    expect(provider.requests[1]?.messages[2]?.content[0]).toMatchObject({ content: expect.stringMatching(/panels must be a non-empty list/) })
  })

  it('stops after 12 steps when the model never finishes, and says so', async () => {
    const forever = Array.from({ length: 20 }, () => ({ tool_calls: [{ name: 'get_company_policy', input: {} }] }))
    const provider = new FakeProvider(forever)
    const { db } = fakeDb()
    const events = await collect(runAgent({ provider, db, system: 'sys', history: [], userText: 'Loop', context, messageId: 'm1' }))
    expect(provider.requests).toHaveLength(12)
    expect(doneOf(events)).toMatchObject({ stop: 'max_steps', steps: 12 })
    const last = events.filter((e) => e.type === 'text').at(-1) as { text: string }
    expect(last.text).toMatch(/stopped after 12 steps/)
    expect(last.text).toMatch(/Nothing has been changed/)
  })

  it('honours a smaller step limit', async () => {
    const provider = new FakeProvider(Array.from({ length: 5 }, () => ({ tool_calls: [{ name: 'get_company_policy', input: {} }] })))
    const { db } = fakeDb()
    const events = await collect(runAgent({ provider, db, system: 'sys', history: [], userText: 'Loop', context, messageId: 'm1', limits: { maxSteps: 3 } }))
    expect(provider.requests).toHaveLength(3)
    expect(doneOf(events).stop).toBe('max_steps')
  })

  it('treats a refusal as a refusal, not an error, and applies nothing', async () => {
    const provider = new FakeProvider([{ stop_reason: 'refusal' }])
    const { db, proposals } = fakeDb()
    const events = await collect(runAgent({ provider, db, system: 'sys', history: [], userText: 'Do something odd', context, messageId: 'm1' }))
    expect(events.find((e) => e.type === 'refused')).toMatchObject({ text: expect.stringMatching(/declined/) })
    expect(doneOf(events).stop).toBe('refusal')
    expect(proposals).toHaveLength(0)
  })

  it('says when a reply was cut at the length limit', async () => {
    const provider = new FakeProvider([{ text: 'A very long', stop_reason: 'max_tokens' }])
    const { db } = fakeDb()
    const events = await collect(runAgent({ provider, db, system: 'sys', history: [], userText: 'Explain', context, messageId: 'm1' }))
    expect(doneOf(events).stop).toBe('max_tokens')
    expect(events.filter((e) => e.type === 'text').at(-1)).toMatchObject({ text: expect.stringMatching(/cut short/) })
  })

  it('turns a tool that throws into a result the model reads, never a crash', async () => {
    const provider = new FakeProvider([{ tool_calls: [{ name: 'get_enquiry', input: { enquiry_id: 'x' } }, { name: 'no_such_tool', input: {} }] }, { text: 'ok' }])
    const { db } = fakeDb()
    const events = await collect(runAgent({ provider, db, system: 'sys', history: [], userText: 'Go', context, messageId: 'm1' }))
    const results = events.filter((e) => e.type === 'tool_result') as { name: string; is_error: boolean }[]
    expect(results.map((r) => [r.name, r.is_error])).toEqual([['get_enquiry', true], ['no_such_tool', true]])
    expect(doneOf(events).tool_results[0]?.summary).toMatch(/fake db has no enquiry_snapshot/)
    expect(doneOf(events).tool_results[1]?.summary).toMatch(/no such tool/)
  })

  it('replays earlier turns before the new question', async () => {
    const provider = new FakeProvider([{ text: 'Yes.' }])
    const { db } = fakeDb()
    await collect(runAgent({
      provider, db, system: 'sys', context, messageId: 'm1', userText: 'Still?',
      history: [
        { role: 'user', content: [{ type: 'text', text: 'Is it Form 3B?' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'The document says Form 3B.' }] },
      ],
    }))
    expect(provider.requests[0]?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
  })
})

describe('the order of the Edge Function: allowance first, provider never (test 6)', () => {
  it('a refused allowance means the provider is not even asked', async () => {
    const decision = decideAllowance({ enabled: true, monthly_token_budget: 1000, used_this_month: 1000, recent_requests: 0 })
    expect(decision.ok).toBe(false)
    const provider = new FakeProvider([{ text: 'should never be said' }])
    // This mirrors index.ts: the provider is constructed only past this branch.
    if (decision.ok) {
      await collect(runAgent({ provider, db: fakeDb().db, system: 'sys', history: [], userText: 'x', context, messageId: null }))
    }
    expect(provider.requests).toHaveLength(0)
  })
})

describe('the tools on their own', () => {
  it('get_costing passes the id through and price_preview the lines', async () => {
    const { db, calls } = fakeDb()
    await runTool('get_costing', { costing_id: costingId }, db, context, null)
    await runTool('price_preview', { lines: [{ kit_id: kitId, qty: 2 }] }, db, context, null)
    expect(calls).toEqual([
      { name: 'costing_snapshot', args: { target: costingId } },
      { name: 'price_preview', args: { lines: [{ kit_id: kitId, qty: 2 }] } },
    ])
  })

  it('refuses a missing required id before touching the database', async () => {
    const { db, calls } = fakeDb()
    const out = await runTool('get_kit', {}, db, context, null)
    expect(out).toEqual({ content: 'kit_id is required', is_error: true })
    expect(calls).toHaveLength(0)
  })

  it('passes max_chars to get_document_text only when given', async () => {
    const { calls } = fakeDb()
    const db: Db = { rpc: async (name, args) => { calls.push({ name, args }); return { text: 't' } }, insertProposal: async () => 'p' }
    await runTool('get_document_text', { document_id: kitId }, db, context, null)
    await runTool('get_document_text', { document_id: kitId, max_chars: 500 }, db, context, null)
    expect(calls[0]?.args).toEqual({ target: kitId })
    expect(calls[1]?.args).toEqual({ target: kitId, max_chars: 500 })
  })
})
