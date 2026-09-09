# Seed data — derived, never edited by hand

Generated from `data/raw/` by `scripts/build_seed.py` then `scripts/build_kits.py`
(Python 3, standard library only). Re-running both must leave this folder unchanged;
to change the seed, change the raw files or the scripts. What each rule means is
explained in `docs/reference/current-costing-and-quotation-reference.md` §6.

```
python3 scripts/build_seed.py && python3 scripts/build_kits.py && python3 scripts/check_npp192.py
```

## Files

| File | One row per | Columns |
|---|---|---|
| `components.csv` | part | `part_number, name, category, bom_category, brand, unit, purchase_price, purchase_currency, kg_per_metre, is_enclosure_cubicle, is_placeholder, source_file, flags` |
| `category-map.csv` | raw category | `raw_category, bom_category, is_busbar, is_enclosure_cubicle, parts` |
| `kits.csv` | kit line | `kit_group, kit_name, rating, rating_unit, poles, line_no, part_number, line_category, quantity, is_main_device, source_file, flags` |
| `kit-group-labour-template.csv` | kit group × process type | `kit_group, process_type, hours, note` — **hours are blank; the owner fills them in** |

Column notes:

- `purchase_price` is the catalogue price in `purchase_currency` (EUR throughout). The app
  converts to KES with the currency's exchange rate and landed-cost factor
  (master default 113 × 1.769912 = 200 KES per EUR, back-solved from NPP-192).
- `kg_per_metre` is filled for busbar sizes only: width × thickness × 8.96 g/cm³. The app
  prices busbar as kg per metre × the copper rate (default 3,000 KES/kg), not from the EUR
  price, which is kept for reference.
- `bom_category` is one of the four BOM export categories seeded by migration 0003:
  `switchgear`, `busbar`, `accessories_hardware`, `enclosure_parts`.
- `is_placeholder = yes` marks a part the kits use but the catalogue does not price; it
  imports with no price and must be priced before a costing that uses it can be submitted.
- `flags` (space-separated): `no-price`, `placeholder`, `from-kits`, `category-guessed`,
  `currency-assumed`, `price-differs:<file>=<price>` on components; `main-assumed`,
  `main-only`, `no-device-line`, `non-contiguous`, `stray-line(previous kit: …)`,
  `name-collision`, `merged-duplicate`, `quantity-assumed`, `unknown-part` on kits (kit-level flags sit on the main-device line).
- `is_main_device`: exactly one `yes` per kit. `rating`/`rating_unit`/`poles` are parsed
  from the kit name (`630A TP …` → 630, A, 3); blank when the name carries none.
## Counts
| What | Count |
|---|---|
| Components | 735 |
| — accessories_hardware | 74 |
| — busbar | 24 |
| — enclosure_parts | 23 |
| — switchgear | 614 |
| — placeholders (no catalogue price) | 7 |
| Kits | 297 |
| Kit lines | 722 |
| Kit groups | 17 |

Kits per group: ACB 80, ACCESORISES 3, APFC BANK 10, ATS 12, ATS-SWITCH 9, BUSBAR 1, INCOMER-KIT 12, ISOLATOR 1, MCB 60, MCCB 44, METERBOARD 6, METERBOARD-WITH ATS 6, ONLOAD CHANGEOVER 13, OUTGOER-KITS 12, RCBO 3, SWITCH DISCONNECTOR 13, SYNCHRONIZATION 12.

## What the scripts flagged — for the owner to check

### Components

**Duplicate part numbers inside one file** (first row kept):

- `3VJ1340-5DB32-0AA0` in `component-catalog-ALL.csv` row 367
- `3VJ9417-0AA21` in `component-catalog-ALL.csv` row 407
- `CSRCB02PC40A30-10KA` in `component-C&S.csv` row 172

**Same part, different price in two files** (first file wins, flagged):

- `CSE4NN630ATM3P-630A`: `component-C&S.csv` 210.25 vs `component-C&S.csv` 201
- `CS630NATU6303`: `component-C&S.csv` 275 vs `component-C&S.csv` 241.5

**Parts without a price:**

- `CSMBS3ISO63X` 63A TP MCB Isolator (`component-C&S.csv`)

**Parts used by kits but missing from the catalogue** (added as placeholders):

- `CSESL125FMU125A3P` (MCCB, `kits-export-2026-08-20 APFC BANK.xlsx`)
- `5SJ43508RC` (MCB, `kits-export-2026-08-20 APFC BANK.xlsx`)
- `5SY73328CC` (MCB, `kits-export-2026-08-20 APFC BANK.xlsx`)
- `5SY7310-8CC` (MCB, `kits-export-2026-08-20 APFC BANK.xlsx`)
- `5TE39137Y` (ISOLATOR, `kits-export-2026-08-20 APFC BANK.xlsx`)
- `5SL6263-7RC` (MCB, `kits-export-2026-08-20 APFC BANK.xlsx`)
- `LA9D50978X` (INTERLOCK, `kits-export-2026-08-20 APFC BANK.xlsx`)

**Category guessed** (raw category not in the map, put under switchgear):

- `DSE7320` raw category ACCESSORIES (`component-catalog-ALL.csv`)
- `DSE335` raw category ACCESSORIES (`component-catalog-ALL.csv`)
- `LOGO` raw category ACCESSORIES (`component-catalog-ALL.csv`)
- `DSE8610 MKII` raw category ACCESSORIES (`component-catalog-ALL.csv`)

