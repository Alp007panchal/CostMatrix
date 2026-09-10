# Open questions

Nothing is blocking the build. What remains is material to be supplied, and assumptions you can
overturn at any time. Answered questions live in `decisions.md`.

## Now: use it, and tell me what breaks

Everything built so far is merged and live (migrations 0008–0017; `main` at the PR 18 merge on
2026-09-10). Nothing is waiting on a review. The useful next hour is `docs/acceptance-test.md`
end to end on a real job, which now covers sections inside a panel, copying a costing or a
panel, the operator's name in the history, one decision per enquiry, and files on an enquiry.
Send the findings in one numbered list.

## And before any advanced work can be tried

The basic app (`main`) is live and is the back-up. Advanced work — the foundations F1–F11 and the
AI assistant — happens on the `advanced` branch against a separate **CostMatrix Staging** Supabase
project, so your real data is never touched (D-169).

One thing needs you before anything advanced can run: the click-by-click steps in
`docs/reference/two-track-setup.md` — add the `SUPABASE_STAGING_DB_PASSWORD` secret, run the
**Create staging project** workflow from the Actions tab, then add the one variable and the two
Vercel values its summary gives you. About ten minutes, most of it waiting.

## Waiting on you

| What | Needed by | Note |
|---|---|---|
| Decision 2: the EUR landed factor is 200 today; change it under Rates → Currency factors when it moves | Whenever it moves | New costings pick it up; old ones keep what they froze. |
| **Labour hours per labour group** — fill `data/seed/kit-group-labour-template.csv` (17 rows × 3 columns) and import it (step 3), or type them on the Kit groups screen | **Now**: costing a real board | Without them every kit costs zero labour (§5, decision 11). `kit-labour-template.csv` is for per-kit overrides only. |
| **Prices for the seven placeholder parts** (decision 10) plus `CSMBS3ISO63X`: 8 parts show "no price" on the Components screen | Before costing a kit that uses them | A kit holding one is refused by the costing with the part named. |
| **The uplift rule for form 3B/4B enclosures** (decision 1) | Before costing a real board | Percentage or fixed; the app has a company percentage today. |
| **A busbar line for the C&S 400 A TP MCCB kit** (`kits-issues.csv`) | Before that kit is used | Every sibling kit has one. |
| Two 800A ACBs at 330,432 on Option 1 versus 279,744 from the catalogue | Before trusting the NPP-192 comparison | If accessories are included in 330,432, they should be kit lines. |
| Data-quality items in `data/seed/README.md` | Before the next seed import | Fifteen kits with only a main device, stray cable lines, two 4000A kits that look like one, duplicate and double-priced parts. Fix in `data/raw/` or say "import as is". |
| **The staging secret and variable** — `docs/reference/two-track-setup.md`, steps 1 to 4 | Before any advanced work can be tried | A password you choose, then one workflow run; the run's summary hands you the other three values. |
| **Connect your own email sender** (operations B9c) | Before inviting more than one or two people | Supabase's built-in sender allows a few messages an hour and often lands in spam. A free Gmail app password is enough; move to a `neiltd.com` sender before other companies are invited. |
| Upload the header logo and footer marks | Before the first real quotation | **Quotation wording** → Header logo and Footer strip. PNG with transparent background prints best. |
| Run `docs/acceptance-test.md` on what is live | **Now** | Each finding comes back as its own pull request, as the notebook changes did. |

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
