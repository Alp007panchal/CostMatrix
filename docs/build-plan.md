# Build plan

The app is built in vertical slices. A slice is one complete workflow that works end to end,
from database to screen, with tests, before the next slice starts. Each slice ends with:
migrations merged, pgTAP tests green, a short demo script in `docs/demos/`, and new lines in
`decisions.md` for anything decided on the way.

Time estimates assume one developer working with you part-time and are rough.

## Progress

| Slice | State | Date |
|---|---|---|
| 0 — Foundation | **Done and live.** Signed in at cost-matrix-theta.vercel.app. | 2026-09-04 |
| 1 — Cost one panel end to end | **Built; awaiting the first real panel.** Library, rates, assemblies, costing editor and Excel round-trip all shipped. The done-when test below is yours to run. | 2026-09-08 |
| 2 — Quotation | **Built.** Release from an approved costing, PDF per the reference layout, wording defaults, logos, sent/won/lost. First real PDF to be compared against `docs/reference/quotation-NPP-192-REV1.pdf`. | 2026-09-08 |
| 3 — BOM exports | **Built.** Four category exports plus one workbook, Excel or CSV, from any costing. | 2026-09-08 |
| 4 — CRM phase 1 | **Built.** Customers, contacts, projects, enquiries with numbers, costings against enquiries, quotations addressed to customer records, enquiry status following the quotation, follow-up reminders. | 2026-09-08 |
| — | **Acceptance testing.** Building paused by the owner's decision after slice 4. The owner runs `docs/acceptance-test.md`; findings are fixed before anything new. | 2026-09-08 |
| — | **The owner's reference document and cleaned seed arrived (2026-09-09, second zip)** and replaced the derived ones; §5 is the owner's; the factor is one number (200), copper 15 EUR/kg, labour groups 17. |
| — | **Reconciliation with the thirteen decisions.** `docs/reference/current-costing-and-quotation-reference.md` §5 is now the source of truth; seed derived from the owner's exports; six sessions below replace slices 5–6. PR 1 (seed, reference document, plan) open for the owner. | 2026-09-09 |
| S1 — Foundation (0008–0009) | **Merged and live** (PR 2, then PR 7 to `main`). Currency factors, purchase price and currency, cubicles and uplift, kit groups with hours, main device, rating; Rates → Currency factors, Company → Enclosure uplift, Kits and Kit groups screens. 187 database assertions, 35 web tests. | 2026-09-09 |
| S2 — Master data & importer | **Merged and live** (PR 3, then PR 7 to `main`); the owner imported the seed on production. Import screen: components, kits and groups, kit-group hours, each with preview and reasons; placeholders; the owner's seed files load as they are in the test suite (735 parts, 17 labour groups, 296 kits, 720 lines, one main device each). | 2026-09-09 |
| — | **Hotfix, PR 8 to `main` (2026-09-09).** After the first production import the Components page went blank: the price formatter crashed on the eight parts without a price. Formatter made null-safe, error boundary added, render tests that load `data/seed` and draw both lists. | 2026-09-09 |
| S3 — Costing engine + NPP-192 acceptance | **Merged and live** (PR 4). Kits by group and rating, loose components and typed lines per panel, cubicle uplift on loose lines, revision copy fixed, category subtotals on the Totals card; test 15 rebuilds NPP-192 Option 1 from the owner's seed to the cent (without the disregarded enclosure line) and proves the margin, rounding and VAT arithmetic. | 2026-09-09 |
| S4 — Outputs | **Merged and live** (PR 5, then PR 11 to `main`). Annexure IV drafted from the kits and lines (button and release fallback), BOMs and price schedule checked against loose and typed lines. | 2026-09-09 |
| S5 — External companies | **Reviewed and merged** (PR 6, then PR 11 to `main`). Discount, currency, private library, overrides and master-admin reads all existed; added the Company column and filter on the cross-company lists, invitation by company, the kit ownership check on screen, the new-company checklist in the runbook, test 16; 272 database assertions. | 2026-09-09 |
| S6 — CRM gap review | **Reviewed, PR 6.** Customers, contacts, projects, numbered enquiries, costings against enquiries, quotations to customer records, status following the quotation and follow-ups all existed; added follow-ups on the home page and editing a customer's details. Built later by PR 18: the enquiry detail page listing its costings, quotations and files. | 2026-09-09 |
| — | **People: correcting a mistake (2026-09-10).** Migration 0012 and the remove-user function: the master administrator may move or remove somebody who has no records at all; everyone else is deactivated as before. Function errors now show their real message, and a new company reaches the People screen without a reload. | 2026-09-10 |
| — | **The owner's notebook: nine changes in five pull requests. All merged and live** (migrations 0013–0017, `main` at the PR 18 merge). PR 14 costing screen in one column and the operator's name in the history; PR 15 sections inside a panel; PR 16 copy a costing or a panel; PR 17 one enquiry, one decision (and no busbar in Annexure IV); PR 18 files kept with an enquiry, on an enquiry page of its own. Next: the owner runs `docs/acceptance-test.md` on what is live; nothing is waiting on a review. | 2026-09-10 |
| — | **Two tracks, and the advanced roadmap (2026-09-10).** The owner's roadmap (`docs/reference/roadmap-from-market-leaders.md`, foundations F1–F11) and AI-assistant spec arrived. `main` is now the basic app on production; a long-lived `advanced` branch holds all foundations and assistant work against a separate **CostMatrix Staging** project (D-169). Step 0 built the arrangement by code: `create-staging.yml` creates, wakes and seeds staging; "Deploy database" chooses its target by branch; advanced migrations start at 0100. | 2026-09-10 |
| F1–F3 — Foundations PR A | **Merged into `advanced`, on staging.** Migration 0100: component supplier, attributes, obsolescence, datasheet, lead time and price provenance; kit version, customer wording, labels, parameters and `qty_expression`; the kit version recorded on every costing line; a productivity factor per panel; actual hours; labour rate history. The kit-composition freeze was already built (D-177), so F2 needed no back-fill. | 2026-09-11 |
| F4–F11 — Foundations PR B | **Built** (PR 26). Migration 0101: panel `parameters`, `origin` and `origin_ref` on every costing line, one `documents` table replacing `enquiry_attachments`, `activity_log`. Migration 0102: `approval_rules` with one default rule per company and a read-only engine, `valid_until` and `price_snapshot_at`, `import_jobs`/`import_rows` filled from the batches, `company_options` with the assistant switched off everywhere, the three assistant tables. The `extract-document` Edge Function reads PDF, Word, Excel and text. Files strip on the costing screen. 483 database assertions, test 15 unmodified. | 2026-09-11 |
| F4–F11 — Foundations PR B | **Merged into `advanced`, on staging** (PR 26); "Deploy functions" made branch-aware by PR 27 so `extract-document` reached staging, where the owner verified the NPP-192 PDF reads. | 2026-09-11 |
| AI assistant PR A — core | **Merged into `advanced`, on staging** (PR 28). Migration 0103: nine read-only query functions behind the tools, `price_preview` to the cent against the engine, `assistant_allowance` and `assistant_record_usage`. `supabase/functions/_shared/ai/`: the provider seam, the Anthropic adapter, a fake provider, the nine tools, proposal validation, the budget decision, the context builder, the loop with limits. The `assistant` Edge Function streams server-sent events, logs every turn, refuses before any provider call when off, rate-limited or over budget. Spec tests 3, 5 and 6: 60 database assertions (543 in all) and 42 vitest tests (129 in all), no API key needed. Not yet run against Anthropic: the owner adds the key on staging. | 2026-09-11 |
| AI assistant PR B — UI | **Built, PR open into `advanced`.** The Assistant panel on the enquiry and costing screens with suggested actions and a streamed reply; the Proposal card (evidence, confidence, Accept / Change / Reject per line, unresolved items) and the Review card (most serious first, one-click fixes); migration 0104 applies what was accepted through the ordinary engine functions and stamps `origin = ai_proposal`, with `proposal.applied` and `proposal.rejected` in the activity log; the Assistant admin screen with the switch, the budget, the thresholds and six months of usage. A failed live call shows the reason and the remedy, no credit included. 596 database assertions, 178 web tests, spec tests 1, 2 and 4. | 2026-09-11 |
| Phase 2.2 — Supplier price lists | **Merged into `advanced`, on staging** (PR 30). Migration 0105: four-attempt matching, a preview that writes only `import_jobs`/`import_rows`, accept per row or all, discard, and the price history recording its source. The Price lists screen reads CSV, Excel or a PDF (through `extract-document`), guesses the columns, and shows old → new with the percentage; rows that need a person are listed with the reason. Master admin for the master catalogue, company admin for private parts. 658 database assertions, 205 web tests, NPP-192 unchanged. | 2026-09-11 |
| F12 — Physical dimensions | **Built, PR open into `advanced`.** Migration 0106: sizes, mounting type, clearances and weight on components; the usable internal area, chambers and form on an enclosure cubicle; optional footprint overrides on kits; the empty `panel_layouts` table for the layout canvas; `app.panel_fit`, an advisory area check with a 1.3 safety factor per company. `dimensions-template.csv` generated with all 735 part numbers for the owner to fill in, and its own importer that touches no price. Size and mounting boxes on the component form, footprint boxes on the kit form, one space line on the costing panel. 646 database assertions, 193 web tests, NPP-192 unchanged. Groundwork only: the layout canvas itself is roadmap 3.8. | 2026-09-11 |
| Phase 2.3 — BOM import | **Built, PR open into `advanced`.** Migration 0107: `match_catalogue_row` over everything the caller can see, the kit proposed where the row named its main device, `start_bom_import` previewing without touching the costing, and `apply_bom_import` bringing the chosen rows onto a panel of their own with `origin = import`. A placeholder fills the library but makes no line, because an unpriced part cannot be costed. The Import a parts list card on the costing screen reads CSV or Excel, guesses the columns and offers one choice per row. 757 database assertions, 244 web tests, NPP-192 unchanged. | 2026-09-11 |
| Phase 2.5 / 2.6 — Approval rules and validity | **Built, PR open into `advanced`.** Migration 0108: the rules engine wired into submit and approve with the default rule keeping today's behaviour, `approval_review` behind a "why this needs approval" panel, and a rules editor for company administrators. Quotations gain `expired_at` and `v_quotation_validity`; `expire_quotations` runs nightly under pg_cron where it exists, raises a follow-up on the ones that had been sent, and there is a by-hand button beside it; `reissue_costing` makes a new revision priced today. 805 database assertions, 266 web tests, NPP-192 unchanged. | 2026-09-11 |
| Phase 2 — what is left | **Not scheduled.** 2.7 options and alternatives on one quotation; 2.8 estimate against actual labour. | — |
| AI assistant — phase 2 | **Not scheduled.** Questions across all costings and the CRM, external companies, a per-document confidential flag, the APFC configurator. | — |

