# Open questions

Nothing is blocking the build. What remains is material to be supplied, and assumptions you can
overturn at any time. Answered questions live in `decisions.md`.

## Now: review PR 1, then PR 2

`docs/reference/current-costing-and-quotation-reference.md` is a draft written from your files.
Read §5 (the thirteen decisions) and §6.2 (what will differ when the app rebuilds NPP-192
Option 1) and correct anything wrong, then merge PR 1. PR 2 (session 1: the schema for decisions
1, 2, 3 and 11) is stacked on it; PR 3 (session 2: the Import screen) on that. Merge 1, 2, 3 in
order. Nothing reaches the live database until then; after PR 3 you run the three imports.

## Waiting on you

| What | Needed by | Note |
|---|---|---|
| Decision 6: does "each line" mean each **panel** on the price schedule (as built today) or each component line? | Before session 3 | Built as per panel; changing it is a small view change. |
| Decision 2: the real landed-cost factor for EUR (freight + duty + clearing) | Before session 2 imports the seed | Back-solved as 1.7699115 so that 113 KES/EUR lands at 200; once PR 2 is live you change it yourself under Rates → Currency factors. |
| **Labour hours per kit group** — fill `data/seed/kit-group-labour-template.csv` and import it (step 3), or type them on the Kit groups screen | Before session 3 | 17 groups × 3 process types. Without them every kit costs zero labour. |
| **Price the placeholders** after importing: 8 parts show "no price" on the Components screen | Before costing a kit that uses them | Seven APFC parts and one C&S isolator. A kit holding one is refused by the costing with the part named. |
| What the enclosure line `102 × 4,000` on Option 1 counts | Before session 3 | Kilograms of sheet metal, modules, or something else. Decides how the cubicle-plus-uplift model maps onto it. |
| Two 800A ACBs at 330,432 on Option 1 versus 279,744 from the catalogue | Before session 3 | If accessories are included in 330,432, they should be kit lines. |
| Data-quality items in `data/seed/README.md` | Before session 2 | Fifteen kits with only a main device, stray cable lines, two 4000A kits that look like one, duplicate and double-priced parts. Fix in `data/raw/` or say "import as is". |
| Upload the header logo and footer marks | Before the first real quotation | **Quotation wording** → Header logo and Footer strip. PNG with transparent background prints best. |
| Run `docs/acceptance-test.md` on what is live | Any time | Findings are fixed inside the sessions above. |

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
