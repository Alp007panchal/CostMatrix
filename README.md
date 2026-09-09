# CostMatrix

Web application for end-to-end costing and quotation of electrical panel boards, built for
several companies at once (multi-tenant) on Supabase.

Status: slices 0–4 live at https://cost-matrix-theta.vercel.app; now being reconciled with the
thirteen decisions in `docs/reference/current-costing-and-quotation-reference.md` (start with
`CLAUDE.md` for the short version).

**Running it:** `docs/operations.md` — set-up checklist, day-to-day tasks, what to do when
something breaks, and backups. Start there if you are deploying or operating CostMatrix.

Understanding it:

- `docs/spec.md` — what the app does and the rules it follows
- `docs/decisions.md` — one-line log of every decision taken
- `docs/data-model.md` — tables, relationships and tenant isolation
- `docs/architecture.md` — tech choices explained plainly, folder structure
- `docs/build-plan.md` — build order as vertical slices
- `docs/acceptance-test.md` — the end-to-end test script for what is built so far
- `docs/open-questions.md` — what still needs an answer
- `docs/quotation-template.md` — layout of the PDF quotation and where each field comes from
- `docs/reference/` — the real quotation and costing workbook the design is based on, and the
  reference document with the thirteen binding decisions
- `data/raw/` — the owner's catalogue and kit exports; `data/seed/` — the seed derived from them
  by `scripts/`
