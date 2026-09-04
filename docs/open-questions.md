# Open questions

Questions still needing an answer, grouped by when they block the build. Answered questions
are moved to `decisions.md` and deleted from here.

## Before slice 1 (costing)

1. **Copper rate ownership.** Master default rate per kg with a company override, like labour rates? (Assumed yes.) What is today's rate: the reference sheet uses 3,000 KES/kg.
2. **Other rate-based materials.** Only copper busbar, or also aluminium bar and cable per metre by weight?

## Before slice 2 (quotation)

3. **Data sheets.** Annexure IV mentions data sheets. Should the app store manufacturer PDFs per component and append them to the quotation, or do they stay outside the app? (Assumed outside in release 1.)
4. **Company defaults.** Are 30-day validity, 50 % / 50 % payment, Ex-Works Nairobi and "to be confirmed" delivery timelines the defaults for every quotation of your company? (Assumed yes, editable per quotation.)
5. **Second logo.** The letterhead shows two images. Is the second one a certification mark that every company may upload, or specific to yours?

## Before slice 4 (CRM)

6. **Follow-up reminders.** In-app list only in phase 1, or also a daily email digest to the owner of the quotation?

## Operational

7. **Accounts.** Who owns the Supabase, Vercel/Netlify and GitHub accounts, and which email address receives alerts and backup failure notices?
8. **Data protection.** Do external companies need a written agreement (retention period, deletion on request, where data is stored)? London region is already decided.
9. **Component list.** Is there a master component list beyond the "db" sheets in the reference workbook? If yes, add it to `docs/reference/` as `component-list.xlsx`.

## Assumptions in force until you say otherwise

- One user belongs to one company; a user may hold several roles.
- Private components get no discount and no currency conversion.
- Categories are master-only.
- Panel quantity multiplies both material and labour.
- English only.
- Costing engineers may create CRM records (customers, contacts, projects, enquiries).
- The quotation sequence is issued at first release and shared by all revisions of a costing.
