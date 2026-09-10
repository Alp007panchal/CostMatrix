# Open questions

Nothing is blocking the build. What remains is material to be supplied, and assumptions you can
overturn at any time. Answered questions live in `decisions.md`.

## Now: review and merge PRs 1 to 6 in order

PR 1 holds your reference document and seed; PR 2 the schema for decisions 1, 2, 3 and 11;
PR 3 the Import screen; PR 4 costing from kits and the NPP-192 acceptance test; PR 5 the
technical offer from the kits; PR 6 the external-company and CRM review. Nothing reaches the
live database until they merge; after PR 3 you run the three imports.

## Waiting on you

| What | Needed by | Note |
|---|---|---|
| Decision 2: the EUR landed factor is 200 today; change it under Rates → Currency factors when it moves | Whenever it moves | New costings pick it up; old ones keep what they froze. |
| **Labour hours per labour group** — fill `data/seed/kit-group-labour-template.csv` (17 rows × 3 columns) and import it (step 3), or type them on the Kit groups screen | Before session 3 | Without them every kit costs zero labour (§5, decision 11). `kit-labour-template.csv` is for per-kit overrides only. |
| **Prices for the seven placeholder parts** (decision 10) plus `CSMBS3ISO63X`: 8 parts show "no price" on the Components screen | Before costing a kit that uses them | A kit holding one is refused by the costing with the part named. |
| **The uplift rule for form 3B/4B enclosures** (decision 1) | Before costing a real board | Percentage or fixed; the app has a company percentage today. |
| **A busbar line for the C&S 400 A TP MCCB kit** (`kits-issues.csv`) | Before that kit is used | Every sibling kit has one. |
| Two 800A ACBs at 330,432 on Option 1 versus 279,744 from the catalogue | Before session 3 | If accessories are included in 330,432, they should be kit lines. |
| Data-quality items in `data/seed/README.md` | Before session 2 | Fifteen kits with only a main device, stray cable lines, two 4000A kits that look like one, duplicate and double-priced parts. Fix in `data/raw/` or say "import as is". |
| **Connect your own email sender** (operations B9c) | Before inviting more than one or two people | Supabase's built-in sender allows a few messages an hour and often lands in spam. |
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
