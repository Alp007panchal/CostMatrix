# Architecture

Written for an owner who is not a developer. Each choice says what it is, why it was chosen,
and what the alternative would have cost.

## 1. The pieces

```
Browser ──▶ Web app (static files on Vercel)
                │  Supabase JS client, signed-in user token
                ▼
           Supabase project (Ireland)
             ├─ Auth       who the user is
             ├─ Postgres   all data, all rules, all calculations, row-level security
             └─ Storage    quotation PDFs and company logos
```

There is no application server of our own. The browser talks to Supabase directly. Postgres
decides what each user may see and do. This is the simplest shape to run: two hosted services,
both with dashboards, both with generous documentation.

## 2. Choices

### Supabase (given)
Managed Postgres with authentication, file storage and row-level security. Region eu-west-1
(Ireland). London is marginally closer to Nairobi — about five milliseconds — but Ireland is in
the EU, which is the more conventional home for a data-protection promise. Pro plan from day one of real use, for daily
backups and point-in-time recovery.

### Frontend: Vite + React + TypeScript single-page app
- **What**: a normal React app, built into static files, served by **Vercel** from the GitHub repository. Every push to `main` deploys. Netlify would do the same job; Vercel is named so the operations guide can give one exact set of steps instead of hedging.
- **Why**: no server to run, patch or secure. React has the largest pool of documentation and help. TypeScript catches mistakes before they reach users.
- **Alternative**: Next.js. More features, but adds a server layer and concepts (server components, cookies, middleware) that are not needed when the database does the authorisation.
- Libraries kept to a few boring ones: React Router (pages), TanStack Query (loading and caching data), Supabase JS (talking to Supabase), `@react-pdf/renderer` (PDF), SheetJS community build (XLSX export). Plain CSS modules, no design system to learn.

### Calculations in the database
The costing formula lives in Postgres views and functions. Every screen, PDF and export reads
the same numbers. This is the direct fix for the Excel problem where each sheet drifts.
The browser never computes a total; it displays what the database returns.

### PDF generation
At release, the approver's browser renders the quotation template to a PDF with
`@react-pdf/renderer`, uploads it to the private `quotations` bucket, and then calls the
database function `app.release_quotation`, which records the path and flips status. If the
upload fails, nothing is released. If browser rendering proves unreliable on some machines,
the fallback is the same template run inside a Supabase Edge Function; the template code is
shared either way.

### Exports
CSV and XLSX are built in the browser from `v_costing_items_by_category`. No server needed.

### Migrations
Supabase CLI. Every schema change is a file `supabase/migrations/NNNN_name.sql`, applied in
order. `seed.sql` holds categories, process types and a demo company for local work.
`supabase db reset` rebuilds a local database from nothing in under a minute. The same files
are applied to staging and production with `supabase db push`.

### Environments
All three exist. Staging arrived on 10 September 2026 as a free project on a **second** Supabase
account — the first had reached its two-project limit — which turned out to be the stronger
arrangement, because the token staging uses cannot see production at all
(`docs/reference/two-track-setup.md`).

| Name | Where | Purpose | Since |
|---|---|---|---|
| local | a laptop, Supabase CLI + Docker | development and tests | slice 0 |
| production | the live Supabase project (Ireland) + the live Vercel deploy | customers | slice 0 |
| staging | CostMatrix Staging (a second account) + the `advanced` preview deploy | try a feature before switching it on in production | 2026-09-10 |

There is **one code line**, `main`; the `advanced` branch is the copy staging deploys from, kept
in step by merging `main` into it. Until 13 September 2026 it was a second track where advanced
work was built; the per-feature switch (migration 0117) made that unnecessary.

### How database changes reach production
Migrations are applied by a GitHub Actions workflow when a change is merged to `main`, using
the `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` and `SUPABASE_DB_PASSWORD` repository
secrets. Nobody runs migrations from a laptop against production, and no secret has to be
shared with anyone: GitHub holds them write-only. The same migration files run locally with
`supabase db reset`.

