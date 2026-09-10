# CostMatrix — read this first

## What this is

A multi-tenant web app that costs and quotes electrical panel boards. It replaces Excel
sheets that priced labour as a percentage of material. A panel is built from **kits** (a
main device plus its busbar, cable and accessories, chosen by rating), free components and
enclosure cubicles. Labour is **hours × an hourly rate per process type** (panel assembly,
wiring, busbar), set on the kit group and overridable per kit. Margins come at the end.
Prices, rates and factors are frozen on every costing line. A costing goes draft →
submitted → approved, then revisions; an approved costing releases a PDF quotation on the
company letterhead with four annexures, and four bills of materials.

Stack: Supabase (Postgres, Auth, Storage, row-level security) + Vite/React/TypeScript on
Vercel. Live at https://cost-matrix-theta.vercel.app; Supabase project `mssqjuzgycfpfmtjukvq`
(eu-west-1). Slices 0–4 of the first plan are live: library, rates, assemblies, costing
editor, quotation PDF, BOM exports, CRM phase 1.

## Source of truth

`docs/reference/current-costing-and-quotation-reference.md` §5 wins over any other document
and over the existing code. When it conflicts with the schema, write a forward migration
(0008 onward); never rebuild what already agrees.

## The 13 decisions (short form; §5 has the owner's full text)

1. Enclosure = catalogue cubicles × quantity + an uplift (percentage or fixed) for form
   3B/4B and extras; the workbook's 102 × 4,000 line is disregarded; no fabrication calculator.
2. The 200 is a landed-cost factor: **one admin-maintained number per purchase currency**;
   KES cost = purchase price × factor; both frozen on every costing line.
3. Copper busbar: one copper rate in **EUR per kg (15)** through the EUR factor, and a
   kg-per-metre table per bar size; busbar reprices when the rate changes, then freezes.
4. APFC bank = manual step kits added by quantity in phase 1 (the app shows total kVAr);
   a configurator later.
5. Margins are % of selling price (divisor style, 10 % = ÷0.9); the equivalent markup shown.
6. Each panel line's ex-VAT price rounds **up** to the company increment (default KES 100);
   VAT on the rounded figure.
7. Reference = company prefix + running number + revision (`NPP-193-REV1`); never resets.
8. Per-company default terms for the five Annexure III headings, editable per quotation.
9. Letterhead header and footer fixed per company, uploaded once.
10. Catalogue clean-up: duplicate C&S parts keep the higher price; the 200 A row with the
    400 A part number is dropped; the seven unpriced placeholders stay, flagged.
11. Labour hours per process type are held **per kit group (17 labour groups; ACB split by
    frame)** with per-kit overrides; `kit-group-labour-template.csv` first.
12. Standard kits fix their busbar and cable metres; no run calculator in phase 1.
13. The C&S 1250 A ATS and sync kits use the C&S ACB `WX12N4PEDOA (S)`.

## Seed data

`data/seed/` is the owner's cleaned master data, read as it is: `components.csv` (735 parts
in the supplier template columns, 7 placeholders and 1 catalogue part without a price),
`category-map.csv` (category → BOM category), `kits.csv` (296 kits, 720 lines),
`kit-labour-template.csv` (one row per kit: labour group, main device, override hours),
`kit-group-labour-template.csv` (17 labour groups, hours to fill), and the two issue lists.
`data/raw/` holds the original exports; the owner's `scripts/build_seed.py data/raw` and
`scripts/build_kits.py data/raw` reproduce the seed (pandas; not run in CI). Master EUR
factor 200; copper 15 EUR/kg; busbar kg per metre = catalogue EUR ÷ 15.
`scripts/check_npp192.py` reprices the NPP-192 Option 1 sheet from the seed and prints
`docs/reference/npp192-acceptance-from-seed.md`.

## Acceptance (NPP-192 Option 1, reference §4 and §6.2)

