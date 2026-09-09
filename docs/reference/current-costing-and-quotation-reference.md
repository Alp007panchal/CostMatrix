# CostMatrix — Reference: how costing and quotations are done today

**Status:** reference document for the build. Describes the existing Excel/Word process that CostMatrix replaces, using one real project as the worked example, and lists the requirements that fall out of it and the decisions Alpesh has taken on them (§5).

**Source files (kept outside the repo):** `NPP192LV BOARD TRICLOVER INDUSTRIESREV1.xlsm` (costing workbook), `.docx` (quotation) and `.pdf` (issued quotation). Project: 1600A main LV switchboard for Triclover Limited, reference **NPP-192-REV1**, issued 30 June 2026.

**Related:** the master component price list and the proposed kits (assemblies), received 8 Sep 2026 as `KITS AND CATALOGUE.zip`, are described in §6 and have been cleaned into `data/seed/`.

---

## 1. The costing workbook

### 1.1 Workbook layout

One workbook per project, copied from a previous project. It contains:

| Sheet | Role |
|---|---|
| `OPTION1`, `OPTION2` | One full costing per board option. Only Option 1 was quoted. |
| `SYNC CONTROLS` | A small separate costing (synchronising controls) using the same layout and margin chain. Not carried into the final quotation. |
| `CU-OPT1` | Copper busbar length calculator feeding the busbar quantities. |
| `SCHEDULE OF PRICES` | Price schedule blocks (one per option) that pull the option totals; this is what gets pasted into the Word quotation. |
| `COSTING - SIEMENS db`, `COSTING - SCHNEIDER ELECTRIC` | Hidden. Older per-brand "database" costings that act as an informal price list. |
| ~10 other hidden sheets | Costings from previous projects left in the file when it was copied. |

The file is `.xlsm` and carries a VBA project, but no macros are needed to read the costing; everything is plain formulas.

**Observations that matter for the app**

- Every project workbook is a copy of the previous one, so old sheets, old prices and even the old date (`OPTION1!F1` still says 3 July 2025 while the quotation is dated 30 June 2026) travel from project to project.
- The costing sheet is simultaneously a catalogue and a costing: many rows have a price but no quantity (they are "available" items, priced at 0 × price). CostMatrix separates the two: a master component list, and a costing that only holds the items actually used.
- The same component appears with different prices in the same sheet (1600/5A CT at KES 4,200 and 7,200; 800/5A CT at 4,200, 3,200 and 1,360). This is the price-drift problem the master list + frozen-price rule is meant to fix.

### 1.2 Costing sheet structure (`OPTION1`)

Header block:

| Cell | Content |
|---|---|
| A1 / F1 | "CLIENT & REFERENCE" / date |
| A2 / C2 | "PROJECT TITLE" / `MAIN LV BOARD` |
| A3 / G3 | "LV SWITCHBOARD" / board tag `MBD-B` |

Line-item columns (row 4 headers):

| Col | Header | Meaning |
|---|---|---|
| A | Sr. No. | Optional running number |
| B | Make | Brand (SIEMENS, RISHABH, N-POWER, C&S, LINKWELL, CONNECTWELL, MATLUSAN, REPUTED, LOCAL, CHINA) |
| C | Item | Short name / rating (e.g. `630A,TP,MCCB, Adjustable, 36kA`) |
| D | Description | Longer description |
| E | Reference | Manufacturer part number (e.g. `3VJ1463-5DB32-0AA0`) |
| F | Price | Unit price, KES |
| G | *(no header)* | Quantity |
| H, I | helper | Ad-hoc helpers (kVAr per capacitor line, kVAr total) |

There is **no line-total column**. Section subtotals are `SUMPRODUCT(price range, qty range)`.

Sections, in order, with the Option 1 values:

