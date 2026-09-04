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
- TECHNICAL DESCRIPTION = Costing panel `technical_description`, edited by the engineer while costing. The app pre-fills a draft from the assemblies and items in the panel (grouped by assembly, "n No. item name"), which the engineer then edits.
- Enclosure dimensions = panel `enclosure_dimensions`.
- Data sheets: attached outside the app in release 1, as today.

## Page setup

A4 portrait, margins about 20 mm, body font 10–11 pt, headings bold upper case, tables with
thin borders as in the reference. Long technical descriptions may span pages; a table row
must not be split mid-paragraph awkwardly, so the renderer breaks between paragraphs.

## What the approver can change at release

Subject, salutation, intro and closing text, notes on offer, the five terms sections,
signatory. Nothing about prices, panels or VAT. Once released, none of it changes; a new
revision produces a new quotation.
