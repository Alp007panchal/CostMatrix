# Working with the owner of CostMatrix

Read this before doing anything else in this repository.

## How to ask

- **When a decision is the owner's to make, ask with options, not prose.** Use the
  AskUserQuestion tool with two to four concrete choices, the recommended one first and
  marked "(Recommended)", each with a one-line consequence. The owner has asked for this
  explicitly and repeatedly.
- **One question at a time** unless the questions are genuinely independent; then a single
  call with several questions is fine.
- The owner is not a developer and is learning to operate this system. Explain choices
  plainly, prefer boring well-documented tools, and never paste or request secrets in chat.

## How to work

- Keep going. The owner wants momentum: when a slice is approved, build it to the end,
  verify it, merge it, and report. Do not stop to ask whether to continue with the next
  step in an approved plan. Do ask before anything destructive or outside the plan.
- Verify before claiming: run `supabase/tests/run-local.sh`, and in `web/`
  `npm run typecheck`, `npm test`, `npm run build`. Say plainly what could not be verified
  (for example anything that needs a browser, which this environment lacks).
- Work on `claude/costmatrix-planning-bq7j86`, then fast-forward `main`; the owner has
  approved merging straight to `main` without pull requests.
- Record every decision as one line in `docs/decisions.md`. Keep `docs/build-plan.md`
  progress table and `docs/open-questions.md` current.
- No source file over roughly 300 lines; split by screen or concern.

## Where things are

- `docs/spec.md` — the rules. `docs/data-model.md` — tables and isolation.
- `docs/operations.md` — the runbook the owner follows; update it when a screen changes.
- `docs/quotation-template.md` — the PDF layout, from the real NPP-192 quotation.
- The app: https://cost-matrix-theta.vercel.app. Supabase project `mssqjuzgycfpfmtjukvq`
  (eu-west-1). Migrations deploy to production automatically on merge to `main`.