| Section (row label) | Rows | Notes |
|---|---|---|
| INCOMER | 8–9 | 1600A 4P & 800A 4P withdrawable motorised ACBs |
| ATS CONTROLS | 13–17 | PLC (LOGO), synchro-check relays, "CONTROLS" lump sum KES 60,000, CTs |
| SOLAR INCOMING SECTION | 20 | 1600A 3P fixed manual ACB |
| ACCESSORIES | 23–31 | Pilot lamps, 6A SP MCBs, MFMs, CTs, SPD, fuse |
| APFC BANK-400 KVAR | 35–57 | ACB, controller, capacitors, capacitor-duty contactors, fuses, fuse bases, busbar supports, timers/relays, CT, fan & filter, cable |
| OUTGOERS | 60–66 | MCCBs 630A → 125A |
| **Sub-Total for Switchgear** | 70 | `=SUMPRODUCT($F$7:$F$68*G7:G68)` = **2,520,637.80** |
| BUSBAR | 72–101 | Copper bar by size, distribution busbars/terminal boxes, cable by size, cable duct, terminals |
| **Sub-Total for Busbar & Cable** | 102 | `=SUMPRODUCT($F$72:$F$101*G72:G101)` = **1,236,360.00** |
| ENCLOSURE | 104 | One line, see 1.4 |
| **Sub-Total for Enclosure** | 105 | = **408,000.00** |
| **Sub-Total** | 106 | Sum of the three = **4,164,997.80** |

These three subtotals are the only cost groupings the sheet knows. They do **not** map cleanly to the BOM categories CostMatrix must output (lamps and MCBs sit under "Switchgear"; cable, duct and terminals sit under "Busbar"). CostMatrix therefore needs a **category on the component**, independent of which assembly it sits in.

### 1.3 Derived quantities inside the APFC section

The APFC bank is the one place the sheet already behaves like a parameterised assembly:

- Capacitor steps are chosen by quantity (4 × 50 kVAr, 4 × 25, 6 × 12.5, 5 × 5) with helper cells `H37:H40 = kVAr × qty` and `I39 = SUM(H37:H40)` = 400 kVAr, i.e. the engineer tunes quantities until the bank size is met.
- Every other quantity is a formula off the capacitor quantities: contactors `G42 = G37` … `G45 = G40`; fuse links `G46 = G37*3` (three per capacitor); fuse bases `G50 = SUM(G37:G41)`; busbar supports `G51 = G50`.

This is the pattern to support generally: **an assembly whose component quantities are expressions of a small number of input parameters** (here: capacitor step quantities). Phase 1 can hard-code the APFC rules; longer term, assembly definitions should allow `qty = f(parameter)` rather than a fixed number.

### 1.4 How busbar and enclosure are priced

**Copper busbar.** Price per metre is derived, not looked up: `price/m = kg/m × KES/kg`, with copper at **KES 3,000 per kg** hard-coded in the formulas (`F72 = 9*3000` for 100×10 mm, `F78 = 1.8*3000` for 20×10 mm, and so on). Quantity is in **metres**.

Sizes present (mm, kg/m used): 100×10 (9), 80×10 (7.2), 60×10 (5.4), 50×10 (4.6), 40×10 (3.6), 30×10 (2.8), 20×10 (1.8), 40×5 (1.8), 30×5 (1.4), 20×5 (fixed KES 2,250/m).

Metres come from the `CU-OPT1` sheet, one row per bar run: `total length = phases × runs per phase × length (m) × number of sets`, then `SUMIF` by size. Row names show the runs a board needs: incoming tails, horizontal busbar (HBB) per section, vertical busbar (VBB), changeover/ATS tails, solar ACB tails, outgoing tails, APFC tails, earth bar.

Note: the metres typed into `OPTION1!G75:G79` (30 / 18 / 13 / 77 / 8) do not equal the `CU-OPT1` totals (70.4 / 12.8 / 9.9 / 95.3 / 7.2). The calculator informs the estimate but is not linked to it. Per decision 12 (§5) the app does not reproduce this calculator: standard kits carry fixed busbar metres, adjusted by hand on non-standard boards.

**Enclosure.** One line: `ENCLOSURE(2100X4300X800)-3B`, `D104 = 102`, `E104 = 4000`, `F104 = E×D = 408,000`, qty 1. The 4,300 mm width is the two proposed enclosures side by side (3,500 + 800). Option 2 uses `2100X6200X800`, `145 × 4000 = 580,000`. The 102/145 figure scales roughly with width and is priced at KES 4,000 per unit — a fabricated-steel measure whose unit was never defined; per decision 1 (§5) this method is dropped in favour of catalogue cubicles plus an uplift. The "Make" column says *form 4B* while the description and quotation say *Form 3B* — another copy-forward inconsistency.

### 1.5 The margin chain (legacy — to be replaced)

