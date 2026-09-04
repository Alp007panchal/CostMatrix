# Open questions

Nothing is blocking the build. What remains is material to be supplied, and assumptions you can
overturn at any time. Answered questions live in `decisions.md`.

## Waiting on you

| What | Needed by | Note |
|---|---|---|
| Partner logos and certification marks as image files | Slice 2 (quotation PDF) | PNG or SVG, one file per mark. Put them in `docs/reference/logos/`. The header logo too, at print resolution. |

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
