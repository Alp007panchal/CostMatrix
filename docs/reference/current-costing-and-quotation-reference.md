# How panels are costed and quoted today — and the rules the app follows

> **Draft written by Claude on 2026-09-09 for the owner to correct.** Everything below is
> read off the NPP-192 costing workbook, the NPP-192 quotation and the raw catalogue and kit
> exports in `data/raw/`. Nothing was assumed beyond what those files show; where a figure
> could not be read from them it is marked *(to confirm)*. Once corrected, **§5 of this
> document wins over every other document and over the existing code.** When the schema
> disagrees with §5, a forward migration changes the schema.

## 1. How a panel is costed today (the Excel method)

One workbook per job (`costing-NPP-192-REV1.xlsm`), one sheet per panel or per option
(`OPTION1`, `OPTION2`, `SYNC PANEL`, `AVR BYPASS`…). A sheet is a list of component lines under
section headings — INCOMER, ATS CONTROLS, SOLAR INCOMING SECTION, ACCESSORIES, APFC BANK,
OUTGOERS, BUSBAR, ENCLOSURE — each line carrying *Make, Item, Description, Reference (part
number), Price (KES), Qty*. Lines with no quantity count as zero.

Prices come from "db" sheets per make (`COSTING - SIEMENS db`, `C&S`, `COSTING - SCHNEIDER
ELECTRIC`), which are EUR list prices converted to KES. On the `OPTION1` sheet every catalogue
part that can be matched is priced at **exactly 200 KES per EUR** (27 of 39 matched lines; the
rest are hand-adjusted, see §6.2). The workbook's own exchange rate is 113 KES per EUR, so the
200 is 113 × a landed-cost factor of 1.77 covering freight, duty and clearing.

Busbar is listed per metre at the catalogue's EUR price × 200 (50×10 mm = 69 EUR → 13,800 KES
per metre). The db sheet also carries the copper rate, 3,000 KES per kg. The enclosure is a
single line, `ENCLOSURE(2100X4300X800)-3B`, 102 × 4,000 = 408,000 *(what the 102 counts is to
confirm — probably kilograms of sheet metal or a per-module figure)*.

The three section subtotals are added, then:

| Step | Formula | NPP-192 Option 1 |
|---|---|---|
| Material subtotal | switchgear + busbar & cable + enclosure | 4,164,997.80 |
| "Labour margin" | ÷ 0.8 | 5,206,247.25 |
| Profit margin | ÷ 0.9 | 5,784,719.17 |
| Negotiation margin | ÷ 1.0 | 5,784,719.17 |
| Selling price | ROUNDUP(…, −2) | 5,784,800 |
| VAT 16 % | × 0.16 | 925,568 |
| Total | | 6,710,368 |

## 2. What is wrong with it

- **Labour is a percentage of material** (the ÷ 0.8 step): a panel full of expensive breakers
  earns four times the labour of a cheap one that takes the same hours to build.
- Prices are copied by hand from db sheets and drift (§6.2 lists nine lines on Option 1 that no
  longer match the catalogue).
- Nothing is frozen: reopening an old workbook after a db update silently changes the quote.
- No kits: the same "250A MCCB plus 6.5 m of 30×10 busbar" is retyped on every sheet.
- The technical offer (Annexure IV) is written by hand from memory of what the sheet contains.

## 3. What the app must do instead

1. Cost a panel as **kits chosen by rating × quantity**, plus free components, plus enclosure
   cubicles from the catalogue with an uplift.
2. Price every part from a **purchase price in its purchase currency**, converted with a
   per-currency exchange rate and landed-cost factor; busbar from **kg per metre × copper rate**.
3. Labour as **hours × hourly rate per process type** (panel assembly, wiring, busbar), hours
   set on the kit group and overridable per kit, rates set per company.
4. Profit and negotiation margins as a percentage of the selling price, each price-schedule
   line rounded up to the company increment, VAT after.
5. Draft → submitted → approved, revisions after approval, every line frozen.
6. PDF quotation on the company letterhead with the four annexures, the technical offer
   generated from the kits; four bills of materials by category.
7. Several companies on one system, isolated; external companies with their own discount,
   currency, private kits and components.
8. CRM phase 1: customers, contacts, projects, enquiries, follow-ups.

## 4. Acceptance figures — NPP-192 (Triclover), quotation REV1

From the `OPTION1` and `OPTION2` sheets and `SCHEDULE OF PRICES`. The app must reproduce the
material subtotals from the seed within the differences listed in §6.2, and reproduce the
margin, rounding and VAT arithmetic exactly.