From the subtotal `S` (row 106):

| Row | Label | Formula | Option 1 value |
|---|---|---|---|
| 107 | Sub-Total + Labour Margin | `= S / 0.8` | 5,206,247.25 |
| 108 | Sub-Total + Profit Margin | `= row107 / 0.9` | 5,784,719.17 |
| 109 | Sub-Total + Negotiation Margin | `= row108 / 1` | 5,784,719.17 |
| 110 | TOTAL (KES) | `= ROUNDUP(row109, -2)` | **5,784,800** |
| 111 | (feeds schedule) | `= row110 * 1` | 5,784,800 |

Points to carry into the app:

- Margins are expressed as **divisors** (`/0.8`, `/0.9`), i.e. as a share of the *selling price at that stage*, not a markup on cost. `/0.9` means "profit is 10% of price", which is an 11.1% markup on cost. Helper cells `I107:J107` compute the overall uplift: 1,619,802 / 4,164,998 = **38.9%** over material. The app should let the user enter margins the way the team thinks about them (% of selling price) and show the resulting markup, or vice-versa, but must be explicit about which it is.
- **Labour is 25% of material cost (the `/0.8`) regardless of the work involved.** This is the practice CostMatrix replaces with `hours × rate` per assembly across the three process types (assembly, wiring, busbar fabrication). The legacy percentage method is documented here for reference only and is not to be implemented.
- Rounding: final KES total rounded **up** to the nearest 100. (The older `db` sheet rounds to the nearest 10 and also converts to EUR at a typed rate — evidence that a currency conversion at a frozen rate is an existing need.)
- A "negotiation margin" slot exists and is usually 1 (no effect). Keep it as an optional third margin.
- Rounding is applied once, to the ex-VAT panel price; VAT is then calculated on the rounded figure.

### 1.6 Schedule of prices sheet

Feeds the quotation. One block per option:

| Item No | Description | UOM | Qty | Unit price (KSH) | Total (KSH) |
|---|---|---|---|---|---|
| 1 | 1600A MAIN LV BOARD | PC | 1 | `=OPTION1!G111` → 5,784,800.00 | `=F×E` → 5,784,800.00 |

followed by three rows: *Sub total Amount in KSH, Ex-works, Nairobi (subject to VAT)*; *16% VAT-IN KSH.* (`=subtotal×0.16` = 925,568.00); *Total Amount in KSH, Ex-works, Nairobi (Inclusive of VAT)* (6,710,368.00). VAT rate is hard-coded in the formula.

---

## 2. The quotation document

Produced in Word from a previous quotation; the price schedule is pasted in from Excel **as a picture** (an embedded EMF object), so nothing in the document is linked to the costing. The issued PDF is a print of the Word file.

### 2.1 Page furniture

- **Header (every page):** company logo top-left; top-right block: P.O. Box, street address, "Office lines:" two phone numbers, "Email:". A coloured rule under the header.
- **Footer (every page):** row of partner-brand logos (Siemens, C&S Electric, etc.) and a one-line product list ("MV Switch Gear • Power Transformer • Power Control Panels • …"), then a decorative band.
- Portrait A4, five pages; Arial 9–10 pt body; section titles bold, underlined, centred.

Because CostMatrix is multi-company, header/footer content (logo, address, phones, email, partner logos, tagline) must be **per-company settings**, not fixed in the template.

### 2.2 Page 1 — covering letter

```
Reference No.: NPP-192-REV1                         Tuesday, 30 June 2026

To: TRICLOVER LIMITED

Dear Sir/Madam,

QUOTATION FOR SUPPLY ONLY OF LV SWITCHBOARDS          (bold, underlined)

We thank you for your enquiry for the above project, and are pleased to quote as follows: -

Annexure 1:   Notes/ Comments on Our Offer
Annexure 2:   Commercial Terms (Schedule of Prices)
Annexure 3:   Specific Terms & Conditions
Annexure 4:   Detailed Technical Offer & Data Sheets

We trust that you will find our offer in line with your requirements and should you require
any further information, please do not hesitate to contact the undersigned.

We trust this meets with your requirements.

Yours Faithfully,
<Signatory name>            (bold)
<signatory email>           (link)
<Company legal name>        (bold)
```

