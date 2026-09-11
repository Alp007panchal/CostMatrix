# The two tracks: the basic app and the advanced app

Decided 10 Sep 2026. This is the arrangement, what you have to enter by hand, and how to
re-run the staging creation. Companion to `docs/operations.md`, which covers production.

## Why there are two

`main` is the app you use. It runs on the production Supabase project and
cost-matrix-theta.vercel.app, and it has to stay releasable at all times, because it is the
back-up: if advanced work goes wrong, you still have a working app.

`advanced` is where the foundations (`roadmap-from-market-leaders.md` §2) and the AI assistant
(`ai-assistant-spec.md`) are built. It runs against a **separate Supabase project called
CostMatrix Staging**, which holds its own copy of the library and its own costings. Nothing done
on `advanced` can reach your real data — not by mistake, not by a bad migration, not by a bug.

**Staging lives in a second Supabase account**, because the first had reached its limit of two
free projects (D-181, D-182). That turned out to be the stronger arrangement: the access token
the advanced track uses belongs to that second account and **cannot see the production project
at all**. The separation is no longer a rule the code follows — it is simply out of reach.

| | `main` | `advanced` |
|---|---|---|
| What goes here | Bug fixes, the NPP-192 trial findings, labour hours, prices, the enclosure uplift rule, small improvements | Foundations F1–F11, the AI assistant, anything new |
| Supabase account | your first account | **a second account**, which holds nothing else |
| Supabase project | production (`mssqjuzgycfpfmtjukvq`) | CostMatrix Staging |
| Access token secret | `SUPABASE_ACCESS_TOKEN` | `SUPABASE_STAGING_ACCESS_TOKEN` |
| Web address | cost-matrix-theta.vercel.app | the Vercel preview URL for the `advanced` branch |
| Migration numbers | `0018` onwards | **`0100` onwards** |

### Why the migration numbers are split

Migrations are applied in number order, and Supabase records each one by its number. If `main`
added `0018_price_fix.sql` while `advanced` had its own `0018_foundations.sql`, then when the two
branches met, the second `0018` would be treated as already applied and **silently skipped** —
the tables it creates would simply never exist. Reserving `0100` upwards for the advanced track
makes that impossible. Basic-track work carries on at `0018`, `0019`, and so on.

### How work moves from advanced to main

An advanced feature is merged into `main` only when all three are true:

1. All tests and the NPP-192 acceptance test pass on staging.
2. It is behind a per-company switch that is **off by default**.
3. You have tried it on the preview URL and approve it.

And `main` is merged **into** `advanced` after every change to `main`, so the two never drift.

---

## What you have to enter, once

Three new entries: two secrets (hidden after saving) and, once the workflow has run, one
variable (visible, because a project ref is not sensitive).

### 1. Two secrets

Both go in the same place: **https://github.com/Alp007panchal/CostMatrix** → **Settings** (the
tab on the right of the repository's own menu bar, not your account settings) → in the left-hand
menu **Secrets and variables** → **Actions**. You should see a page headed *Actions secrets and
variables* with two tabs, **Secrets** and **Variables**. On the **Secrets** tab, click the green
**New repository secret** once for each.

| Name | Value |
|---|---|
| `SUPABASE_STAGING_ACCESS_TOKEN` | An access token for the **second** Supabase account. Sign in to that account → your avatar, top right → **Access tokens** → **Generate new token**, name it `github-actions`. Copy it; it is shown once. |
| `SUPABASE_STAGING_DB_PASSWORD` | A password you choose for the staging database. Put it in your password manager. It is not your production password and not your login password; you will almost never type it again. |

GitHub hides both values after saving — even from you. That is what makes it safe for the
automated jobs to use them.

This is the one place the two accounts meet, and they meet only as two separate secrets. The
production token `SUPABASE_ACCESS_TOKEN` is never placed in a staging job, and the staging token
is never placed in a production one.

### 2. Run the workflow that creates the project

