// The assistant's server side (AI spec §4, §10; decision D-180: the key lives
// here, in Supabase, not in Vercel).
//
// One POST per user turn. The function:
//   1. checks the caller is signed in and asks the database, with the caller's
//      own token, whether the assistant may run for them (switched on? budget?
//      rate?) — BEFORE any provider is built, so a refusal calls nobody;
//   2. finds or creates the conversation and stores the user's message;
//   3. builds the system prompt from the company's policy and the record;
//   4. runs the agent loop, streaming what the model says as server-sent
//      events, running tools through row-level security as it goes;
//   5. stores the assistant's message with its tool calls, tokens and cost, and
//      records usage on the conversation.
//
// Nothing here ever writes to a costing. The only write the model can cause is
// a row in assistant_proposals, through the create_proposal tool (A3).
//
// Deploy with:  supabase functions deploy assistant
// Secrets it reads (Edge Function secrets on the project):
//   ANTHROPIC_API_KEY   required unless AI_PROVIDER=fake
//   AI_PROVIDER         anthropic (default) | fake
//   AI_MODEL            default claude-opus-5
//   AI_MODEL_FAST       default claude-haiku-4-5 (reserved for the question task)
//   AI_FALLBACKS        off to disable server-side refusal fallbacks

import { createClient } from '@supabase/supabase-js'
import { AnthropicProvider, DEFAULT_FAST_MODEL, DEFAULT_MODEL } from '../_shared/ai/anthropic.ts'
import { FakeProvider } from '../_shared/ai/fake.ts'
import { decideAllowance } from '../_shared/ai/budget.ts'
import { buildSystemPrompt, type Task } from '../_shared/ai/context.ts'
import { runAgent, type AgentEvent } from '../_shared/ai/agent.ts'
import { SupabaseDb } from '../_shared/ai/db.ts'
import type { ContentPart, Provider, ProviderMessage } from '../_shared/ai/provider.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