Fields: reference number (prefix `NPP-`, sequence `192`, revision suffix `-REV1`), long-form date, client name, subject line, list of annexures, signatory (name, email, company). Annexures are always listed even when one is short.

### 2.3 Annexure I — Notes / comments on the offer

Free-text bullets, lettered, describing what was offered:

- Enclosure form and rating: "Free Standing Electro-Statically powder coated **Form 3B, IP31** LV BOARD with **Front Access, Bottom** cable entry and exit."
- Switchgear brand: "We have offered **SIEMENS ELECTRIC Switchgear**."
- Scope: "Our offer is for supply only (Ex-Works Nairobi) and does not include site delivery, assembly, testing and commissioning."

These are attributes of the costing (enclosure form, IP rating, access, cable entry, brand, scope) and can be generated from fields plus an editable notes box.

### 2.4 Annexure II — Commercial terms (price schedule)

Title "1.LV BOARDS PRICE SCHEDULE", then the table from §1.6 exactly as in the sheet (Item No, Description, UOM, Qty, Unit price, Total; subtotal ex-works subject to VAT; 16% VAT; total inclusive of VAT), currency shown as "KSH". Amounts formatted `#,##0.00`. One row per panel line item in the costing.

### 2.5 Annexure III — Specific terms & conditions

Numbered headings with bullet text:

1. **Scope of supply** — supply only; excludes site delivery, assembly, testing and commissioning.
2. **Validity period** — open for acceptance for **30** days from the date hereof; thereafter subject to confirmation.
3. **Terms of payment** — 50% advance with order; 50% before collection or within 30 days of notification that goods are ready for collection.
4. **Delivery terms** — Ex-Works Nairobi.
5. **Delivery timelines** — To be confirmed after order confirmation (TBA).

Requirement: a per-company **terms library** with defaults (validity days, payment terms, delivery terms, delivery timeline text, scope text) that pre-fills each quotation and can be edited per costing.

### 2.6 Annexure IV — Detailed technical offer

Title "1.LV BOARD TECHNICAL DETAILS", then a four-column table:

| SR. NO | PARTICULAR | TECHNICAL DESCRIPTION LV SWITCHGEARS | QTY |
|---|---|---|---|
| 1) | MAIN LV BOARD-OPTION 1 | *(text below)* | 1 |

The description cell contains a standard preamble ("This will be a free-standing, electrostatically powder-coated Form 3B LV board, IP31, with front and rear access, bottom cable entry. Built to IEC 61439-1 & 2 standards, KEBS certified, and compliant with ISO 9001, ISO 14001, ISO 45001 and full EHS requirements and will consist of the following:") followed by **lettered sections, each with a bullet list of components**:

- a) INCOMING CHANGEOVER SECTION — 1 No. 1600A FP ACB (KPLC); 2 No. 800A FP ACB (GEN); 2 No. synchro check relays; set of CTs; controls and wiring; TPN busbar; 3 sets indicator lamps with protection MCBs; mains/gen on-load indicators; 3 No. multifunction meters; 3 sets CTs and protection for meters.
- b) INCOMING SOLAR SECTION — 1 No. 1600A FP 55kA manual ACB; 1 set indicator lamps with MCBs.
- c) OUTGOERS — 1 × 630A, 3 × 400A, 5 × 250A, 1 × 200A, 3 × 160A, 3 × 125A TP MCCBs with fault ratings.
- 400KVAR APFC — 800A TP ACB; APFC controller; 1600/5A CT; fuses; capacitor-duty contactors and capacitors; fan and louvre.

Then "Proposed Enclosure: 2100(H)3500(W)X800(D)MM" and "Proposed Enclosure: 2100(H)800(W)X800(D)MM".

This maps directly onto the CostMatrix model: **each lettered section is an assembly; each bullet is a component line with its quantity** (with wording like "1 No." / "Set of"). The technical offer can therefore be generated from the costing, with the preamble, the "customer-facing" wording per component, and the enclosure dimensions as editable fields. Note the quotation's quantities differ slightly from the costing (costing has 6 × 250A MCCB and lists the 200A with no quantity; the quotation says 5 × 250A and 1 × 200A) — manual re-typing is where such drift comes from.

---

## 3. What the current process does *not* do (gaps the app closes)

