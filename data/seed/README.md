# Seed data — master component catalogue and kits

Built 8 Sep 2026 from Alpesh's `KITS AND CATALOGUE.zip`: six catalogue CSVs (`component-catalog-ALL`,
`-BUSBAR AND CABLES`, `-ACB`, `-ENCLOSURE`, `-SAMPLE`, `component-C&S`) and four kit exports
(`kits-export-2026-08-20 (3)`, `kits-export-C&S PORTFILIO`, `kits-export-2026-08-20 APFC BANK`,
`kits-export-2026-08-20 (3) -SAMPLE`). The originals are kept outside the repo. See
`docs/reference/current-costing-and-quotation-reference.md` §6 for what the data means and the open questions.

| File | Contents |
|---|---|
| `components.csv` | 735 components, one row per part number, same 13 columns as the source template (728 catalogue rows, one without a price, + 7 placeholders for parts the kits use that the catalogue lacks). |
| `category-map.csv` | Source `category` → BOM category (switchgear / accessories & hardware / busbar / fabricated enclosure parts), with counts. |
| `components-issues.csv` | 13 rows dropped, added as placeholders, or needing a decision. |
| `kits.csv` | 296 kits (assemblies), 720 lines — the app's kit-export columns plus `kitGroup` and `sourceFile`. |
| `kits-issues.csv` | 35 lines moved, renamed, dropped or flagged during clean-up. |
| `kit-group-labour-template.csv` | One row per kit group (17; ACB split by frame) with empty `hoursPanelAssembly`, `hoursWiring`, `hoursBusbarFabrication` columns — **fill this first**; the exports carry no labour hours at all (decision 11). |
| `kit-labour-template.csv` | One row per kit with the same three columns, for **overrides only** where a kit differs from its group. |

## Columns (`components.csv`)

`partNumber, description, category, priceEur, purchaseCurrency, listSellingPrice, unit, brand, rating, poles, breakingCapacity, frameSize, notes`

- `priceEur` is the **purchase price in EUR** for every row, including locally made enclosures and locally bought cable. `purchaseCurrency` is always `EUR`.
- `listSellingPrice` is `0` everywhere in the source — it is meant to be computed (see §6.2 of the reference doc: today's costings use EUR × 200 = KES).
- `unit` is `1` everywhere; the real unit of measure is implied by the category: busbar and cable are **per metre**, everything else per piece.
- `rating`, `poles`, `breakingCapacity`, `frameSize` were **blank in the source** and have been parsed from the description where the pattern was unambiguous (e.g. `630A,TP,MCCB, Adjustable, 36kA` → `630A / 3P / 36kA`). Poles are normalised to `1P/2P/3P/4P` (SP/DP/TP/FP in the text). Not parsed for accessories, busbar, cable, enclosures; for CTs the rating is the ratio (`1600A/5`). Treat as a first pass to review, not as manufacturer data.
- `notes` records every change made during clean-up (defaulted fields, inferred categories, duplicates, BOM-category hints).

## Clean-up applied

1. `component-catalog-ACB.csv` is a subset of `ALL` with identical prices — not used separately.
2. `ALL` contains the busbar / cable / enclosure rows but with blank descriptions; descriptions and brands were filled from the BUSBAR AND CABLES file.
3. `component-C&S.csv` (C&S range, 140 rows), `component-catalog-ENCLOSURE.csv` (9 enclosures, 1600 mm high) and `component-catalog-SAMPLE.csv` (the `CONTROLS & WIRING` lump sum, EUR 150) are not in `ALL` and were appended.
4. Section-header rows (`MCCB`, `BUSBAR`, `CABLE`, `ENCLOSURE`, …) and blank rows removed; whitespace trimmed; multi-line descriptions collapsed.
5. Categories normalised to upper case; `busbar-link` → `BUSBAR LINK`; blank categories inferred for 21 C&S rows (contactors, RCCB, RCBO, MCB changeover switches) and 4 controllers.
6. `?` in the SPD descriptions (a lost `：` character) replaced with `:`.
7. Duplicate part numbers: first occurrence kept, the rest listed in `components-issues.csv`. One exception: `3VJ1340-5DB32-0AA0` is Siemens' 400 A frame, so the 400 A row was kept and the 200 A row (probably `3VJ1320-…`) was dropped for confirmation.
8. Blank `purchaseCurrency` / `unit` defaulted to `EUR` / `1` (flagged in `notes`).
9. Seven part numbers used by kits but absent from the catalogue (four Siemens MCBs, a Siemens isolator, a C&S 125 A MCCB and a contactor interlock) were added as **placeholder rows with no price**, described from the kit export and flagged `PLACEHOLDER` in `notes`.

## Kits (`kits.csv`)

`kitName, linkedCategory, frameSize, laborHours, laborRate, partNumber, quantity, kitGroup, sourceFile`

- A kit is one main device plus its connection material: **ACB / changeover / disconnector kits carry copper busbar in metres**, **MCCB / MCB / RCCB kits carry cable in metres**. ATS and sync kits add two ACBs, meters, CTs, a controller and a `CONTROLS & WIRING` lump sum; APFC step kits add capacitor, contactor, fuses or a breaker; meterboards are complete small boards.
- `linkedCategory` is taken from the component catalogue for every line (the export's own values were inconsistent: `busbar`/`BUSBAR`, `MCB-C&S` on Siemens parts, blanks on controllers).
- `frameSize` keeps only the numeric ACB frame (1 = 3WJ11 800–1600 A, 2 = 3WJ12 2000–4000 A); the APFC and meterboard exports had put descriptions in that column.
- `laborHours` / `laborRate` are **blank in every source row** — hours are maintained per kit group with per-kit overrides (decision 8 Sep 2026); see the two labour templates.
- The two C&S 1250 A ATS/sync kits were exported with a Siemens ACB; per Alpesh's decision they now use `WX12N4PEDOA (S)`.
- `kitGroup` is the section header the kit sat under in the export (`ATS`, `INCOMER-KIT`, `APFC BANK`, …); kits that came before any header get their main device's category (`ACB`, `MCCB`, …).
- Clean-up applied: 13 busbar/cable lines that carried the wrong kit name (the 4P MCCB kits had lost their cable lines to their TP siblings, and similar) moved to the kit above them; 4 kit names fixed; 3 identical repeated lines dropped; the SAMPLE file's two ATS kits (older quantities) not imported; one blank quantity set to 1. Everything is listed in `kits-issues.csv`.

`scripts/build_seed.py <folder-with-originals>` then `scripts/build_kits.py <folder-with-originals>` reproduce these files from the originals (kits depend on the components file for categories).