| Figure | Option 1 | Option 2 |
|---|---|---|
| Switchgear subtotal | 2,520,637.80 | |
| Busbar & cable subtotal | 1,236,360.00 | |
| Enclosure subtotal | 408,000.00 (102 × 4,000) | |
| Material subtotal | 4,164,997.80 | |
| ÷ 0.8 | 5,206,247.25 | |
| ÷ 0.9 | 5,784,719.17 | |
| ÷ 1.0 | 5,784,719.17 | |
| Round up to 100 | **5,784,800** | **7,684,700** |
| VAT 16 % | 925,568.00 | 1,229,552.00 |
| Total | **6,710,368.00** | **8,914,252.00** |

Rates in force: 113 KES per EUR; landed factor 1.769912 (so 200 KES per landed EUR); copper
3,000 KES per kg; VAT 16 %; rounding increment 100.

In the app the ÷ 0.8 step disappears: labour is hours × rate. The owner sets the hours in
`data/seed/kit-group-labour-template.csv`; until then the app's Option 1 selling price will
be lower than 5,784,800 by design, and the comparison is made on the material subtotals.

## 5. The thirteen binding decisions

All thirteen decisions are the owner's. Decisions 1, 2, 3, 5, 6, 7, 8, 9 and 11 are the
owner's words from the brief; 4, 10, 12 and 13 were written from the original brief and
confirmed by the owner on 2026-09-09.

| # | Decision | Status | What it means for the schema |
|---|---|---|---|
| 1 | The enclosure is priced as catalogue cubicles (the ENCLOSURE rows of the catalogue, by size and form) × quantity, plus a company-set uplift percentage for fabrication and finishing. | owner | `components.is_enclosure_cubicle`; `companies.enclosure_uplift_pct`, frozen on the costing. |
| 2 | Every component carries a purchase price and a purchase currency. A landed-cost factor per currency (with the exchange rate) converts it to KES. Master defaults, company overrides. | owner | `currency_factors` table; `components.purchase_price`, `purchase_currency`; `costing_items` freezes price, currency, rate and factor. |
| 3 | Busbar is priced from a copper rate in KES per kg and a kg-per-metre table by section. Both editable. | owner | Exists: `weight_per_unit` (renamed "kg per metre" in the UI) and `material_rates.copper_busbar`. |
| 4 | Labour is hours × an hourly rate per process type (panel assembly, wiring, busbar); never a percentage of material. | owner (confirmed) | Exists (D-001). |
| 5 | Profit and negotiation margins are percentages of the selling price: price = cost ÷ (1 − m). | owner | Exists (D-036). |
| 6 | Each line of the price schedule (one panel) is rounded **up** to a company-set increment, default 100. | owner | Exists per panel (D-037); *to confirm that "line" means the panel line, not each component*. |
| 7 | Reference numbers are the company prefix + a running sequence + the revision: `NPP-193-REV0`. | owner | Exists (D-035). |
| 8 | Each company has default commercial terms (validity, payment, delivery, timelines), editable on every quotation. | owner | Exists (`company_settings`). |
| 9 | Each company has a fixed letterhead: header logo, address block, partner and certification logos in the footer. | owner | Exists (`company_settings`, `company_footer_logos`). |
| 10 | Draft → submitted → approved; an approver may return a submitted costing with a comment; any change after approval creates a revision; older revisions are read-only. | owner (confirmed) | Exists (D-016–D-018). |
| 11 | A kit is a main device plus its lines (busbar, cable, accessories) with quantities. Kits belong to kit groups; the group carries the labour hours per process type; a kit may override them. | owner | New: `kit_groups`, `kit_group_labour`, `assemblies.kit_group_id`, `assemblies.rating`, `assembly_components.is_main_device`; existing per-assembly hours become the override. UI says "kit". |
| 12 | Four bills of materials by category: switchgear, busbar & cable, accessories & hardware, enclosure parts. | owner (confirmed) | Exists (`component_categories`). |
| 13 | External companies buy master parts at a master-set discount, keep private kits and components, and work in their own currency at a rate frozen into each costing. | owner (confirmed) | Exists (D-003, D-004, D-008). |

Frozen on every costing line, whatever the decision: purchase price, purchase currency,
exchange rate, landed factor, discount, kg per metre, copper rate, computed unit price;
hourly rates and hours on every labour line; margins, uplift, rounding increment and VAT on
the costing.

## 6. The catalogue and the kits

### 6.1 What the raw files are and how the seed is derived

`data/raw/` holds the owner's exports unedited. `scripts/build_seed.py` and
`scripts/build_kits.py` derive `data/seed/` from them; `data/seed/README.md` carries the
column meanings, the counts and every row the scripts flagged. In short:

- **Components** are the union of `component-catalog-ALL.csv` (Siemens and others),
  `component-C&S.csv`, the ENCLOSURE and BUSBAR AND CABLES files and the one-row SAMPLE.
  The first file to name a part wins; a different price elsewhere is flagged, not replaced.
  Heading rows (`3VJ11 SERIES`, `BUSBAR`, `CABLE`) and blank rows are skipped. Blank or zero
  prices are kept and flagged. Busbar rows get kg per metre = width × thickness × 8.96 g/cm³.
  Each raw category maps to one of the four BOM categories (`category-map.csv`).
- **Kits** come from the three kit workbooks (`(3)`, `APFC BANK`, `C&S PORTFILIO`; the SAMPLE
  file is a format sample and is not imported). A row carrying only a name is a **kit group**
  header for the kits below it; kits above the first header take their main device's category
  as group. The **main device** is the line marked 1 or 2 in the Frame Size column, otherwise
  the first line that is not busbar, cable or controls. Rating (`630A`, `50KVAR`) and poles
  (`TP`, `4P`) are parsed from the kit name. Parts a kit uses that the catalogue lacks are added
  to the catalogue as placeholders with no price.
- **Labour hours** are not in the exports (the columns are empty). The template lists every kit
  group × process type with blank hours for the owner to fill.

### 6.2 Expected differences when the app rebuilds NPP-192 Option 1

`scripts/check_npp192.py` reprices every priced line of `OPTION1` the way the app will and
prints this table. The differences are the workbook's, not the app's; they are listed so the
acceptance test can be judged.

| Subtotal | Workbook | App from the seed | Difference |
|---|---|---|---|
| Switchgear | 2,520,637.80 | 2,386,422.24 | −134,215.56 |
| Busbar & cable | 1,236,360.00 | 1,218,288.00 | −18,072.00 |
| Enclosure | 408,000.00 | 408,000.00 (typed in) | 0.00 |
| Material | 4,164,997.80 | 4,012,710.24 | −152,287.56 (−3.7 %) |

Where the −152,288 comes from:

1. **Busbar by weight, not by the catalogue metre price** (decision 3): 50×10 mm is
   4.48 kg/m × 3,000 = 13,440 against the workbook's 13,800; the five busbar sizes used on
   Option 1 come to 18,072 less. If the owner prefers the catalogue metre prices, decision 3
   changes and the difference vanishes.
2. **The two 800A withdrawable motorised ACBs** (`3WJ1108-2AE12-4DD0-Z F40+S55+T40`): the
   workbook has 330,432 each, the catalogue 1,398.72 EUR × 200 = 279,744. Difference 101,376.
   *(Workbook may include accessories priced elsewhere — to confirm.)*
3. **LOGO controller**: workbook 60,000, catalogue 154 EUR × 200 = 30,800. Difference 29,200.
4. **Rounded KES prices on the APFC capacitors and contactors** (ZJE…, CSTC…): the workbook
   rounds to the nearest 10 or 50 KES; net effect under 1,000.
5. **Small drifts**: 6A SP MCB 308 vs 246 (× 22 = 1,364), LM1340 meter 12,500 vs 11,500 (× 3
   = 3,000), 160A MCCB 14,200 vs 14,176, a few rounding cents on the ACBs.
6. Eleven lines are **not in the catalogue** and are kept at the workbook price: SYNCHRO CHECK
   RELAYS, CONTROLS, the Rishabh CTs (1600/5 and 800/5), `3WJ1108-2AE02-1AD1` (a typo for
   `…-1AD0`, which is in the catalogue at 171,562), timers and relays, the FK5526-230 filter fan,
   and the enclosure line. In the app these are typed as free components (or placeholder parts)
   at those prices.

Acceptance therefore reads: **rebuild Option 1 from the seed kits and free components; the
switchgear and busbar & cable subtotals must equal the "App from the seed" column above to the
shilling, and the margin, rounding and VAT steps must reproduce §4 exactly when applied to the
workbook's material subtotal.**

### 6.3 Data quality the owner should look at before import

`data/seed/README.md` lists each item. The important ones: fifteen kits with only a main
device (the 4P MCCB kits lost their cable line to the TP kit above them in the export; the
scripts flag the stray lines rather than move them); two 4000A ACB kits that look like one kit
typed twice; three duplicate part numbers; two C&S parts with two prices; seven APFC parts
missing from the catalogue; four Deepsea/LOGO controllers whose category is only "ACCESSORIES".
