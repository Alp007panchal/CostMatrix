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

## The 13 decisions (short form; §5 has the full text)

1. Enclosure = catalogue cubicles × quantity + a company uplift %.
2. Every component has a purchase price and purchase currency; a landed-cost factor per
   currency (with the exchange rate) converts to KES.
3. Busbar = kg per metre × copper rate (KES/kg); both tables editable.
4. Labour = hours × rate per process type, never a % of material.
5. Margins are % of selling price: cost ÷ (1 − m); profit, then negotiation.
6. Each price-schedule line rounds **up** to the company increment (default 100).
7. Reference = company prefix + running sequence + revision (`NPP-193-REV0`).
8. Per-company default terms, editable per quotation.
9. Fixed letterhead per company; partner and certification logos in the footer.
10. Draft → submitted → approved → revisions; older revisions read-only.
11. Kits have lines; kit groups carry hours per process type; kits may override.
12. Four BOM exports: switchgear, busbar & cable, accessories & hardware, enclosure parts.
13. External companies: master-set discount, private kits and components, own currency at
    a frozen rate.

## Seed data

`data/raw/` holds the owner's exports, never edited. `scripts/build_seed.py` then
`scripts/build_kits.py` derive `data/seed/components.csv`, `category-map.csv`, `kits.csv` and
`kit-group-labour-template.csv`; `data/seed/README.md` (generated) lists columns, counts and
every flagged row. Placeholder parts without a price are allowed and flagged. Master EUR
conversion: 113 KES/EUR × landed factor 1.7699115 = 200 KES per EUR, back-solved from NPP-192.
`scripts/check_npp192.py` reprices the NPP-192 Option 1 sheet from the seed and prints §6.2.

## Acceptance (NPP-192 Option 1, reference §4 and §6.2)

Workbook: switchgear 2,520,637.80 · busbar & cable 1,236,360.00 · enclosure 408,000.00
(102 × 4,000) · material 4,164,997.80 · ÷0.8 → 5,206,247.25 · ÷0.9 → 5,784,719.17 · round
up to 100 → 5,784,800 · VAT 16 % 925,568 · total 6,710,368. Option 2: 7,684,700 /
1,229,552 / 8,914,252. Rebuilt from the seed the app gives material 4,012,709.80 (switchgear 2,279,621.80, busbar &
cable 1,325,088.00, enclosure 408,000.00; the differences are the workbook's, itemised in
§6.2) and reproduces the margin, rounding and VAT arithmetic exactly. This is automated as
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
- Branch `claude/costmatrix-planning-bq7j86`. **One pull request per feature; the owner
  reviews and merges.** While an earlier PR is still open, the next session goes on a branch
  stacked on it (`…-s1-foundation`, `…-s2-importer`) with its PR targeting the earlier branch;
  GitHub retargets to `main` when the earlier PR merges. Migrations reach production
  automatically on merge to `main`.
- Verify before claiming: `supabase/tests/run-local.sh`; in `web/` `npm run typecheck`,
  `npm test`, `npm run build`; and `python3 scripts/build_seed.py && python3
  scripts/build_kits.py` must leave `data/seed/` unchanged. Say plainly what could not be
  verified (this environment has no browser).
- Record every decision as one line in `docs/decisions.md`; keep `docs/build-plan.md` and
  `docs/open-questions.md` current; no source file over roughly 300 lines.

## Where things are

- `docs/spec.md` — the rules. `docs/data-model.md` — tables and isolation.
- `docs/operations.md` — the runbook the owner follows; update it when a screen changes.
- `docs/quotation-template.md` — the PDF layout, from the real NPP-192 quotation.
- `docs/acceptance-test.md` — the end-to-end click-through script.
- `docs/reference/` — the NPP-192 quotation and workbook, and the reference document above.
