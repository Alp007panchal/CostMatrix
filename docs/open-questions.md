# Open questions

Nothing is blocking the build. What remains is material to be supplied, and assumptions you can
overturn at any time. Answered questions live in `decisions.md`.

## Waiting on you

| What | Needed by | Note |
|---|---|---|
| **Slice 1 acceptance:** cost one real panel in the app and compare with the spreadsheet | Before slice 2 starts | Upload the "db" sheet from the reference workbook, build one assembly, cost one panel. The material subtotal should match the sheet; labour will differ, deliberately, because it is now hours × rate. |
| Upload the header logo and footer marks | Before the first real quotation | Now done in the app: **Quotation wording** → Header logo and Footer strip. PNG with a transparent background prints best. Keep source copies in `docs/reference/logos/` too. |
| **Slice 2 acceptance:** release one quotation and compare the PDF with the reference | Before slice 3 starts | Approve a costing, Release quotation, preview, release. Compare against `docs/reference/quotation-NPP-192-REV1.pdf` page by page. Wording and layout differences go on the list; the price schedule numbers should match the costing exactly. |

Not needed: the master component list. It does not exist yet and will be built inside the app
by Excel upload (see `docs/spec.md` §10a).

## Assumptions in force until you say otherwise

- One user belongs to one company; a user may hold several roles.
- Private components get no discount and no currency conversion.
- Categories are master-only.
- Panel quantity multiplies both material and labour.
- English only.
- Costing engineers may create CRM records (customers, contacts, projects, enquiries).
- The quotation sequence is issued at first release and shared by all revisions of a costing.
- Company defaults for terms are 30-day validity, 50 % / 50 % payment, Ex-Works Nairobi, delivery timelines to be confirmed; all editable per quotation.
- An Excel upload never deletes anything and always shows a preview first.
