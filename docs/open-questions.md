# Open questions

Nothing is blocking the build. What remains is material to be supplied, and assumptions you can
overturn at any time. Answered questions live in `decisions.md`.

## Now: use it, and tell me what breaks

Everything built so far is merged and live: production carries migrations `0001`–`0017` and
`0100`–`0118`, and since 12 September that includes the whole of the advanced app, every feature
switched off. The useful next hour is `docs/acceptance-test.md`
end to end on a real job, which now covers sections inside a panel, copying a costing or a
panel, the operator's name in the history, one decision per enquiry, and files on an enquiry.
Send the findings in one numbered list.

## Staging, and one track

**There is one code line now, `main`** (13 Sep 2026). Every new feature arrives behind a switch
that is off by default, so it reaches production without changing anything until you switch it
on. The `advanced` branch is no longer a second track — it is the copy that runs on staging, at
cost-matrix-git-advanced-alp-team.vercel.app, and it is what staging is for: try a feature there,
then switch it on for real work on the **Features** screen.

Staging is still its own Supabase project on a second account
(`docs/reference/two-track-setup.md`), and its token cannot see production. That separation has
not changed.

**One thing is yours** before a live assistant draft will answer: credit on the Anthropic account.
Until then the panel says so in those words, which is the intended behaviour.

## Waiting on you

| What | Needed by | Note |
|---|---|---|
| Decision 2: the EUR landed factor is 200 today; change it under Rates → Currency factors when it moves | Whenever it moves | New costings pick it up; old ones keep what they froze. |
| **Labour hours per labour group** — fill `data/seed/kit-group-labour-template.csv` (17 rows × 3 columns) and import it (step 3), or type them on the Kit groups screen | **Now**: costing a real board | Without them every kit costs zero labour (§5, decision 11). `kit-labour-template.csv` is for per-kit overrides only. |
| **Prices for the seven placeholder parts** (decision 10) plus `CSMBS3ISO63X`: 8 parts show "no price" on the Components screen | Before costing a kit that uses them | A kit holding one is refused by the costing with the part named. |
| **The uplift rule for form 3B/4B enclosures** (decision 1) | Before costing a real board | Percentage or fixed; the app has a company percentage today. |
| **A busbar line for the C&S 400 A TP MCCB kit** (`kits-issues.csv`) | Before that kit is used | Every sibling kit has one. |
| Two 800A ACBs at 330,432 on Option 1 versus 279,744 from the catalogue | Before trusting the NPP-192 comparison | If accessories are included in 330,432, they should be kit lines. |
| Data-quality items — now on the **Library health** screen | Before the next seed import | The list that sat in `data/seed/README.md` is read from the live library instead: parts with no price, kits that would be refused, kits that would cost zero labour, kits with only a main device. Switch **Library health** on to see it. The raw-export items it cannot see (stray cable lines, two 4000A kits that look like one, double-priced parts) are still to fix in `data/raw/` or to accept as they are. |
| **Connect your own email sender** (operations B9c) | Before inviting more than one or two people | Supabase's built-in sender allows a few messages an hour and often lands in spam. A free Gmail app password is enough; move to a `neiltd.com` sender before other companies are invited. |
| Upload the header logo and footer marks | Before the first real quotation | **Quotation wording** → Header logo and Footer strip. PNG with transparent background prints best. |
| **Read the terms page and change any wording you disagree with** — `/terms`, linked from the footer | Before inviting another company | It says what the app does: what is stored, that it is in Ireland, that no company sees another's, and that data is deleted on request. It claims **no retention period**, because none has been decided — tell me one and it goes in. It is not a lawyer's document; if you want it to be, that is a lawyer's job, not mine. |
| Sizes and fittings for the compatibility checks (roadmap 3.4): the depth of a device, the usable depth inside a cubicle, and the devices a part is listed for | Before the checks can say anything | Until they are recorded the checks stay silent, which is correct rather than broken. The dimensions importer (`dimensions-template.csv`) takes the sizes in bulk; the rest is the Components screen. |
| **Run the restore drill once** — Actions → Weekly backup → run it, download the artifact, restore it into a throwaway Supabase project and check a costing's total | **Now**, and quarterly after | The job and the steps exist (operations Part E); only a drill against your real dump proves your backup works. Date it in `docs/decisions/`. |
| Do you want the weekly dump sent somewhere beyond GitHub as well? | Whenever you like | It is kept 90 days as a GitHub artifact, which is off Supabase but not off GitHub. A bucket is one secret and half an hour. |
| Run `docs/acceptance-test.md` on what is live | **Now** | Each finding comes back as its own pull request, as the notebook changes did. |

## Answered 16 September: a revision keeps the panel drawing, if you switch it on

`app.create_costing_revision` copied panels but not their drawings, so a revised costing started
undrawn and Annexure V disappeared from the revised quotation without a word. Asked, you chose to
carry it forward behind a switch that is off — **A revision keeps the panel drawing**, on the
Features screen (migration 0132).

Off is still the default, and deliberately: a revision usually means the board has changed, and a
drawing carried onto a changed board is worse than a missing one. Switch it on when you want the
sheet to follow, and off again if it ever carries something stale.

**One question is left, and it is yours.** `copy_costing` and `copy_panel` still do not carry a
drawing, and that was not changed here because **a copy is a new job** rather than the same job
revised — which makes carrying a drawing a different question, not the same one answered twice.
Say the word if a copy should take the drawing too.

## Known and not scheduled: the second place two sessions collide

Nothing here needs you; it is written down so it is not forgotten.

`docs/decisions.md` was the file every pull request appended to, and on 13 September nine open
pull requests all conflicted with each other in it. That is fixed — a decision is now a file of
its own (`docs/decisions/`), and two sessions writing on the same morning no longer collide.

**`web/src/lib/database.types.ts` has the same shape and is not fixed.** It is one hand-written
file that every feature appends an interface to, and it showed up in one of those nine pairs. The
remedy is different in kind: `docs/architecture.md` already says each module owns its own
`types.ts`, and the code has drifted away from that. Putting it back is a few hours of moving
type definitions into the ten module folders, touching most of the app but changing nothing it
does — which makes it a poor thing to merge while a queue of feature pull requests is open, and a
good thing to do on a quiet morning when it is not. It is worth doing before the queue is nine
deep again.

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