Workbook: switchgear 2,520,637.80 · busbar & cable 1,236,360.00 · enclosure 408,000.00
(disregarded, decision 1) · material 4,164,997.80 · ÷0.8 → 5,206,247.25 · ÷0.9 →
5,784,719.17 · round up to 100 → 5,784,800 · VAT 16 % 925,568 · total 6,710,368. Option 2:
7,684,700 / 1,229,552 / 8,914,252. Rebuilt from the seed without the enclosure line the app
gives material **3,622,781.80** (switchgear 2,212,282.00, busbar 1,176,600.00, accessories &
hardware 233,899.80; the workbook's own figure without the enclosure is 3,756,997.80 and the
134,216 gap is stale workbook prices, itemised in `npp192-acceptance-from-seed.md`), and
reproduces the margin, rounding and VAT arithmetic exactly. Automated as
`supabase/tests/15_acceptance_npp192.sql`; keep it green.

## Build order — one feature per session; each ends with tests green and a pull request

1. **Foundation** — migrations 0008 (currency factors, purchase price and currency,
   enclosure cubicles and uplift, frozen factors on costing lines) and 0009 (kit groups,
   group labour, main device, rating); documents updated.
2. **Master data & importer** — CSV import of `data/seed/*` with admin screens and
   validation: one main device per kit, unique kit names, placeholders flagged; the labour
   template import.
3. **Costing engine** — kits by rating × quantity, free components, cubicles + uplift, hours
   × three rates, margins, rounding, options, lifecycle, revisions; the NPP-192 acceptance
   test in SQL.
4. **Outputs** — PDF with four annexures, technical offer generated from the kits; four BOMs.
5. **External companies** — discount, private kits and components, company currency.
6. **CRM phase 1** — gap review against the brief.

Each session adapts what exists (see `docs/build-plan.md` for what is already live).

## How to work with the owner

- Decisions that are the owner's: **ask with options** (AskUserQuestion, two to four
  concrete choices, the recommended one first and marked "(Recommended)", one line of
  consequence each). One question at a time unless the questions are independent. The
  owner has asked for this explicitly and repeatedly.
- The owner is not a developer. Explain plainly, prefer boring well-documented tools, and
  never paste or request secrets in chat.
- Keep momentum inside an approved slice: build it to the end, verify, open the PR, report.
  Ask before anything destructive or outside the plan.
- **Two tracks (D-169, `docs/reference/two-track-setup.md`).** `main` is the basic app on
  production and must stay releasable: bug fixes, trial findings, labour hours, prices, the
  enclosure uplift rule. `advanced` is the long-lived branch for the foundations (F1–F11) and
  the AI assistant, against the separate CostMatrix Staging project. Work on a feature branch
  off the track you are on, **one pull request per feature, never stacked**, targeting that
  track. Advanced migrations are numbered from **0100**, basic ones from 0018 (D-170).
  Migrations reach production on merge to `main`, and staging on merge to `advanced`.
- Verify before claiming: `supabase/tests/run-local.sh` (it imports the real `data/seed`
  files and rebuilds NPP-192); in `web/` `npm run typecheck`, `npm test`, `npm run build`.
  Never edit `data/seed/*` by hand: it is the owner's data. Say plainly what could not be
  verified (this environment has no browser).
- Record every decision as one line in `docs/decisions.md`; keep `docs/build-plan.md` and
  `docs/open-questions.md` current; no source file over roughly 300 lines.

## Where things are

- `docs/spec.md` — the rules. `docs/data-model.md` — tables and isolation.
- `docs/operations.md` — the runbook the owner follows; update it when a screen changes.
- `docs/quotation-template.md` — the PDF layout, from the real NPP-192 quotation.
- `docs/acceptance-test.md` — the end-to-end click-through script.
- `docs/reference/` — the NPP-192 quotation and workbook, the reference document above, and
  `npp192-acceptance-from-seed.md` (what the seed rebuild gives and why it differs).
- `docs/prompts/` — the owner's kickoff prompt that set the build order.