interface Body {
  conversation_id?: string
  entity_type?: 'enquiry' | 'costing'
  entity_id?: string
  message?: string
  task?: Task
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'Use POST' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) return reply({ error: 'The function is missing its environment variables' }, 500)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return reply({ error: 'Not signed in' }, 401)

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return reply({ error: 'Send JSON with entity_type, entity_id, message and task' }, 400)
  }
  const entityType = body.entity_type
  const entityId = body.entity_id
  const message = (body.message ?? '').trim()
  const task: Task = body.task === 'draft' || body.task === 'review' ? body.task : 'question'
  if (entityType !== 'enquiry' && entityType !== 'costing') return reply({ error: 'entity_type must be enquiry or costing' }, 400)
  if (!entityId) return reply({ error: 'entity_id is required' }, 400)
  if (!message) return reply({ error: 'message is required' }, 400)
  if (message.length > 20_000) return reply({ error: 'message is too long (20,000 characters at most)' }, 400)

  // Everything below runs as the caller. No service role in this function.
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  })
  const db = new SupabaseDb(client)

  // --- 1. may this run? (decided before any provider exists) ---------------
  let allowance: unknown
  try {
    allowance = await db.rpc('assistant_allowance', {})
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
  const decision = decideAllowance(allowance)
  if (!decision.ok) return reply({ error: decision.reason, refused: true }, decision.status)

  // --- 2. the conversation and the user's message ---------------------------
  const { data: me } = await client.auth.getUser()
  const userId = me?.user?.id
  if (!userId) return reply({ error: 'Not signed in' }, 401)

  const policy = await db.rpc('company_policy', {})
  const companyId = (policy as { company?: { id?: string } } | null)?.company?.id
  if (!companyId) return reply({ error: 'You do not belong to a company' }, 403)

  const record = await db.rpc(entityType === 'costing' ? 'costing_snapshot' : 'enquiry_snapshot', { target: entityId })
  if (!record) return reply({ error: 'not found: either it does not exist or it is not visible to you' }, 404)

  let conversationId = body.conversation_id ?? null
  if (conversationId) {
    const { data: existing } = await client
      .from('assistant_conversations')
      .select('id, entity_type, entity_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (!existing || existing.entity_type !== entityType || existing.entity_id !== entityId) {
      return reply({ error: 'No such conversation on this record' }, 404)
    }
  } else {
    const { data: created, error } = await client
      .from('assistant_conversations')
      .insert({ company_id: companyId, user_id: userId, entity_type: entityType, entity_id: entityId, title: message.slice(0, 120) })
      .select('id')
      .single()
    if (error || !created) return reply({ error: error?.message ?? 'could not start a conversation' }, 500)
    conversationId = created.id as string
  }

  const history = await loadHistory(client, conversationId)

  const { error: userMessageError } = await client
    .from('assistant_messages')
    .insert({ conversation_id: conversationId, role: 'user', content: message })
  if (userMessageError) return reply({ error: userMessageError.message }, 500)

  // The assistant's row is created empty first so proposals can point at it.
  const { data: assistantRow, error: assistantRowError } = await client
    .from('assistant_messages')
    .insert({ conversation_id: conversationId, role: 'assistant', content: '' })
    .select('id')
    .single()
  if (assistantRowError || !assistantRow) return reply({ error: assistantRowError?.message ?? 'could not store the reply' }, 500)
  const messageId = assistantRow.id as string

  // --- 3. the provider (only now) -------------------------------------------
  let provider: Provider
  try {
    provider = makeProvider(task)
  } catch (e) {
    await client.from('assistant_messages').update({ content: `(not run: ${String(e instanceof Error ? e.message : e)})` }).eq('id', messageId)
    return reply({ error: e instanceof Error ? e.message : String(e) }, 500)
  }

  const system = buildSystemPrompt({ policy, record, entityType, task })
  const started = Date.now()

  // --- 4. stream -------------------------------------------------------------
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))

      send({ type: 'start', conversation_id: conversationId, message_id: messageId, warning: decision.warning })
      let done: Extract<AgentEvent, { type: 'done' }> | null = null
      try {
        for await (const event of runAgent({
          provider,
          db,
          system,
          history,
          userText: message,
          context: { conversation_id: conversationId!, entity_type: entityType, entity_id: entityId },
          messageId,
        })) {
          if (event.type === 'done') done = event
          else send(event)
        }
      } catch (e) {
        send({ type: 'error', text: e instanceof Error ? e.message : String(e), retryable: false })
      }

      // --- 5. the log ----------------------------------------------------------
      const latency = Date.now() - started
      const usage = done?.usage ?? { input_tokens: 0, output_tokens: 0 }
      const cost = provider.costUsd(usage)
      const text = done ? textOf(done.content) : ''
      await client
        .from('assistant_messages')
        .update({
          content: text,
          tool_calls: done?.tool_calls ?? [],
          tool_results: done?.tool_results ?? [],
          model: provider.model,
          tokens_in: usage.input_tokens,
          tokens_out: usage.output_tokens,
          latency_ms: latency,
        })
        .eq('id', messageId)
      await db.rpc('assistant_record_usage', {
        conversation: conversationId,
        add_in: usage.input_tokens,
        add_out: usage.output_tokens,
        add_cost: cost,
      }).catch(() => undefined)
      for (const proposalId of done?.proposal_ids ?? []) {
        await db.rpc('write_activity', {
          entity_type: entityType,
          entity_id: entityId,
          action: 'assistant_proposed',
          before: null,
          after: { proposal_id: proposalId, conversation_id: conversationId, message_id: messageId },
          note: `The assistant recorded a proposal (${task}). Nothing applied.`,
          actor_kind: 'assistant',
        }).catch(() => undefined)
      }

      send({
        type: 'done',
        stop: done?.stop ?? 'error',
        steps: done?.steps ?? 0,
        usage,
        cost_usd: cost,
        latency_ms: latency,
        proposal_ids: done?.proposal_ids ?? [],
        model: provider.model,
      })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
})

// --- helpers ------------------------------------------------------------------

function makeProvider(task: Task): Provider {
  const kind = (Deno.env.get('AI_PROVIDER') ?? 'anthropic').toLowerCase()
  if (kind === 'fake') {
    return new FakeProvider([{ text: 'This is the fake provider: the assistant is wired up but no model was called.' }])
  }
  const model = task === 'question'
    ? (Deno.env.get('AI_MODEL_FAST') || DEFAULT_FAST_MODEL)
    : (Deno.env.get('AI_MODEL') || DEFAULT_MODEL)
  return new AnthropicProvider({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
    model,
    fallbacks: (Deno.env.get('AI_FALLBACKS') ?? 'on').toLowerCase() !== 'off',
  })
}

/** Earlier turns, oldest first, as plain text: tool traffic is not replayed in phase 1. */
async function loadHistory(
  client: ReturnType<typeof createClient>,
  conversationId: string,
): Promise<ProviderMessage[]> {
  const { data } = await client
    .from('assistant_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
    .limit(40)
  const rows = (data ?? []) as { role: 'user' | 'assistant'; content: string | null }[]
  return rows
    .filter((r) => (r.content ?? '').trim() !== '')
    .map((r) => ({ role: r.role, content: [{ type: 'text', text: r.content ?? '' }] }))
}

function textOf(parts: ContentPart[]): string {
  return parts.filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text').map((p) => p.text).join('')
}