1. Still in the repository, click the **Actions** tab (top of the page).
2. In the left-hand list of workflows, click **Create staging project**.
3. On the right, click the grey **Run workflow** button. A small panel opens.
4. Set **Use workflow from** to `advanced`.
5. Fill in the boxes:
   - *Your email address* — the one you sign in with. Required.
   - *Your name* — as the app should show it.
   - *The in-house company to create on staging* — anything; marking it "(Staging)" makes it
     obvious on screen which database you are looking at.
   - *Load data/seed into the staging library* — leave ticked.
   - *Region for a new project* — leave as `eu-west-1` (Ireland), which is where production is.
     It is a box rather than something read from production, because the staging account cannot
     see the production project.
   - *Use this existing project instead* — leave blank unless you are pointing staging at a
     project that already exists on the second account.
6. Click the green **Run workflow**. The page takes a few seconds to show the run; refresh if
   it does not appear.
7. Click into the run. It takes **about five to ten minutes**, most of it waiting for Supabase
   to finish building the project. A successful run is all green ticks and ends with a summary
   box headed **CostMatrix Staging is ready**.

That summary tells you the remaining two things to enter, with the values already filled in.

### 3. The staging project ref — a variable

From the summary, copy the project ref, then: **Settings** → **Secrets and variables** →
**Actions** → the **Variables** tab → **New repository variable**. Name
`SUPABASE_STAGING_PROJECT_REF`, value the ref from the summary.

Until this is set, pushing a migration to `advanced` stops with a message telling you so — it
does not guess, and it certainly does not fall back to production.

### 4. Two Vercel environment variables

From the summary, copy the project URL and the publishable key, then in Vercel → **CostMatrix**
→ **Settings** → **Environment Variables**, add each of these with the **Preview** environment
ticked and the branch set to `advanced`:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | the staging project URL from the summary |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key from the summary |

Both are public values — they are what the browser itself uses. The secret key and the database
password are not printed by the workflow and are not needed here.

If you ever add a `VERCEL_TOKEN` secret, these two can be set automatically instead; say so and
it will be added.

### 5. Your staging password

Open the `advanced` preview URL, click **Forgot password**, and enter your email. Your staging
password is separate from your production one, and nobody else knows it — the workflow creates
the login with a random password that it masks and throws away.

### 6. The assistant's key — Edge Function secrets on the staging project

The assistant's server side is an Edge Function on the staging project (D-180), and its API key
lives there: never in GitHub, never in Vercel, never in the browser. Enter it once, by hand, in
the Supabase dashboard of the **second** account:

1. Sign in at **https://supabase.com/dashboard** with the staging account and open the
   **CostMatrix Staging** project.
2. In the left-hand menu click **Edge Functions**, then the **Secrets** tab (in some layouts it is
   **Project Settings** → **Edge Functions**). You should see a table headed *Secrets* listing the
   ones Supabase injects itself (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, …).
3. Click **Add new secret**. Name `ANTHROPIC_API_KEY`, value: the key from
   console.anthropic.com → **API keys** → **Create key** (copy it once; the console never shows it
   again). Click **Save**.
4. Add four more the same way, each optional, each with its default if left out:

   | Name | Value | If missing |
   |---|---|---|
   | `AI_PROVIDER` | `anthropic` | `anthropic`. `fake` makes a dry run that calls nobody. |
   | `AI_MODEL` | `claude-opus-5` | `claude-opus-5` — drafts and reviews |
   | `AI_MODEL_FAST` | `claude-haiku-4-5` | `claude-haiku-4-5` — plain questions |
   | `AI_FALLBACKS` | leave out | on; `off` disables server-side refusal fallbacks |

5. Secrets take effect on the function's next cold start; nothing to redeploy. The table shows
   names only — a saved value is never displayed again, which is the point.

### 7. Switching the assistant on for the staging company