### Backups and data protection
1. Supabase daily backups and point-in-time recovery (Pro plan).
2. A weekly GitHub Actions job (`weekly-backup.yml`) runs `supabase db dump` three times — roles, schema, data — checks the files are not empty, and keeps them as a run artifact for 90 days. That puts them off the Supabase account, which is what this layer is for; it does not put them off GitHub. Sending them on to a bucket as well is one secret away and the job is written for it.
3. Storage objects (PDFs, logos) are **not** in the weekly dump — it is the database only. Quotation PDFs can be regenerated from the costing data, which is in it.
4. A written restore drill in `docs/operations.md` Part E: download the latest artifact, restore roles then schema then data into a fresh project, and check a costing's total to the cent. Run once now and every quarter. `supabase/tests/restore-drill.sh` rehearses the same mechanism in CI on every pull request, which proves the schema restores but not that any particular dump does.
5. Access: master admin read-only by database policy; company data never crosses tenants; no shared secret keys in the browser, only the public publishable key plus the user's own token.
6. A short plain-language terms page in the app states what is stored, that data is held in Ireland, that no company can see another company's data, and that a company's data is deleted on request. **Built 13 Sep 2026** at `/terms`, linked from the footer of every signed-in screen and from the sign-in page; it is outside the sign-in guard, because somebody deciding whether to accept an invitation has to be able to read it first. The text lives in `web/src/modules/legal/terms.ts` and each of the four promises above is asserted by a test, so one cannot quietly go missing.

### Accounts and alerts
Supabase, the web host and GitHub are all owned by the operator's own account. Alerts, backup
failures and uptime notices go to alp007panchal@gmail.com. If the team grows, move these
notifications to a shared company mailbox before adding more users, so nothing is missed while
one person is away.

**Uptime** is `uptime.yml`, a GitHub Actions job four times a day: it asks whether the site is
serving the app and whether Supabase answers, retries once before believing a failure, and goes
red — which is an email — when either is down. Four times a day rather than every five minutes
because Actions is billed by the minute on a private repository; a free external checker
(UptimeRobot, Better Stack) is the right tool for minute-level notice and the runbook says so
plainly rather than pretending this job is that.
**Errors** are recorded by the app itself (migration 0124): a screen that stops drawing, or a load
that fails, writes a row an administrator reads on **What broke**. The administrator should not
learn that the app is broken by being told.

### Testing
- Database: pgTAP tests for isolation and calculations, run in CI.
- Web: unit tests for formatting helpers; a short manual demo script per slice in `docs/`.

## 3. Folder structure

```
CostMatrix/
  README.md
  docs/
    spec.md  decisions.md  data-model.md  architecture.md  build-plan.md
    open-questions.md  operations.md (from slice 0)
    reference/           your quotation format and sample sheets
  supabase/
    config.toml
    migrations/
      0001_extensions_and_helpers.sql
      0002_tenancy.sql          companies, settings, profiles, roles, counters, RLS
      0003_library.sql          categories, components, assemblies, hours, rates, RLS
      0004_costing.sql          costings and children, views, functions, RLS
      0005_quotation.sql
      0006_crm.sql
      ...                       one file per change after that
    seed.sql
    tests/                      pgTAP: rls_*.sql, calc_*.sql
    functions/                  edge functions, only if the PDF fallback is needed
  web/
    package.json  vite.config.ts  tsconfig.json  index.html
    src/
      main.tsx
      app/                      router, layout shell, providers, route guards
      lib/                      supabase client, money and date formatting, generated DB types
      ui/                       Button, Table, Field, Select, Modal, Toast, EmptyState
      modules/
        auth/                   login, session, useRoles
        admin/                  master: companies, discounts, users · company: users, rates, margins, currency, quotation defaults
        library/                components, price history, assemblies, hours, overrides
        costing/                list, editor (panels, assemblies, items, labour), totals panel, submit/approve/return, revisions, history
        quotation/              release flow, PDF template, status, follow-ups
        crm/                    customers, contacts, projects, enquiries
      test/
  .github/workflows/
    ci.yml                      lint, typecheck, migrations + pgTAP on a throwaway database
    weekly-backup.yml            a full dump of production every Sunday, kept 90 days
```

Rules inside `web/src/modules/<name>/`:
- `api.ts` — every query and mutation for that module, nothing else
- `types.ts` — types for that module
- `pages/` — one file per screen
- `components/` — pieces used by those pages
- No file over roughly 300 lines. When one grows, split by screen or by concern.
