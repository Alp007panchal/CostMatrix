# D-2026-09-14-house-style

**14 September 2026.** The app takes the house style it shares with Opsmatrix
(`docs/reference/house-style.md`, with six mockups beside it): a dark sidebar of named groups in
place of twenty-five links in one top bar, a page that gets the width of the screen, and a
stylesheet that every screen picked up without changing a line of its own.

The stylesheet is where most of the work went and where the least of it shows. The names the app
already used were **restyled rather than replaced** — `.card` *is* the mockup's `.panel`, `.badge`
*is* its `.chip` — so a hundred-odd components that never mention the house style now draw in it.
The alternative, a second set of class names and a sweep through every file, would have been a much
larger diff for the same picture and would have left the two sets to drift.

Three things were decided rather than copied from the mockups.

**The navigation is data.** `web/src/app/nav.ts` holds the groups, the items, the two tab lists and
which role or feature switch each needs. That is what makes the reachability test possible — it
walks the list against the `path=` of every route in `App.tsx`, both ways, so a screen added without
a link fails as loudly as a link added without a screen. Both faults were introduced by hand and
watched to fail. The old top bar could not have been checked this way at all, and it had grown
links that went nowhere.

**Settings and Library set-up are layout routes with no path of their own.** `/admin/company` did
not move; it now draws with a tab column beside it. Every address anybody has ever bookmarked still
works, and no screen had to change to join. `/settings` and `/library/setup` land on the first tab
the person can actually see, which is not the same tab for everybody — a feature that is off has no
tab, and Companies is the master administrator's alone.

**One number is worked out once.** The sidebar counts, the home tiles and the exception bar all come
from `attention.ts` and `home-tiles.ts`, reading the same three query keys the pages themselves use
(`my-desk`, `quotations`, `followups`). The shell therefore asks the database for nothing extra, and
— which matters more — the sidebar and the screen behind it cannot disagree about how many
follow-ups are overdue. That is the sort of contradiction nobody reports and everybody quietly stops
trusting.

Two deviations from §5, both because the alternative would have thrown away something that works.
The **quotations list keeps its grouping** — one enquiry, its offers, the revisions of each folded
behind the newest — rather than becoming the mockup's flat table; the grouping is the thing that
screen is for. And the costing editor's actions are plain buttons rather than an `Exports ▾`
dropdown: exports became a tab like the rest, which needed no new menu.

The costing editor is the screen that changed most. It was one column of twelve cards read top to
bottom, so on a four-panel costing the exports were five screens down and the totals were nowhere
near the panel being changed. The panels are the vertical tabs now, each with its ex-VAT price, the
totals sit under the tab column, and the rest is filed behind a name. Nothing it does changed:
no database, no engine, no pricing. NPP-192 is untouched.
