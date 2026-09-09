# CostMatrix — prompt for Claude Code (plan mode, branch claude/costmatrix-planning-bq7j86)

Before doing anything, read these files in the repo and treat them as the source of truth:

- `docs/reference/current-costing-and-quotation-reference.md` — how costing and quotations are done today, the requirements derived from real files, and in **§5 a table of 13 binding decisions**. §6 describes the master catalogue and kits.
- `data/seed/README.md`, then `data/seed/components.csv`, `kits.csv`, `category-map.csv`, `kit-group-labour-template.csv` — the master data the app must import. `scripts/build_seed.py` and `scripts/build_kits.py` show how they were produced.
- The planning docs already on this branch from the first planning pass.

Then, still in plan mode:

1. Reconcile the existing plan and data model with the reference document. Where they disagree, the reference document and its §5 decisions win. In particular make sure the model has: purchase price + purchase currency on components with a landed-cost factor per currency (decision 2); a copper rate and kg-per-metre table (3); kits with lines, kit groups carrying labour hours per process type with per-kit overrides (11); enclosure as catalogue cubicles plus an uplift (1); margins as % of selling price (5); per-line round-up to a company-set increment (6); reference numbers as company prefix + running sequence + revision (7); per-company default terms and fixed letterhead (8, 9); frozen prices, factors and rates on every costing line.
2. Write `CLAUDE.md` at the repo root: a short, durable summary of the product, the 13 decisions, the seed-data files, the NPP-192 acceptance figures from §4 of the reference document, and the build order below. Every future session must read it.
3. Slices 0–4 (foundation, library, costing, quotation, exports, CRM) are already built. Do not start again: produce a gap list — for each of the 13 decisions, what the existing code and migrations 0001–0007 already do, what must change, and what is new (seed importer for `data/seed/*` with validation that every kit has one main device and unique names, placeholder parts without a price allowed but flagged; kit-group labour hours with overrides; landed-cost factor per currency; enclosure cubicles + uplift; per-line rounding; reference numbering; company terms and letterhead). Order the gap list by dependency, one item per session, each ending with tests and a PR for review. Acceptance test for the costing engine: rebuild NPP-192 Option 1 from the seed and reproduce its material subtotals within the differences noted in §6.2.

Show me the reconciled plan and the draft `CLAUDE.md` before creating any application code.
