# The assistant's core

The provider-neutral heart of the in-app assistant (AI spec §4), shared by the
`assistant` Edge Function and by the tests. Nothing in this directory except
`anthropic.ts` knows any vendor exists, and nothing here knows Deno exists — the
Edge Function hands in the API key and the user's Supabase client. That is what
lets `web/`'s vitest run these files with a fake provider and no key.

| File | What it is |
|---|---|
| `provider.ts` | The seam: `Provider`, the message and tool shapes, `ProviderError`. Implement it to add a provider (decision A1). |
| `anthropic.ts` | Claude through the official SDK. Streams text, maps typed errors to one plain sentence, prices the turn. Refusal fallbacks on by default; `AI_FALLBACKS=off` turns them off. |
| `fake.ts` | A scripted provider for the tests and for `AI_PROVIDER=fake` dry runs. Keeps every request it receives. |
| `tools.ts` | The nine tools of spec §5 as thin calls to migration 0103's read-only functions, plus `create_proposal`, the only write. `Db` is the interface the tests fake. |
| `db.ts` | `Db` over the caller's Supabase client. |
| `proposals.ts` | Checks a proposal against the §6.3 shapes before it is stored. |
| `budget.ts` | The decision: switched on? rate limit? budget? Asked before any provider is built, so a refusal calls nobody. |
| `context.ts` | The system prompt in five parts, stable first so the prefix caches; `wrapUntrusted` for document text. |
| `agent.ts` | The loop: at most 12 steps, a wall-clock cap, every tool result of a turn returned together. Emits events for the stream. |
| `examples/npp192.ts` | The worked example the draft task shows the model, as data. |

Tests live beside the code as `*.test.ts` and are picked up by `web/vitest.config.ts`.
