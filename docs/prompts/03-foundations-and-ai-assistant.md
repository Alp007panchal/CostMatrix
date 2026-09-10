# CostMatrix — prompt for Claude Code: foundations slice, then the AI assistant

Two new documents have been added to the repo. Read them fully before doing anything, together with `CLAUDE.md` and `docs/reference/current-costing-and-quotation-reference.md` (whose §5 decisions remain binding):

- `docs/reference/roadmap-from-market-leaders.md` — what CostMatrix adopts from EPLAN, the switchgear makers' configurators, electrical estimating tools and CPQ systems; **§2 lists foundations F1–F11 that must be built now**, before further features, so that later phases are additive.
- `docs/reference/ai-assistant-spec.md` — phase-1 spec for the in-app AI assistant (Claude behind a swappable provider layer, in-house users first, propose-only). Its §1 decisions A1–A4 are binding.

## Two tracks from now on (decision 10 Sep 2026)

- **`main` = the basic app.** It is what production (cost-matrix-theta.vercel.app, production Supabase) runs. Only basic-track work goes there: bug fixes, the NPP-192 trial findings, labour hours, prices, the enclosure uplift rule, small improvements. It must always stay releasable — it is our back-up.
- **`advanced` = the advanced app.** Create a long-lived branch `advanced` from `main`. All foundations and AI-assistant work happens on `advanced` (feature branches off it, PRs into it). It deploys to its own Vercel preview URL and uses a **separate staging Supabase project** ("CostMatrix Staging") that Alpesh is creating; production data is never touched by advanced work.
- An advanced feature is merged from `advanced` into `main` only when (1) all tests and the NPP-192 acceptance test pass on staging, (2) it is behind a per-company switch that is **off by default**, and (3) Alpesh has tried it on the preview URL and approves. Merge `main` into `advanced` after every `main` change so the branches never drift.

**Step 0 — set up the two tracks by code (before Step 1).** Alpesh has decided the staging project is to be created by code, not by hand. On `advanced`:

1. Add a manually triggered GitHub Actions workflow `create-staging.yml` (`workflow_dispatch`) that uses the Supabase Management API with the repository secret `SUPABASE_ACCESS_TOKEN` to: find the organisation and the region of the existing production project (`GET /v1/projects`), create a project named `CostMatrix Staging` in the same organisation and region on the free plan with the database password taken from the secret `SUPABASE_STAGING_DB_PASSWORD`, wait until it is healthy, fetch its API keys (`GET /v1/projects/{ref}/api-keys`), then run all migrations against it and seed it from `data/seed/*` with the existing importer. The workflow must be idempotent (if a project of that name exists, reuse it) and must never touch the production project ref. At the end it prints, as a job summary, the staging project ref, URL and anon key (never the service-role key or the password) and the exact list of Vercel environment variables to add.
2. Make the existing "Deploy database" workflow choose its target by branch: `main` → production secrets (unchanged), `advanced` → staging (project ref from a repository variable `SUPABASE_STAGING_PROJECT_REF` that the create workflow tells Alpesh to set, plus `SUPABASE_STAGING_DB_PASSWORD`).
3. Document the Vercel environment variables the `advanced` preview needs (staging Supabase URL and anon key, service role if used server-side) so Alpesh can add them under Vercel → Settings → Environment Variables → Preview, scoped to the `advanced` branch. If Alpesh later provides a `VERCEL_TOKEN` secret, add a step that sets them by API instead.
4. Add `docs/reference/two-track-setup.md` recording the arrangement, the secrets and variables used, and how to re-run the staging creation.

Before writing the workflow, check what the current "Deploy database" workflow already uses (it may already have `SUPABASE_ACCESS_TOKEN`) and reuse its approach. Give Alpesh every secret or variable he must enter as a numbered click-by-click list (GitHub → repository → Settings → Secrets and variables → Actions) and tell him what he should see after each click; then tell him how to run the workflow from the Actions tab and what a successful run looks like.

Work in plan mode first, then one gap per session with tests and a PR (into `advanced` for advanced work, into `main` for basic work) that I review and merge (never stacked PRs).

## Step 1 — gap list (plan mode, no code)

For each foundation F1–F11 in the roadmap §2, state what migrations 0001–0011 and the current code already provide, what changes, and what is new. Flag anything in the foundations that would alter today's pricing results or the NPP-192 acceptance test — there should be nothing; if there is, say so and propose how to keep behaviour identical. Order the work by dependency and propose the PR split (I expect two PRs for foundations: master data F1–F3, then costing/audit/documents/import/settings/assistant tables F4–F11). Show me the list and the proposed migrations before writing code.

## Step 2 — foundations PRs

Implement the foundations exactly as specified, with:

- migrations that add nullable columns and new tables only; a seed/back-fill script for existing rows (e.g. `status = active` on components, kit `version = 1`, freeze kit composition into existing costing assemblies);
- the kit-composition freeze (F2) applied to the costing engine so editing a master kit never changes an existing costing — add a test that proves it;
- one default approval rule ("always require approver") so behaviour is unchanged;
- the generic `documents` table with Supabase Storage upload on enquiries and costings, and a background extraction job for PDF/DOCX/XLSX to `extracted_text`;
- `import_jobs` / `import_rows` with the existing seed importer moved onto them (same CSVs, same validation, same results);
- the assistant tables from the spec §6 (empty, no UI yet);
- minimal UI: the new optional fields visible on the component and kit forms, attachments strip on enquiry and costing, nothing else.

Run the full test suite and the NPP-192 acceptance test after each PR; they must pass unchanged.

## Step 3 — AI assistant (two PRs, per spec §10)

Only after foundations are merged. PR A: provider interface, Anthropic adapter, tools, context builder, agent loop, `/api/assistant` route, logging, budget and rate limiting, tests 3/5/6 from spec §9. PR B: the assistant panel, proposal and review cards, apply/reject with provenance and activity log, admin settings and usage, tests 1/2/4. Model names and keys come from environment variables (`AI_PROVIDER`, `AI_MODEL`, `AI_MODEL_FAST`, `ANTHROPIC_API_KEY`); tell me exactly which variables to add in Vercel and where, one step at a time, when we reach that point.

## Reminders

- I am a layman on git/GitHub and deployment: give me click-by-click steps, one PR at a time, and say what I should see on screen.
- Nothing the assistant produces is ever applied without a person clicking Apply.
- Prices, factors, rates, rounding and kit composition frozen into a costing are never rewritten by any new feature.
