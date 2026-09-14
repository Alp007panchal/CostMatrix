# D-2026-09-14-decisions-one-file-each

**14 September 2026.** A decision is now one file in `docs/decisions/`, named for the day it was
made; `docs/decisions.md` becomes the closed archive of everything before it.

Every pull request ended by appending a paragraph to the bottom of one file, and two sessions
work on this repository at once. Two additions at the same spot are a conflict git cannot settle
on its own, and neither side is wrong — both paragraphs belong, in either order. It is a conflict
with no disagreement in it, which is the worst kind to have to resolve, because there is nothing
to think about and it still costs a resolution.

The cost is quadratic, not constant. On 13 September nine pull requests were open, each one green
against `main`, and **every pair of them conflicting** — checked pairwise with `git merge-tree`
rather than assumed, and the file was `docs/decisions.md` every time. Merging one would turn the
other eight red; resolving those and merging a second would turn seven red. Draining that queue
costs about thirty-six resolutions, none of which is a judgement anybody has to make. It was also
not theoretical: it happened again on PR 67 the following morning.

One file per decision removes it outright. Two sessions writing on the same morning create two
different files, and git merges two new files silently.

**The archive is deliberately not split.** Turning three hundred existing rows into three hundred
files would have conflicted with all nine open pull requests at once — the fix would have
inflicted the exact cost it exists to remove. So `decisions.md` keeps `D-001` to `D-293` and the
dated ids written on 13 and 14 September, and stops there. Both places are one `grep` away from
each other, and `scripts/check-numbering.sh` now checks ids across both, plus that a file's
internal id matches its filename — a decision filed under the wrong name is a decision nobody
finds again.

This is the third time this shape of problem has been fixed the same way, and the pattern is
worth naming. Migration numbers were a convention two sessions had to remember, and 0116 was
taken twice. Decision numbers were the same, and collided three times in a week. Both were
replaced by a mechanism rather than a firmer reminder. Decision text is the third, and the same
answer applies: **when two sessions keep colliding at a spot, move the spot, do not ask them to
be more careful.**

The second file with this shape is named and not fixed here: `web/src/lib/database.types.ts`, one
hand-written file every feature appends an interface to. It appeared in one of the nine pairs
rather than all of them, and the remedy is different in kind — `docs/architecture.md` already says
each module owns a `types.ts` and the repository has drifted from it. That is its own change and
doing it here would put this one past what can be reviewed in a sitting. It is in
`docs/open-questions.md` with what it costs.
