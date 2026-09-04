# Open questions

Questions still needing an answer, grouped by when they block the build. Answered questions
are moved to `decisions.md` and deleted from here.

## Before slice 2 (quotation)

1. **Quotation format file.** Please add your current quotation (PDF or Word) to `docs/reference/` as `quotation-format.pdf` or `.docx`.
2. **Currency on the PDF.** Company currency only, or also the KES equivalent for non-KES companies?
3. **VAT and legal lines.** Is VAT shown as a separate line on the quotation? Does the PDF need the company VAT/PIN number, and bank details on every quotation?
4. **Price detail on the PDF.** One price per panel, or a breakdown per assembly? (Recommendation: per panel, with an optional detailed appendix.)

## Before slice 4 (CRM)

5. **Follow-up reminders.** In-app list only in phase 1, or also a daily email digest to the owner of the quotation?

## Operational

6. **Accounts.** Who owns the Supabase, Vercel/Netlify and GitHub accounts, and which email address receives alerts and backup failure notices?
7. **Data protection.** Do external companies need a written agreement (retention period, deletion on request, where data is stored)? London region is already decided.
8. **Component list.** Do you have the current master component list as an Excel file for the slice 6 import? If yes, add it to `docs/reference/`.

## Assumptions in force until you say otherwise

- One user belongs to one company; a user may hold several roles.
- Private components get no discount and no currency conversion.
- Categories are master-only.
- Panel quantity multiplies both material and labour.
- English only.
- Costing engineers may create CRM records (customers, contacts, projects, enquiries).