- No link between costing and quotation; prices are retyped or pasted as an image; dates and revision numbers are edited by hand.
- No price history: a price change in one sheet does not propagate, and old costings silently keep whatever was typed.
- Labour is a flat 25% uplift, unrelated to hours.
- No approval step; anyone with the file can issue a quotation.
- No BOM outputs; purchasing works from the costing sheet.
- Options (Option 1 / Option 2) are separate sheets with duplicated content.
- No CRM: client, enquiry and quotation status live only in file names and email.

---

## 4. Requirements derived from the files

**Master data** (see §6 for the catalogue itself)

- Component fields: part number, description, category, **purchase price + purchase currency (EUR today)**, unit of measure (piece; metre for busbar and cable), brand, rating, poles, breaking capacity, frame size, notes; plus a BOM category (switchgear / busbar / accessories & hardware / fabricated enclosure parts) derived from category by default and overridable per component; and an "is lump sum" flag for lines like "CONTROLS" and "Timers and relays" that carry a price with no part number.
- **Costing price in KES = purchase price × a landed-cost factor per purchase currency** (decision 2), maintained by the master admin (200 for EUR today, see §6.2). The KES figure, not the EUR one, is what gets frozen into a costing, together with the factor used.
- A **copper rate** (EUR/kg; 15 today) and a **kg-per-metre table per bar size**, maintained by admin (decision 3); busbar prices are kg/m × copper rate, recalculate when the rate changes, then freeze into costings like any other price.
- **Enclosures** are catalogue items: standard free-standing cubicles (W×D×H, form 2B, 1600 or 2100 mm high) and wall-mounted boxes at a fixed price each. A board's enclosure = a number of cubicles **plus an uplift** for form 3B/4B, partitions and extras (decision 1; the uplift rule is still to be defined). The enclosure line carries form, IP rating, access and cable entry, which feed the quotation text.

**Assemblies**

- The sections used in practice: incomer / changeover, ATS or sync controls, solar incoming, accessories (lamps, MCBs, metering, SPD), APFC bank (parameterised, §1.3), outgoers, busbar (calculated from runs, §1.4), enclosure, plus wiring/cable/terminals.
- The proposed kits (§6.5) already define 296 of these as *device + connection material* assemblies (an ACB with its busbar metres, an MCCB with its cable metres, ATS/sync pairs with meters, CTs, controller and a controls lump sum). A costing is therefore built mostly by picking kits by rating and quantity; free components are the exception.
- Labour hours per process type (assembly, wiring, busbar fabrication) are held **per kit group with per-kit overrides** (decision 11); none exist yet (`data/seed/kit-group-labour-template.csv`).
- Assemblies need customer-facing wording (the Annexure IV bullets) separate from internal component names.

**Costing**

- One costing has one or more **panel line items** (the schedule rows), each with assemblies and a quantity; the existing schedule already has UOM "PC" and qty per row.
- Margins: profit and optional negotiation margin per costing, entered as **% of selling price** with the markup equivalent shown (decision 5); labour from hours × rate per process type. Rounding: each panel line's ex-VAT price rounded up to the nearest KES 100, increment a company setting (decision 6).
- VAT rate as a company/country setting (16% today), applied on the schedule, never inside unit prices.
- Options: allow alternative panel line items marked as options so one quotation can present Option 1 / Option 2 price blocks.
- Sub-costings such as sync controls should be assemblies (or separate line items), not separate sheets.

**Quotation (PDF)**

- Company-level: letterhead header and footer fixed per company (logo, address block, phones, email, partner-logo strip, tagline — decision 9), legal name, default signatory, default terms for the five Annexure III headings (decision 8), reference prefix and running sequence (decision 7).
- Costing-level: reference number `<prefix>-<sequence>-REV<n>` assigned by the app, date, client name, subject, notes (Annexure I), price schedule (Annexure II), terms (Annexure III, pre-filled from company defaults, editable), technical offer (Annexure IV, generated from assemblies, editable), proposed enclosure dimensions.
- Revision suffix comes from the costing revision.

**BOM outputs** — by component category, per panel line item and per costing: switchgear; busbar (size, metres, kg); accessories & hardware (cable by size, terminals, duct, distribution boxes, lamps, MCBs, fuses…); fabricated enclosure parts.