Heading rows skipped: 24. Blank rows skipped: 63. Parts repeated identically across files: 110.

### Kits

Main device assumed to be the first line (no 1/2 marker): 217 kits.

**Kits with a main device and nothing else** (`main-only`; probably missing lines):

- `4000A 4P WITHDRAWABLE MOTORIZED ACB-KIT with changeover accessories-KIT`
- `4000A 4P WITHDRAWABLE MOTORIZED ACB with changeover accessories-KIT`
- `20A,4P,MCCB, Adjustable, 25KA-KIT`
- `25A,4P,MCCB, Adjustable, 25KA-KIT`
- `32A,4P,MCCB, Adjustable, 25KA-KIT`
- `40A,4P,MCCB, Adjustable, 25KA-KIT`
- `50A,4P,MCCB, Adjustable, 25KA-KIT`
- `63A,4P,MCCB, Adjustable 25KA-KIT`
- `80A,4P,MCCB, Adjustable, 25KA-KIT`
- `100A,4P,MCCB, Adjustable,25KA-KIT`
- `125A,4P,MCCB, Adjustable, 25KA-KIT`
- `2000A 3P MF WITH MIRCROPRO4.1 RELAY WM2 ACB-KIT`
- `2000A 4P EDO WITH MIRCROPRO4.1 RELAY WM2 ACB-KIT`
- `400A TP Adj Therm Adj Mag MCCB 25KA`
- `63A TP MCB Isolator-KIT`

**Kits whose lines are interleaved with another kit's** (`non-contiguous`; check the busbar line landed on the right kit):

- `20A,TP,MCCB, Adjustable, 25KA-KIT`
- `25A,TP,MCCB, Adjustable, 25KA-KIT`
- `32A,TP,MCCB, Adjustable, 25KA-KIT`
- `40A,TP,MCCB, Adjustable, 25KA-KIT`
- `50A,TP,MCCB, Adjustable, 25KA-KIT`
- `63A,TP,MCCB, Adjustable 25KA-KIT`
- `80A,TP,MCCB, Adjustable, 25KA-KIT`
- `100A,TP,MCCB, Adjustable,25KA-KIT`
- `125A,TP,MCCB, Adjustable, 25KA-KIT`
- `2000A 3P EDO WITH MIRCROPRO4.1 RELAY WM2 ACB-KIT`
- `630A TP Adj Therm Mag MCCB 630AF 36KA-KIT`
- `63A SP MCB 6KA 'C' Curve-KIT`

**Same kit name in two files with different lines** (`name-collision`, suffixed):

- none

**Lines that probably belong to the kit just above them** (`stray-line`; the export gives them the wrong kit name, so one kit is missing its cable and another has two):

- `20A,TP,MCCB, Adjustable, 25KA-KIT` — `16SQMM` — stray-line(previous kit: 20A,4P,MCCB, Adjustable, 25KA-KIT)
- `25A,TP,MCCB, Adjustable, 25KA-KIT` — `16SQMM` — stray-line(previous kit: 25A,4P,MCCB, Adjustable, 25KA-KIT)
- `32A,TP,MCCB, Adjustable, 25KA-KIT` — `16SQMM` — stray-line(previous kit: 32A,4P,MCCB, Adjustable, 25KA-KIT)
- `40A,TP,MCCB, Adjustable, 25KA-KIT` — `16SQMM` — stray-line(previous kit: 40A,4P,MCCB, Adjustable, 25KA-KIT)
- `50A,TP,MCCB, Adjustable, 25KA-KIT` — `16SQMM` — stray-line(previous kit: 50A,4P,MCCB, Adjustable, 25KA-KIT)
- `63A,TP,MCCB, Adjustable 25KA-KIT` — `16SQMM` — stray-line(previous kit: 63A,4P,MCCB, Adjustable 25KA-KIT)
- `80A,TP,MCCB, Adjustable, 25KA-KIT` — `25SQMM` — stray-line(previous kit: 80A,4P,MCCB, Adjustable, 25KA-KIT)
- `100A,TP,MCCB, Adjustable,25KA-KIT` — `25SQMM` — stray-line(previous kit: 100A,4P,MCCB, Adjustable,25KA-KIT)
- `125A,TP,MCCB, Adjustable, 25KA-KIT` — `35SQMM` — stray-line(previous kit: 125A,4P,MCCB, Adjustable, 25KA-KIT)
- `2000A 3P EDO WITH MIRCROPRO4.1 RELAY WM2 ACB-KIT` — `50X10MM` — stray-line(previous kit: 2000A 3P MF WITH MIRCROPRO4.1 RELAY WM2 ACB-KIT)
- `2000A 3P EDO WITH MIRCROPRO4.1 RELAY WM2 ACB-KIT` — `50X10MM` — stray-line(previous kit: 2000A 4P EDO WITH MIRCROPRO4.1 RELAY WM2 ACB-KIT)
- `63A SP MCB 6KA 'C' Curve-KIT` — `16SQMM` — stray-line(previous kit: 63A TP MCB Isolator-KIT)

**Lines with no quantity** (set to 1):

- `1600A 4P WITHDRAWABLE MOTORIZED ACB with changeover accessories-KIT` — `3WJ1116-2AE42-4DD0-Z F40+R55+T40`

**Unknown part numbers:**

- none

The JSON reports (`.components-report.json`, `.kits-report.json`) hold the full lists.