The assistant is **off for every company** until the master administrator turns it on (D-193),
and it refuses with "switched off" until then. Phase 1 has no screen for the switch yet (the admin
settings screen is assistant PR B), so on staging it is one query, run as the master administrator
from the staging project's **SQL Editor** (the switch is guarded by a trigger: anyone but the master
administrator is refused):

```sql
-- who has it on, and what budget (0 = none set, so the assistant refuses)
select c.name, o.key, o.value
from public.company_options o join public.companies c on c.id = o.company_id
where o.key in ('ai_enabled', 'ai_monthly_token_budget') order by c.name, o.key;
```

The SQL Editor runs as the database owner, not as a signed-in person, so the trigger stands
aside (D-193) and this flips it for the company named:

```sql
update public.company_options set value = 'true'::jsonb
 where key = 'ai_enabled' and company_id = (select id from public.companies where kind = 'in_house');
```

(Staging has one in-house company, yours; a budget of `2000000` tokens is already seeded.) You can
tell it is on in three ways:
the first query shows `true`; **Check staging** will show it once that workflow is extended; and
the function itself answers a turn instead of *"The assistant is switched off for your company"*.

### 8. Trying the assistant on staging

With §6 and §7 done, on the `advanced` preview:

1. Open an enquiry, attach the NPP-192 PDF (or any specification) and wait for the Files card to
   say **read**.
2. Press **Open** on the **Assistant** card, then **Draft this costing from the attached
   documents**. The reply appears as it is written; short grey lines say what it is doing.
3. A **Proposed costing** card follows. Check a few lines against the document, accept or reject,
   then **Apply**. You land on a new draft costing whose lines are marked as the assistant's, priced
   by the ordinary engine.
4. On that costing, **Review before submission** gives findings, with a one-click fix where one is
   possible.
5. **Assistant** in the top navigation shows what the two actions cost in tokens.

Until the Anthropic account has credit, step 2 ends with *"the Anthropic account has no credit
left"* and the remedy, which is the intended behaviour rather than a fault: everything up to the
model call is working.

---

## If Supabase refuses to create the project

This is what happened on the first run, and why staging now lives in a second account. Supabase
allows **two active projects per person on the free plan**, and the first account already had
two. The run stopped with Supabase's own sentence and changed nothing.

The resolution was a second Supabase account, which starts with no projects at all. If that
account ever hits the same limit, the same three ways out apply, and none needs the workflow
changed:

1. **Pause a project on that account you are not using** — Supabase dashboard → that project →
   **Settings** → **General** → **Pause project**. A paused project stops counting against the
   limit, so re-running the workflow then creates staging normally.
2. **Delete a project you no longer need**, the same way.
3. **Upgrade that organisation to a paid plan**, which lifts the limit.

Or point the workflow at a project the staging account already has: re-run it and put that
project's ref in the **Use this existing project instead** box. It then adopts that project —
applying the migrations, creating your login and loading the library into it — and creates
nothing. The project can be called anything; only the ref matters. It still refuses to run if
the ref you give is the production project, which is checked before anything else happens.

When it fails, the run now prints Supabase's own sentence, the whole response body, a
plain-language explanation, and the list of projects on the account with their status, so you
can see which two hold the slots.

---

## Running it again

**The workflow is safe to run as often as you like.** It:

- reuses the project if one called `CostMatrix Staging` already exists, rather than making a
  second one;
- **wakes it if Supabase has paused it** — free projects pause after about a week of no use, and
  then everything else would fail with a connection error, so the workflow asks Supabase to
  restore it and waits;
- applies whatever migrations are new since last time;
- reuses your login if it is already there;
- loads `data/seed` again, which reports as "unchanged" if nothing in the files has changed.

It **refuses to do anything at all** if the project it resolved turns out to be the production
project — that check runs before the first write.

One thing it cannot do for you: if Supabase refuses the restore call, the run stops and prints
the link to press **Restore project** in the dashboard, then asks you to run it again. That part
of Supabase's API is the least settled, so it is deliberately a clear stop rather than a guess.

