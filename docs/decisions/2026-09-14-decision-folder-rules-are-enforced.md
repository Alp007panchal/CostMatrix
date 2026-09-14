# D-2026-09-14-decision-folder-rules-are-enforced

**14 September 2026.** The rules `docs/decisions/README.md` states are now actually checked by
`scripts/check-numbering.sh`, and `CLAUDE.md` — the file every session reads first — stops
pointing at the closed archive.

Two sessions reached the same conclusion within the same hour on 14 September: every pull request
had been appending a paragraph to the bottom of `docs/decisions.md`, and with nine open at once,
every pair of them conflicted there and nowhere else. The other session's split landed first and
is what this repository uses. This file is the second half of it, and it is worth recording
separately because a mechanism that is described but not implemented is the exact failure this
whole line of work exists to stop.

The folder's README said its three rules were "enforced in CI". They were not. The script read
only the archive, so an id could be used in both places at once, and a file could carry a heading
that disagreed with its own filename — which is the worst of the three to get wrong, because
nothing is visibly broken and the decision simply cannot be found again by the name people cite.
Checks 3 and 4 close that: an id must be unique across the archive *and* the folder, and a file's
first heading must be the id its filename promises.

`CLAUDE.md` mattered more than the script. It still said *"record every decision as one line in
`docs/decisions.md`"*, which is now the closed archive. That file is the first thing every session
reads, so a stale instruction there does not sit quietly — it gets followed, and it produces
exactly the collisions the guard exists to catch.

It also carried the next free migration number as a literal, and that number was wrong twice
inside one hour: it said 0123 when four branches already held 0123 to 0127, and while this change
was being written another session renumbered its migration to 0128, so the corrected literal was
stale before it was committed. A number that has to be remembered and kept up to date by hand is
the very thing this script replaced everywhere else, so it is computed now — the script prints the
next free number on every run, from `main` and every remote branch, and `CLAUDE.md` points at the
script instead of quoting it.

The naming of this pattern is the part worth keeping. Three times now — migration numbers,
decision ids, decision text — two sessions have collided at a spot where both had to remember the
same convention, and three times the answer has been the same: **move the spot, or make a machine
check it; do not ask the next session to be more careful.** A fourth candidate is already known
and named in `docs/open-questions.md`: `web/src/lib/database.types.ts`, one hand-written file that
every feature appends an interface to. It is deliberately left for a quiet morning, because
putting it right touches most of the app while changing nothing it does, and that is a poor thing
to merge into a queue.