**Test fixture** — Option 1 of NPP-192 is a good acceptance test for the pricing engine once prices are seeded: material subtotals 2,520,637.80 + 1,236,360.00 + 408,000.00 = 4,164,997.80; legacy uplift ÷0.8 ÷0.9 → 5,784,719.17; round up → 5,784,800; VAT 925,568.00; total 6,710,368.00.

---

## 5. Decisions (Alpesh, 8 Sep 2026)

All open questions from the first draft were answered on 8 Sep 2026. These are binding for the build.

| # | Topic | Decision |
|---|---|---|
| 1 | Enclosures | A board's enclosure is a number of catalogue standard cubicles **plus an uplift** (percentage or fixed) for form 3B/4B, internal partitions and extras. The old "102 × KES 4,000" line in the workbook is to be disregarded; no fabrication calculator. |
| 2 | EUR→KES factor | The 200 is a **landed-cost factor** (exchange rate + freight, duty, handling), held as **one admin-maintained number per purchase currency**. KES cost = purchase price × factor; both are frozen into each costing line. |
| 3 | Copper busbar | Admin maintains **one copper rate (EUR/kg)** and a **kg-per-metre table per bar size**; busbar prices recalculate when the rate changes and freeze into costings like any other price. |
| 4 | APFC bank | **Manual step kits in phase 1** (50 / 25 / 12.5 / 5 / 2.5 kVAr fuse or breaker kits added by quantity; the app shows the total kVAr). A guided configurator is a later phase. |
| 5 | Margins | Profit and negotiation margins are entered as **% of selling price** (divisor style, as today: 10% = ÷0.9); the app shows the equivalent markup on cost alongside. |
| 6 | Rounding | Each panel line's ex-VAT price is **rounded up to the nearest KES 100** by default; the increment is a per-company setting. VAT is calculated on the rounded figure. |
| 7 | Reference numbers | **Company prefix + running number + revision** (e.g. `NPP-193-REV1`); the app assigns the next number, the sequence never resets, revisions append `-REV n`. |
| 8 | Terms & conditions | **Per-company defaults** for the five Annexure III headings; every quotation starts from them and can be edited. |
| 9 | Letterhead | Header and footer (address block, partner-brand logos, tagline) are **fixed per company** — uploaded once, shown on every quotation. |
| 10 | Catalogue clean-up | Where a C&S part is listed twice, **keep the higher price**. **Drop the 200 A row** that reused the 400 A Siemens part number. **Keep the seven unpriced placeholder parts**; costings that use them show a warning until priced. |
| 11 | Labour hours | Hours for the three process types are maintained **per kit group, with per-kit overrides**. `data/seed/kit-group-labour-template.csv` (17 groups; ACB split by frame) is the table to fill first; `kit-labour-template.csv` is for overrides only. |
| 12 | Busbar metres | **Standard kits fix their busbar/cable metres**; no run calculator in phase 1. Engineers adjust metres manually on non-standard boards. |
| 13 | C&S 1250 A kits | The C&S 1250 A ATS and sync kits use the **C&S ACB `WX12N4PEDOA (S)`**, not the Siemens 3WJ1112 (applied in the seed). |

Still needed from Alpesh: the group labour hours (decision 11), prices for the seven placeholder parts (decision 10), the uplift rule for form 3B/4B enclosures (decision 1), and a busbar line for the C&S 400 A TP MCCB kit (`kits-issues.csv`).

---

## 6. Master component catalogue and kits (received 8 Sep 2026)

### 6.1 What was received

Four CSVs in one import template with columns `partNumber, description, category, priceEur, purchaseCurrency, listSellingPrice, unit, brand, rating, poles, breakingCapacity, frameSize, notes`:

| File | Rows | Content |
|---|---|---|
| `componentcatalogALL.csv` | 545 items | Siemens 3WJ ACBs, 3VJ MCCBs (294), 5SL/5TJ MCBs, Sinova ACB/MCCB accessories, APFC parts (N-Power, C&S), Rishabh CTs and meters, Ebasee SPDs, Siemens pilot lamps, DeepSea/LOGO controllers, and the busbar/cable/enclosure rows **with blank descriptions** |
| `componentcatalogBUSBAR AND CABLES.csv` | 40 items | Copper bar sizes (10), Linkwell distribution busbars/terminal boxes (5), Coast Cable sizes (9), local enclosures (14) — same part numbers as in ALL, with descriptions |
| `componentcatalogACB.csv` | 72 items | Siemens ACBs only; exact subset of ALL |
| `componentCS.csv` | 140 items | C&S range: WM ACBs, MCCBs and accessories, MCBs, on-load changeovers, switch disconnectors, bypass switches, ATS, contactors and accessories, RCCB/RCBO |

