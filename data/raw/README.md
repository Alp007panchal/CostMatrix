# Raw catalogue and kit exports

The owner's source files, committed exactly as received on 2026-09-09 (zip `KITS_AND_CATALOGUE.zip`).
Nothing in this folder is edited by hand. The owner cleaned these into `data/seed/` (see the
README there and `docs/reference/current-costing-and-quotation-reference.md` §6); the owner's
`scripts/build_seed.py data/raw` and `scripts/build_kits.py data/raw` reproduce the seed from
this folder (they need pandas and are not run in CI). `scripts/check_npp192.py` reprices the
NPP-192 workbook from the seed.

| File | What it is |
|---|---|
| `component-catalog-ALL.csv` | The master component catalogue, all makes and categories, EUR list prices |
| `component-catalog-ACB.csv` | Subset: air circuit breakers |
| `component-catalog-BUSBAR AND CABLES.csv` | Subset: busbar sizes and cables (irregular layout, see the script) |
| `component-catalog-ENCLOSURE.csv` | Subset: enclosure cubicles by size and form |
| `component-C&S.csv` | C&S make components |
| `component-catalog-SAMPLE.csv` | A one-row sample of the CSV format (its `CONTROLS & WIRING` row is imported; kits use it) |
| `kits-export-2026-08-20 (3).xlsx` | The kit library: groups, kits and their lines |
| `kits-export-2026-08-20 APFC BANK.xlsx` | Kits for APFC (power factor correction) banks |
| `kits-export-C&S PORTFILIO.xlsx` | Kits built on C&S components |
| `kits-export-2026-08-20 (3) -SAMPLE.xlsx` | A short sample of the kit export format (not imported: its two ATS kits differ from the main file's) |