## Slice 0 — Foundation (about one week)

Not a user workflow, but everything else stands on it.

- **You first**: complete the setup checklist in `docs/operations.md` Part B — Supabase project in Ireland, the three GitHub secrets, Vercel connected, placeholder page loading. Nothing below can be tested until this is done.
- Install Supabase CLI; local database runs with `supabase start`.
- GitHub Actions workflow that applies migrations to production on merge to `main`, using the repository secrets.
- Migrations 0001 (extensions, `app` schema, helper functions) and 0002 (companies, settings, profiles, roles, counters, RLS).
- Seed: in-house company, master admin user, process types, categories.
- Web app: sign in, forgot password, session with company and roles, route guards, navigation.
- Home screen showing who you are and how your company is set up.
- Master admin screen: list every company, create one, set its discount.
- Company screen: currency, exchange rate, margins with the markup they imply, VAT, rounding step, quotation prefix.
- People screen: list, invite (through the invite-user Edge Function), grant and revoke roles, deactivate and reactivate.
- `supabase/bootstrap.sql` to create the first company and master administrator.
- CI: lint, typecheck, run migrations and pgTAP on a throwaway database.
- Weekly off-site backup job. (`docs/operations.md` is already written.)

Done when: you can sign in as master admin, create a test company, invite a user into it, sign
in as that user and see only that company's data, and CI is green.

