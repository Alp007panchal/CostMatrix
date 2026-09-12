> **Session 3 (2026-09-09):** the NPP-192 Option 1 rebuild is now automated as
> `supabase/tests/15_acceptance_npp192.sql`, which adds the 51 priced lines of the workbook's
> `OPTION1` sheet from the owner's seed (the 102 × 4,000 enclosure line is disregarded,
> decision 1) and asserts material 3,622,781.80 (switchgear 2,212,282.00, busbar 1,176,600.00,
> accessories & hardware 233,899.80; the workbook's own figure without the enclosure is
> 3,756,997.80 and the gap is its stale prices, itemised in
> `docs/reference/npp192-acceptance-from-seed.md`) and the margin, rounding and VAT arithmetic
> (5,784,800 / 925,568 / 6,710,368 with a 28 % material margin standing in for the workbook's
> ÷0.8 ÷0.9). To repeat it by hand: `python3 scripts/check_npp192.py OPTION1 --sql` lists every
> line to add; the Totals card shows the category split to compare. A panel built from kVAr
> step kits shows the bank's total kVAr under its kit table (decision 4).

> **2026-09-10:** the steps below cover what is live after the owner's notebook changes
> (migrations 0013–0017): sections inside a panel, copying a costing or a panel, the operator's
> name in the history, one decision per enquiry, and files kept with an enquiry. If you ran an
> earlier version of this script, the new steps are §4 (files), §5 (sections, copy), §6 (who did
> it) and §9 (won or lost on the enquiry).

> **2026-09-12:** this script is the **basic app on production** (`main`), which is unchanged by
> the advanced work. The eleven features built on `advanced` against the staging project have
> their own click-through: `docs/trials/advanced-trial.md`. Keeping them apart means this one
> stays a true test of what your team quotes on today.

# Acceptance test — one real job, end to end

The first time a human clicks through everything built so far. Do it in this order, with a
real job you have quoted before, so you can compare against the spreadsheet and the old
quotation. Note anything wrong or awkward as you go — every item, however small — and send
the whole list at once.

Roughly an hour. Have `docs/reference/costing-NPP-192-REV1.xlsm` and
`docs/reference/quotation-NPP-192-REV1.pdf` open beside you.

## 1. Rates (Rates tab) — 3 minutes
- [ ] Enter your three hourly rates: panel assembly, wiring, busbar.
- [ ] The copper rate reads 3,000 per kg. Change it and change it back; both save.

## 2. Components (Components tab) — 10 minutes
- [ ] **Excel → Upload** the reference workbook. Pick a "db" sheet. Choose a category for all rows. Preview.
- [ ] The preview counts (new / changed / unchanged / rejected) make sense. Rejected rows give a reason you agree with.
- [ ] Save. The list fills. Search finds a breaker by part number.
- [ ] Add one busbar by hand: **priced by weight**, 2.8 kg per metre, copper. Its price shows 8,400.
- [ ] **Excel → Download**. The file opens in Excel with the same rows.

## 3. Kits (Kits tab) — 10 minutes
- [ ] Create one, e.g. `INC-1600 Incomer section`. Give it a kit group, a rating and its poles. Add three or four components with quantities, and mark the main device.
- [ ] Enter hours per kind of work. The labour cost beside each is hours × your rate.
- [ ] The card top-right shows material, labour and the sum. Check one line by hand.

## 4. Customer and enquiry (Customers, Enquiries tabs) — 5 minutes
- [ ] Add the customer, one contact, one project.
- [ ] Log an enquiry against them. It gets `EN-2026-0001`.
- [ ] Click the enquiry number. Its own page opens: what was asked for, its costings, its quotations, and **Files**.
- [ ] Type what the file is, then attach the customer's drawing or specification (any kind, up to 20 MB). It appears in the list with its size and today's date.
- [ ] Click the file name: it opens. Reload the page; it is still there.