The zip also holds `component-catalog-ENCLOSURE.csv` (nine 1600 mm-high free-standing enclosures, EUR 120–300) and `component-catalog-SAMPLE.csv` (a single `CONTROLS & WIRING` lump-sum item at EUR 150, used by the ATS and sync kits).

After clean-up (see `data/seed/README.md`): **735 components** (728 from the catalogue, 7 placeholders for parts the kits reference), 27 categories, 9 brands. Rating/poles/breaking-capacity columns were blank throughout and have been parsed from descriptions as a first pass.

### 6.2 Pricing basis — the important finding

Every price is a **purchase price in EUR**, including local enclosures and cable. `listSellingPrice` is 0 everywhere. Comparing the catalogue with the NPP-192 costing shows how the KES figures were produced: **KES price = EUR price × 200** for 33 of the 39 matched items (ACBs, MCCBs, lamps, SPD, capacitors, fuses, distribution busbars — all exactly 200.0); the remainder are stale or hand-adjusted prices (e.g. the 800 A ACB at ×236, the LOGO at ×390). The busbar prices in the catalogue are **EUR 15 per kg × kg/m** (100×10 mm = 9 kg/m = EUR 135), which is the KES 3,000/kg in the workbook at the same ×200.

Consequences for the data model (this refines the "KES is the master currency" decision):

- Components carry `purchasePrice` + `purchaseCurrency`; the master admin maintains a **costing rate per currency** (EUR→KES = 200 today). The KES list price is computed, not typed, and both the KES price and the rate are frozen into each costing line.
- When the rate changes, all *new* costings pick it up; existing costings keep their frozen values (already decided).
- External companies see KES prices after their discount; the EUR purchase price is never shown to them.
- Decision 2 (§5): 200 is a landed-cost factor (exchange rate plus freight, duty and handling), kept as one admin-maintained number per currency.

### 6.3 Data-quality findings

- Duplicate part numbers: C&S `CSE4NN630ATM3P-630A` (EUR 210.25 and 201) and `CS630NATU6303` (275 and 241.5) — two prices each; `CSRCB02PC40A30-10KA` listed twice at the same price; Siemens `3VJ9417-0AA21` used for both left and right alarm switch; Siemens `3VJ1340-5DB32-0AA0` used for both the 200 A and 400 A MCCB (3VJ13**40** is the 400 A frame).
- 21 C&S rows and 4 controllers had no category; 1 item has no price (`CSMBS3ISO63X`).
- Categories are supplier-oriented (`SINOVA MCCB ACCESSORIES`, `APFC`) and mix switchgear with hardware — the APFC category holds fuse links, fuse bases and busbar supports. The BOM category therefore has to be a separate field; `data/seed/category-map.csv` gives the default mapping.
- The catalogue does not yet contain several items the costing used: terminals (Connectwell CTS…), cable duct (Matlusan), fan & filter (Linkwell FK5526), 6 A SP MCB price differs (EUR 1.23 vs KES 308), and lump-sum lines such as timers and relays. `CONTROLS & WIRING` (EUR 150) now exists as a lump-sum component; the others need to be added or handled as lump sums.
- Part numbers for busbar, cable, CTs and enclosures are descriptive (`100X10MM`, `95SQMM`, `1600A/5`, `800(W)X800(D)X2100(H)-2B`) rather than manufacturer codes — fine as keys, but the import should not assume part numbers are manufacturer references.

### 6.4 Seed files

`data/seed/components.csv` (735 rows, template columns), `data/seed/category-map.csv`, `data/seed/components-issues.csv`, regenerated by `scripts/build_seed.py`; `data/seed/kits.csv`, `data/seed/kits-issues.csv`, `data/seed/kit-group-labour-template.csv`, `data/seed/kit-labour-template.csv`, regenerated by `scripts/build_kits.py`.

### 6.5 Proposed kits (assemblies)