## Slice 1 — Cost one panel end to end (RECOMMENDED FIRST, about two to three weeks)

Master admin:
- Components with category, make, part number, unit and KES price; price history on change.
- **Build the library by Excel upload**: download the template, fill it from the existing "db" sheets, upload, review the preview of new and changed rows, confirm. Download the library back to Excel at any time. There is no finished master list today, so this is how the library comes into existence.
- Rate-based components (busbar sizes with kg per metre) and the master copper rate, seeded at 3,000 KES/kg and editable.
- One or more master assemblies with material list and hours per process type.
- Master default hourly rates.

Company admin:
- Currency and exchange rate, labour hourly rates, material rates, material and labour margin (with "same for both"), rounding step, VAT %.

Costing engineer:
- Create costing (number issued, company settings frozen).
- Add panels with quantity, option label, unit of measure; add assemblies to a panel; change quantities of items; edit hours with source hours shown.
- Set negotiation margin (default 0).
- Totals panel per panel and per option: material, labour, margins, rounded unit price, subtotal, VAT, grand total, all from the database views.
- Submit.

Approver:
- Approve, or return to draft with a mandatory comment.
- History log visible on the costing.

Not in this slice: PDF, CRM, private library, revisions, BOM exports, master admin browsing.

**Why this slice first.** It is the whole reason the app exists. It exercises the frozen-price
and hours-based labour model that Excel gets wrong. Every later slice hangs off a costing.
Putting three or four of your real assemblies through it early will surface any misreading of
the labour model before the PDF, revisions and CRM are built on top of it. It also forces the
tenant isolation, role checks and calculation views to be right from the start.

