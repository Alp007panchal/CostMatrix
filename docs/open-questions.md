# Open questions

Questions still needing an answer, grouped by when they block the build. Answered questions
are moved to `decisions.md` and deleted from here.

## Before slice 1 (costing)

1. **Current copper rate.** The reference sheet uses 3,000 KES per kg. Is that still today's rate, or should the master default be something else?

## Before slice 2 (quotation)

2. **Footer images.** Please add the partner logos and certification marks that belong in the quotation footer to `docs/reference/`, or confirm I should lift them from the Word file.

## Before slice 6 (import)

3. **Component list.** Is there a master component list beyond the "db" sheets in the reference workbook? If yes, add it to `docs/reference/` as `component-list.xlsx`.

## Assumptions in force until you say otherwise

- One user belongs to one company; a user may hold several roles.
- Private components get no discount and no currency conversion.
- Categories are master-only.
- Panel quantity multiplies both material and labour.
- English only.
- Costing engineers may create CRM records (customers, contacts, projects, enquiries).
- The quotation sequence is issued at first release and shared by all revisions of a costing.
- Company defaults for terms are 30-day validity, 50 % / 50 % payment, Ex-Works Nairobi, delivery timelines to be confirmed; all editable per quotation.
