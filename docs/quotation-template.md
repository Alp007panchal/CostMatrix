# Quotation template

Derived from `docs/reference/quotation-NPP-192-REV1.docx` and `.pdf`. The generated PDF must
look like that document. This file says where every piece of text comes from.

Sources, in the order the app looks them up:

| Source | Meaning |
|---|---|
| **Company** | Company settings, entered once by the company admin. Same on every quotation. |
| **Costing** | Numbers and panels from the approved costing. Not editable on the quotation. |
| **Quotation** | Text the approver edits at release, pre-filled from company defaults. |
| **Fixed** | Wording built into the template. |

## Every page

| Element | Source |
|---|---|
| Company logo, top of page | Company (`logo_path`) |
| P.O. Box, street address, phone numbers, email | Company (letterhead fields) |
| Partner logos and certification marks, footer strip | Company (`company_footer_logos`, in order) |
| Page number | Fixed |

## Page 1 — cover letter

| Element | Example from reference | Source |
|---|---|---|
| Reference No. | `NPP-192-REV1` | Costing: company prefix + sequence + `-REV` + revision number |
| Date | `Tuesday, 30 June 2026` | Quotation: release date, long format |
| To: | `TRICLOVER LIMITED` | Costing → enquiry → customer name (contact name and address optional) |
| Salutation | `Dear Sir/Madam,` | Quotation, default from company |
| Subject line, bold | `QUOTATION FOR SUPPLY ONLY OF LV SWITCHBOARDS` | Quotation, default built from costing title |
| Intro sentence | `We thank you for your enquiry for the above project, and are pleased to quote as follows:` | Fixed, editable on the quotation |
| Annexure list | Annexure 1 Notes … Annexure 4 Technical Offer | Fixed |
| Closing paragraph(s) | `We trust that you will find our offer…` | Company default, editable |
| Sign-off | `Yours Faithfully,` name, email, company name | Company (signatory) or the releasing approver's profile |

## Annexure I — Notes / comments on our offer

Bullet list, typically three to six lines. Examples: enclosure form, IP rating and access;
switchgear make offered; supply-only scope.
Source: Quotation (`notes_on_offer`), pre-filled from Company `default_notes_on_offer`.

## Annexure II — Commercial terms (price schedule)

One table per option. If no panel has an option label there is one table.

| ITEM NO | DESCRIPTION | UOM | QTY | UNIT PRICE (IN KSH.) | TOTAL (IN KSH.) |
|---|---|---|---|---|---|
| 1 | 1600A MAIN LV BOARD | PC | 1 | 5,784,800.00 | 5,784,800.00 |

Below each table:

| Line | Source |
|---|---|
| Sub total Amount in KSH, Ex-works, Nairobi (subject to VAT) | Costing: Σ panel totals in the option |
| 16% VAT-IN KSH. | Costing: subtotal × frozen VAT % |
| Total Amount in KSH, Ex-works, Nairobi (Inclusive of VAT) | Costing |

- Currency word ("KSH") comes from Company `currency_label`; the ISO code stays KES.
- Unit price is the rounded panel selling price from `v_costing_panel_prices`.
- Descriptions are the panel names; UOM is the panel `uom` (default PC).
- The phrase "Ex-works, Nairobi" is part of Company `delivery_terms`.

## Annexure III — Specific terms and conditions

Numbered sections, each a heading and one or more lines:

| Section | Reference wording | Source |
|---|---|---|
| 1. Scope of supply | Supply only; excludes site delivery, assembly, testing and commissioning | Company default, editable per quotation |
| 2. Validity period | 30 days from the date hereof, thereafter subject to confirmation | Company `validity_days`, sentence fixed |
| 3. Terms of payment | 50% advance with order; 50% before collection or within 30 days of notification | Company default, editable |
| 4. Delivery terms | Ex-Works Nairobi | Company default, editable |
| 5. Delivery timelines | To be confirmed after order confirmation | Company default, editable |

Stored on the quotation as `terms` JSON with those five keys so the wording of a released
quotation never changes when the company defaults change later.

## Annexure IV — Detailed technical offer

Table with one row per panel:

| SR. NO | PARTICULAR | TECHNICAL DESCRIPTION | QTY |
|---|---|---|---|
| 1 | MAIN LV BOARD – OPTION 1 | Free-text specification, several paragraphs, with sub-headings such as INCOMING CHANGEOVER SECTION, OUTGOERS, APFC, and "Proposed Enclosure: 2100(H) × 3500(W) × 800(D) mm" | 1 |

- PARTICULAR = panel name plus option label.
- TECHNICAL DESCRIPTION = Costing panel `technical_description`, edited by the engineer while costing. **Draft from the kits** (session 4) writes it from the panel's kits grouped by kit group, each kit with its lines ("n No. item name, make (part number)", busbar and cable in metres), then OTHER COMPONENTS, then ENCLOSURE; a blank description gets the same text at release (`web/src/modules/costing/technical.ts`).
- Enclosure dimensions = panel `enclosure_dimensions`.
- Data sheets: attached outside the app in release 1, as today.

## Annexure V — General arrangement drawings (roadmap 3.8)

**Only where a panel has a saved layout.** One **landscape** page per such panel, after the
technical offer; a quotation whose panels have no layout has no Annexure V at all and is
byte-identical to one released before the drawing existed — including the annexure list on the
cover letter, which stays at four.

Annexure IV is the technical offer in the owner's real quotations, so the drawing is **V** rather
than renumbering a format his customers already know (the spec's §5 says "Annexure IV" because it
was written before the built PDF was checked; D-284).

Each sheet carries:

- a header: `ANNEXURE V — GENERAL ARRANGEMENT (FRONT ELEVATION)`, the reference, the sheet number,
  the scale with *not to scale on print — work to the dimensions*, and which saved version it was
  drawn from;
- the panel name and option label, the construction, the section count, and — on a double-front
  board — a note that face B is not shown on a front elevation;
- the drawing itself in black line art: the two chambers (horizontal busbar, cable), each section
  outlined with its distribution-busbar compartment, each device a rectangle carrying its **tag**
  (`Q1`, `Q2` …) and name, a dashed outline and "size not on record" where the library has never
  measured it, and the base;
- a dimension line with each section's width and `OVERALL w (W) × h (H) × d (D) MM`;
- a footer: form and access taken from the drawing, the panel's own enclosure note where it has
  one, `IEC 61439-1 & 2`, then company, customer, reference and date.

**The tags match the technical offer by construction**: they are numbered once in
`pdf/ga.ts` and the same list is appended to that panel's Annexure IV row as
`Device tags (see Annexure V): …`. A panel with no drawing gains no such line.

The scale is not fixed: it is chosen so the board fills the drawing frame, so a 6 m board and an
800 mm one both fill the page, and the chosen ratio is printed.

## Page setup

A4 portrait, margins about 20 mm, body font 10–11 pt, headings bold upper case, tables with
thin borders as in the reference. Long technical descriptions may span pages; a table row
must not be split mid-paragraph awkwardly, so the renderer breaks between paragraphs.
**Annexure V is the one exception: A4 landscape**, so a wide board is legible.

## What the approver can change at release

Subject, salutation, intro and closing text, notes on offer, the five terms sections,
signatory. Nothing about prices, panels or VAT. Once released, none of it changes; a new
revision produces a new quotation.