Done when: the components for the reference job have been loaded by Excel upload, the job
(`docs/reference/costing-NPP-192-REV1.xlsm`, Option 1) rebuilt in the app reproduces its
material subtotal of 4,164,997.80 and the margin and rounding steps, a second test company
cannot see it, and an approver has approved one costing and returned one.

## Slice 2 — Quotation release and revisions (about two weeks)

- Company quotation defaults: letterhead, salutation and closing, signatory, notes on offer, the five terms sections, header logo, footer strip of partner logos and certification marks, currency word, quotation prefix.
- Panel technical description editor with the app-drafted text, and enclosure dimensions.
- PDF template exactly as `docs/quotation-template.md`, checked against `docs/reference/quotation-NPP-192-REV1.pdf`.
- Reference numbering: prefix + sequence + REV, sequence issued at first release.
- Release by approver: PDF rendered, uploaded to private storage, `app.release_quotation` records it. Download from the costing.
- Revision: "Revise" on an approved costing creates Rev N+1 in draft; older revision read-only with a banner; only current revision editable or quotable.
- Optional per-line "refresh price" on a new revision, logged in history.

Done when: a released PDF matches the reference layout, a revision can be made and released again, and the first PDF is unchanged.

## Slice 3 — BOM exports (about three days)

- Four category exports (switchgear, busbar, accessories & hardware, enclosure parts) as CSV and XLSX from any costing revision, quantities multiplied through assembly and panel quantities.

## Slice 4 — CRM phase 1 (about two weeks)

- Customers, contacts, projects with dropdown selection everywhere.
- Enquiries with numbering; costing linked to an enquiry (required for new costings from here on).
- Quotation status sent / won / lost with lost reason; enquiry status follows.
- Follow-up reminders: create on a sent quotation, in-app list of due and overdue per company, mark done. No email digest in this phase.
- `stage` and `owner` on enquiries stored now, funnel view later.

## The six sessions of the reconciliation (2026-09-09 onward)

Each session adapts what is live to the thirteen decisions, ends with tests green, and opens
one pull request that the owner merges. Details in `CLAUDE.md` and the reference document §5.

1. **Foundation** — migration 0008: `currency_factors`, purchase price and currency on
   components, enclosure cubicle flag and uplift, frozen factors on costing lines,
   `v_component_prices` recomputed. Migration 0009: `kit_groups`, `kit_group_labour`,
   `assemblies.kit_group_id`/`rating`, `assembly_components.is_main_device`, `v_assembly_hours`
   resolving override → group → zero. Documents updated. Done when the old test suite plus the
   new assertions pass and a 42 EUR busbar prices at 8,400 KES through the view.