---

## What each secret and variable is for

| Name | Kind | Used by | What it is |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | secret, existing | `main` deploys only | Your **first** account's personal access token. Never placed in a staging job. |
| `SUPABASE_PROJECT_REF` | secret, existing | `main` deploys; compared on `advanced` | The production project. On the advanced track it is **only ever compared against**, never used to call anything — it is how staging proves it is not production. |
| `SUPABASE_DB_PASSWORD` | secret, existing | `main` deploys | The production database password. Never read by an `advanced` run. |
| `SUPABASE_STAGING_ACCESS_TOKEN` | secret, new | staging only | The **second** account's access token. Every Management API call and every `supabase link`, `db push` and `functions deploy` on the advanced track uses this one. It cannot see the production project. |
| `SUPABASE_STAGING_DB_PASSWORD` | secret, new | staging deploys | The staging database password. Never read by a `main` run. |
| `SUPABASE_STAGING_PROJECT_REF` | variable, new | staging deploys | The staging project. A variable rather than a secret because a project ref is not sensitive and it helps to be able to read it back. |
| `ADVANCED_PREVIEW_URL` | variable, optional | staging setup | If set, invitation emails sent from staging point at the preview URL instead of localhost. |
| `ANTHROPIC_API_KEY` | Edge Function secret on the **staging project**, not GitHub | the `assistant` function | The assistant's key (D-180). Entered once in the Supabase dashboard (§6). Production has none until the assistant reaches `main`. |

## How the workflows divide up

| Workflow | Trigger | What it touches |
|---|---|---|
| **CI** | every push to `main`, `advanced` or `claude/**`, and every pull request | Nothing live. Runs the migrations and all database tests on a throwaway Postgres, then the web app's typecheck, tests and build. |
| **Deploy database** | push to `main` or `advanced` that changes `supabase/migrations/**` | Two separate jobs, each guarded by the branch: `main` → production, `advanced` → staging. Separate jobs rather than one that picks its secrets, so a run on one branch cannot reach the other's credentials whatever is added to the file later. |
| **Create staging project** | by hand | Creates, wakes and sets up the staging project. Never production. |
| **Check staging** | by hand | Counts what is in the staging library and prints it as a job summary. Read-only — SELECTs and nothing else — so it is safe to run at any time. Use it to answer "did the seed land?" without opening the dashboard. |
| **Deploy functions** | push to `main` or `advanced` that changes `supabase/functions/**` | Two separate jobs guarded by branch, exactly as "Deploy database": `main` → production, `advanced` → staging. This is how an Edge Function such as `extract-document` reaches staging on merge. |
| **Set up Supabase** | unchanged | Production only. |

## Where the organisation and the region come from

Production used to supply both, read from its project row. The staging account cannot see
production, so instead:

- **The organisation** comes from the staging token's own organisations (`GET /v1/organizations`).
  There is one, `CostMatrix Staging Org`, and it is used. If that account ever has several, the
  one with that name wins, and if none matches the run stops and lists them rather than guessing.
- **The region** is the *Region for a new project* box on the workflow, defaulting to
  `eu-west-1` — the same region as production. When the project already exists, or you adopt one,
  its own region is used and the box is ignored.

## Where the seeding comes from

The staging library is loaded by the same three importer functions the Import screen calls, with
the same files in `data/seed/` and the same validation, so staging holds what production holds.
The part that reads the CSVs lives in `supabase/seed-csv-load.sql` and is shared between
`supabase/tests/14_seed_import.sql` and `supabase/seed-from-csv.sql`, so there is one copy of it
rather than two that can drift apart.

One wrinkle worth knowing about, in case it ever needs changing: the importers check who is
asking through `auth.uid()`, and an automated database connection has no signed-in user. The
seed script therefore sets the same `request.jwt.claims` setting that the test fixture uses, to
act as the master administrator it has just created. That is the only unusual thing in it.