## 5. Costing (Costings tab) — 15 minutes
- [ ] **New costing**, pick the enquiry; the title fills in. It gets `CM-2026-0001`.
- [ ] Add a panel, quantity 1. Set **Add to section** to *Incomer*, then add your kit. Open it: material and hours are what you entered.
- [ ] Switch **Add to section** to *Outgoers* and add another kit, or a component on its own. The panel now reads in two sections, each with its own material and labour subtotal.
- [ ] Type a section of your own, e.g. *Battery charger*, and add something to it. It is kept as you typed it and sorts after the seven offered names.
- [ ] Move a kit to another section with the small box beside its name; the subtotals follow it.
- [ ] Change an item quantity; the totals on the right change. Change hours; the "Library said" column shows the original and marks it changed.
- [ ] **Compare with the spreadsheet:** material should match line for line. Labour will differ — it is now hours × rate.
- [ ] Set a negotiation margin, watch the unit price move. Set it back to 0.
- [ ] **Bills of materials**: download the switchgear one as Excel. Quantities are what to buy — grouped by category, not by section, which is how parts are bought.
- [ ] **Copy this panel** at the bottom of the panel, into this costing. The copy carries its sections and lines; what could not be re-priced (if anything) is named.
- [ ] Remove the copy again, then **Submit**. Try to edit something: you cannot.

## 6. Approval — 3 minutes
- [ ] As approver (you hold the role): **Return to draft** with a note. The note shows on the costing. Edit something, submit again.
- [ ] **Approve**. The costing is read-only. The screen reads top to bottom: totals, panels, bills of materials, history.
- [ ] **History** at the bottom names who submitted, who returned it and who approved it, with the date beside each.

## 7. Quotation wording (Quotation wording tab) — 5 minutes
- [ ] Upload the header logo and two footer marks. Fill in P.O. Box, phones, email, signatory.
- [ ] Fill the five terms as on the reference quotation. Save.

## 8. Release (from the approved costing) — 10 minutes
- [ ] **Release quotation**. The customer record is pre-selected from the enquiry; name and address fill in.
- [ ] Add two notes on the offer. **Preview PDF**.
- [ ] **Compare the PDF page by page** with `quotation-NPP-192-REV1.pdf`: letterhead, cover letter, annexure list, notes, price schedule columns and totals, VAT line, terms, technical table. Note every difference.
- [ ] **Annexure IV** takes its headings from the sections you built the panel in, and prints **no busbar** (cable still prints). If a panel's description was drafted before today, press *Draft from the kits* in its details to redraw it.
- [ ] **Release**. The reference reads `NPP-0001-REV0` (after setting the prefix under Company). The Quotations tab lists it; **PDF** opens it.

## 9. After release — 5 minutes
- [ ] **Mark sent**. On Enquiries, the enquiry is now *quoted* on its own.
- [ ] **Follow up** with a date and note. It appears on Follow-ups. Mark it done.
- [ ] **New revision** on the costing. Change a quantity, submit, approve, release again. The reference reads `NPP-0001-REV1`. The first PDF is unchanged.
- [ ] On **Quotations**, the job reads as one line: the enquiry at the top, the offer under it, and *1 earlier revision* folded behind the newest. Open it and check the older PDF is still there.
- [ ] **Won or lost?** on the job. Choose *We won it* and name the newest quotation. It is marked won; the earlier revision reads **superseded**, not lost; the enquiry is won and names the winner.
- [ ] Do the same on a second enquiry with *We lost it*: it refuses an empty reason, and the reason it takes shows on the quotation and on the enquiry.
- [ ] Back on **Costings**, press **Copy** on the approved costing, give it a title, and copy it. It becomes a new number at revision 0, the original untouched; the screen says how many lines were priced again at today's rates and names anything that could not be.

## 10. Isolation — 3 minutes
- [ ] Companies tab: create a second company. People tab: invite yourself at another email into it (or ask a colleague).
- [ ] Sign in as that person. You see none of the first company's customers, costings or quotations. You do see the master components at that company's discount.

## Findings

Write them here or send them in one message. Number them. For each: which screen, what you
did, what you expected, what happened.

| # | Screen | What happened | Expected |
|---|---|---|---|
| 1 | | | |