2. **Master data & importer** — CSV import of `data/seed/components.csv`, `kits.csv`,
   `category-map.csv` and the filled labour template, with preview, validation (one main device
   per kit, unique kit names, placeholders without price allowed but flagged) and admin screens
   for currency factors, kit groups and cubicles. Done when the owner imports the seed into
   production through the screen.
3. **Costing engine** — add a kit by rating × quantity, free components, cubicles + uplift,
   per-line rounding confirmed, options, lifecycle and revisions re-verified; an SQL acceptance
   test that loads the seed into the throwaway database, builds NPP-192 Option 1 and asserts the
   §6.2 figures. Done when that test is green.
4. **Outputs** — Annexure IV technical offer generated from the kits (main device, rating,
   poles, lines), the four BOMs by `bom_category`, PDF re-checked against the reference.
5. **External companies** — discount, private kits and components, company currency with the
   frozen rate: verify what exists, add the master-admin read-only browsing and onboarding
   checklist from the old slice 5.
6. **CRM phase 1** — gap review against the brief; fixes only.

## The owner's notebook — five pull requests (all merged, 2026-09-10)

Nine findings from using the live app, in the order they were built. Each was one pull request
straight to `main`, reviewed and merged by the owner the same day.

14. **The costing screen reads top to bottom** — one column (totals, panels, bills of
    materials, history) instead of a two-column grid, and the history names the person who
    submitted, approved, returned or released (migration 0013, `v_costing_history`).
15. **Sections inside a panel** — Incomer, AVR bypass, ATS, 2nd incomer, Outgoers, Accessories,
    APFC bank, plus anything typed; a subtotal per section; the loose parts of a section gather
    in that section; Annexure IV takes its headings from them (migration 0014).
16. **Copy a costing or a panel** — as a new job (own number, revision 0, source untouched),
    into a new enquiry or none, re-priced at today's rates, with a list of anything that could
    not be re-priced (migration 0015).
17. **One enquiry, one decision** — revisions of one job group under their enquiry instead of
    reading as separate quotations; Won and Lost are decided on the enquiry, naming the winning
    quotation, with the others superseded; busbar drops out of Annexure IV (migration 0016).
18. **Attachments on an enquiry** — drawings, specifications and emails kept with the job, on a
    new enquiry page that also lists its costings and quotations (migration 0017).

19. **Options, alternatives and optional extras** (advanced track, roadmap 2.7) — a costing names
    which option it is offered as, so its total is the price of the job rather than the sum of two
    offers; a panel can be an optional extra, priced and printed but out of the total; the
    quotation prints each option's extras under its schedule and the BOM marks them (migration
    0109).

20. **Estimate against actual labour** (advanced track, roadmap 2.8) — hours actually worked
    recorded against a panel and process type, an estimate-against-actual table on the costing, and
    a labour variance report by kit group with a suggested new standard that only a person applies
    (migration 0110). Completes roadmap phase 2.

21. **The hours that belong to nobody** (advanced track, a gap in 2.8) — where a panel was costed
    at none of a kind of work there is no estimate to share its recorded hours out in proportion
    to, so the kit-group report reached none of them and they left no trace. They are now named
    beside the report, with what usually causes it (migration 0111).

22. **Parameterised kits** (advanced track, roadmap 3.3) — the engine reads the quantity formulas
    and kit parameters the foundations added and nothing used: a kit asks for its busbar metres or
    its steps, works its line quantities out from the answers, refuses a formula that is anything
    but arithmetic, and freezes the answers on the costing line. A kit with no parameters is
    unchanged (migration 0112). What 3.2 and 3.1 stand on.

23. **The APFC configurator** (advanced track, roadmap 3.2) — a target in kVAr proposes how many
    of each step kit reach it, graded the way the owner's own NPP-192 bank was built, from one
    family of step kit; the engineer edits the quantities and applies, and the steps land as
    ordinary kit lines in an *APFC bank* section (migration 0113). Decision 4's "later phase".