Four exports in the app's kit layout (`Kit Name, Linked Category, Frame Size, Labor Hours, Labor Rate, Part Number, Quantity`), one row per kit line, with occasional group-header rows (`ATS`, `INCOMER-KIT`, `APFC BANK`, …). After clean-up: **296 kits, 720 lines**, every part number resolvable in the component seed.

| Kit group | Kits | Anatomy |
|---|---|---|
| ACB (Siemens 3WJ, C&S WM) | 80 | 1 ACB + copper busbar in metres by rating: 40×10 × 6.5 m at 800 A … 100×10 × 39 m at 4000 A. Frame 1 = 800–1600 A, frame 2 = 2000–4000 A. |
| MCCB, INCOMER-KIT, OUTGOER-KIT | 68 | 1 MCCB + cable (≤250 A: 16–95 mm², 2–3 m) or busbar (320–630 A: 40×5 / 30×10, 5 m incomer, 3 m outgoer). |
| MCB, RCBO, ISOLATOR | 64 | 1 device + 1–2 m of 16 mm² cable. |
| ONLOAD CHANGEOVER, SWITCH DISCONNECTOR, ATS-SWITCH | 35 | 1 switch + busbar (≥400 A) or cable (≤250 A). |
| ATS, SYNCHRONIZATION | 24 | 2 ACBs with changeover accessories + busbar + 2 meters (LM1340) + 6 CTs + LOGO + `CONTROLS & WIRING` (ATS); 2 ACBs + busbar + 2 × DSE8610 + 2 × controls + 8 CTs (sync). Siemens and C&S variants. |
| APFC BANK | 10 | Per step (50 / 25 / 12.5 / 5 / 2.5 kVAr): capacitor + capacitor-duty contactor + either 3 fuse links, fuse base and busbar support (*fuse kit*) or an MCB/MCCB (*breaker kit*) + 6.5 m cable. Matches the APFC rules found in the costing (§1.3). |
| METERBOARD, METERBOARD-WITH ATS | 12 | Complete small boards: isolator/MCCB(s), (contactors + interlock for ATS), cable. |
| ACCESSORIES | 3 | SPD type 1+2 and type 2 (SPD + fuse base); indicator kit (3 lamps + 3 MCBs). |

What this settles and what it opens:

- **Kits are the unit of costing.** The NPP-192 costing maps almost line-for-line onto kits: incomer = 1600 A ATS kit, solar incoming = 1600 A 3P fixed manual ACB kit, outgoers = MCCB outgoer kits, APFC = 4 × 50, 4 × 25, 6 × 12.5 and 5 × 5 kVAr fuse kits, and so on. The costing screen should be "add kit by rating × quantity", with free components and the enclosure added separately.
- **Busbar and cable are fixed per kit**, not calculated from runs (decision 12); the `CU-OPT1` calculator (§1.4) is not built in phase 1 — engineers adjust metres by hand on non-standard boards.
- **No labour hours anywhere.** `Labor Hours` and `Labor Rate` are empty in all 720 lines. This is the single biggest data gap for the app's core requirement; per decision 11 they are collected per kit group in `kit-group-labour-template.csv`, with `kit-labour-template.csv` for overrides.
- `Linked Category` and `Frame Size` are not reliable in the export (blanks, `MCB-C&S` on Siemens parts, descriptions in the frame column); the seed takes category from the catalogue and keeps only numeric frames.
- Export drift: 13 busbar/cable lines carried the name of a neighbouring kit (the 4P MCCB kits had lost their cable lines to their TP siblings), four kit names had typos, the SAMPLE file held an older version of two ATS kits with different quantities (13 m vs 15 m busbar, 8 vs 6 CTs). All logged in `kits-issues.csv`. The app should validate on import that every kit has exactly one main device and that names are unique.

---

## 7. Glossary (as used in the files)

ACB air circuit breaker; MCCB moulded-case circuit breaker; MCB miniature circuit breaker; TP/FP three-pole/four-pole; TPN three-pole and neutral; ATS automatic transfer switch; APFC automatic power-factor correction; CT current transformer; MFM multifunction meter; SPD surge protection device; HBB/VBB horizontal/vertical busbar; KPLC Kenya Power (mains supply); GEN generator supply; Form 3B/4B IEC 61439 internal separation forms; IP31 ingress protection rating; Ex-Works Nairobi delivery term (collection from factory); KSH/KES Kenya shillings.
