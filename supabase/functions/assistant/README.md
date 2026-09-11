# assistant

The assistant's server side (AI spec §4 and §10). One POST per user turn; the
reply streams back as server-sent events. The core it runs —
provider, tools, context, loop — lives in `../_shared/ai/` and has no Deno in
it, so `web/`'s vitest exercises it with a fake provider and no key.

## What it does, in order

1. **Is the caller signed in, and may the assistant run for them?** The
   database answers (`assistant_allowance`, with the caller's own token): is the
   assistant switched on for their company, how much of the month's token
   budget is left, how many requests they made in the last minute. A refusal
   (403 switched off or no budget; 429 rate or budget exhausted) is returned
   **before any provider is built**, so it costs nothing and calls nobody.
2. **The conversation.** Finds the conversation given, or starts one on the
   enquiry or costing named; stores the user's message; creates the assistant's
   row empty so a proposal can point at it.
3. **The prompt.** `company_policy` and `costing_snapshot` / `enquiry_snapshot`
   are fetched — again as the caller, so a record of another company is "not
   found" — and the system prompt is built: role and rules, glossary, company,
   record, task.
4. **The loop.** At most 12 model ⇄ tool rounds and about 170 seconds. Text
   streams as it arrives; every tool runs through row-level security; the only
   write the model can cause is a row in `assistant_proposals`.
5. **The log.** The assistant's row is filled in with its text, its tool calls
   and trimmed results, the model, tokens and latency; the conversation's token
   and cost totals grow; each proposal gets an `activity_log` entry with
   `actor_kind = assistant`.

## Request and reply

```
POST /functions/v1/assistant        Authorization: Bearer <the user's token>
{ "entity_type": "costing", "entity_id": "<uuid>", "message": "Review this costing",
  "task": "review", "conversation_id": "<uuid, optional>" }
```

`task` is `draft`, `review` or `question`. The reply is `text/event-stream`;
each `data:` line is one JSON event: `start` (conversation and message ids, a
budget warning if past 80 %), `text`, `tool_call`, `tool_result`, `proposal`,
`refused`, `error`, then `done` (stop reason, steps, tokens, cost, proposal ids).

## Settings (Edge Function secrets on the project)

| Name | Required | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes, unless `AI_PROVIDER=fake` | The key. Never in Vercel, never in the browser. |
| `AI_PROVIDER` | no | `anthropic` (default) or `fake` — a dry run that calls nobody and answers with one fixed sentence. |
| `AI_MODEL` | no | Model for drafts and reviews. Default `claude-opus-5`. |
| `AI_MODEL_FAST` | no | Model for plain questions. Default `claude-haiku-4-5`. |
| `AI_FALLBACKS` | no | `off` disables server-side refusal fallbacks (on by default). |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by Supabase. The function
never uses the service role.

## Deploying

`supabase functions deploy assistant`, or a merge to `advanced` that touches
`supabase/functions/**` ("Deploy functions", staging job).

## Not yet verified

This function has not been run against Anthropic from the build environment,
which has no Deno, no Supabase project and no key. The request shape in
`_shared/ai/anthropic.ts` is the one thing verified only by the first real run on
staging; every other part is covered by the vitest and SQL tests.
