# Decisions — one file each

**A decision made from 14 September 2026 onwards is a file in this folder.**
`../decisions.md` is the archive of everything decided before that, and it is closed.

## Why this folder exists

Every pull request used to end by appending a paragraph to the bottom of one file. Two sessions
work on this repository at once, so two pull requests would each add a paragraph in the same
place — and git cannot merge two additions at the same spot without asking somebody which comes
first. Neither answer is wrong; both paragraphs belong. It is a conflict with no disagreement in
it.

That cost is not constant, it is quadratic. On 13 September nine pull requests were open, every
one of them green against `main` and **every pair of them conflicting with each other**, always
in `decisions.md`. Merging one turned the other eight red; resolving those and merging a second
turned seven red. Draining the queue that way takes about thirty-six resolutions, not one of
which is a decision anybody has to make.

Two sessions writing a decision on the same morning now create two different files, and git
merges two new files without a word.

This is the third time the same shape of problem has been fixed the same way. Migration numbers
and decision numbers were both conventions that two sessions had to remember, both were broken
within a week, and both were replaced by a mechanism. Decision *text* is the third.

## The three rules

1. **One file per decision**, named `YYYY-MM-DD-short-name.md` — the date it was decided and a
   few words of slug.
2. **The file's id is `D-` plus its filename**, and the file says so on its first line. The file
   above is `D-2026-09-14-decisions-one-file-each`. A decision filed under the wrong name is a
   decision nobody finds again.
3. **An id is used once, ever** — here or in the archive. `scripts/check-numbering.sh` checks
   both, in CI, on every pull request.

## The shape of one

```markdown
# D-2026-09-14-short-name

**14 September 2026.** One sentence in bold saying what was decided.

Then the why, in as many paragraphs as it needs. What the alternative was and why it lost is
worth more than the decision itself, because that is the part nobody can reconstruct later.
```

Nothing else is required. No front matter, no fixed sections, no index to keep in step — the
folder listing is the index, and it sorts by date on its own.

## Reversing one

Never edit a decision to say the opposite, and never delete one: the record of what was believed
at the time is the whole value. Write a new file that says what changed and names the id it
supersedes, exactly as the archive's own rule has always said.

## The archive

`../decisions.md` holds `D-001` to `D-293` as running numbers, then the dated ids used between
13 and 14 September, and it stays exactly as it is. Splitting three hundred rows into three
hundred files would have conflicted with every open pull request at once — the fix would have
inflicted the very cost it removes. Both places are searched by the same `grep`, and both are
checked by the same script.