24. **Compatibility checks** (advanced track, roadmap 3.4) — three questions asked of every panel
    as rows anybody can read: will that device go into that cubicle, does that part belong to that
    device, do the outgoing ways add up against the incomer. Warnings under the panel name, a
    screen to change or silence each check, and a blocker an approval rule can act on
    (migration 0114). Advisory: no price, hour or total moves.

25. **Costing grid view** (advanced track, roadmap 2.9) — the whole costing as one grid, panels
    across and kits and components down, with in-place quantity editing through the same functions as
    the panel editor, a compare pair, the kit picker per column, attention marks for unpriced parts
    and the F12 space check, and an Excel export of what is on screen. **No migration**; the view
    preference is per person in their own browser.

26. **A switch per advanced feature** (advanced track, the road to production) — every feature
    built since the foundations sits behind a per-company switch that is off by default and only
    the master administrator can flip, which is condition 2 of the two-track rule and what makes
    a merge to `main` possible at all. Most switches hide a screen; three gate real behaviour
    (migration 0117).

## In hand right now

One line per roadmap item a session has started, so two sessions cannot build the same thing
twice — as happened with 2.8 on 2026-09-12, where a day's work went in the bin. Claimed before
the work begins, removed when the pull request opens.

| Item | Session | Since |
|---|---|---|
| (nothing in hand) | | |

26. **The guided board configurator** (advanced track, roadmap 3.1) — the questions a customer
    actually asks (supplies, incomer rating and type, changeover or sync, the feeder schedule,
    correction, metering, form, IP, access, cable entry) proposed as kits at quantities, editable,
    then applied through the ordinary kit function with the answers frozen on the panel
    (migration 0115). Standard boards in minutes; non-standard ones still kit by kit.

27. **Sales analytics** (advanced track, roadmap 3.6) — won, lost and still out there: the hit rate
    by customer, value band, month and product group, why jobs were lost in the words they were
    heard in, the margin achieved against the margin quoted from recorded hours, and the pipeline
    with what has run out (migration 0116). Read-only: views and a screen, no write anywhere.

29. **The busbar run calculator** (advanced track, roadmap 4.1) — the owner's `CU-OPT1` sheet in the
    app: a run a row at `phases × runs per phase × length × sets`, totals per bar size in metres,
    kilograms and money, bar sizes read from his own kits, a starting schedule built from the
    board's parameters, and the schedule set beside the metres the panel is actually costed at
    (migration 0118). Saving moves no price; applying adds ordinary busbar lines.

Slices 5 and 6 below are kept for the record; their items are folded into the sessions above
or into go-live.

## Slice 5 — Multi-tenant library features (about two weeks)

- Private components and private assemblies per company, with company admin setting hours, including Excel upload and download of the private library.
- Company override of master hours per assembly, shown beside master hours.
- Company price view with discount applied; master admin view showing both.
- Master admin read-only browsing of any company's costings, quotations and CRM.
- Onboarding checklist for a new external company (currency, rates, margins, users, quotation defaults).

## Slice 6 — Go-live hardening (about one week)

- Restore drill from the weekly dump into a fresh project, written up and dated in `decisions.md`.
- Staging environment added (second Supabase project plus preview deploys).
- Move production to the paid Supabase tier if it is not already.
- Monitoring: Supabase alerts, uptime check on the web app, error reporting in the browser.
- Custom domain and email sender for Supabase Auth invitations.
- Terms page published and linked at sign-up.
- One-page user guide per role.
- Bulk price update rehearsal: download the library, change prices, upload, confirm the preview and the price history.
- Assembly upload and download (assemblies, their components, their hours), if not finished in slice 1.

## Later phases (not scheduled)

Sales pipeline view, activities and call notes, email sending from the app, sales targets and
reports, hiding master components per company, company-defined categories.

## Working rhythm

- One slice at a time. No slice starts until the previous one's "done when" is met with you.
- Every change goes through a pull request with CI green; the owner reviews and merges (D-117).
- `decisions.md` is updated in the same pull request as the change it records.
