# Decisions — one file each

Every decision taken about this app, one file per decision, named
`YYYY-MM-DD-short-name.md`.

## Why it is a directory and not a list

It used to be a list: `docs/decisions.md`, one row appended per decision. That file is still
here, and it is still the record of everything decided up to 13 September 2026 — but nothing is
added to it any more.

On 14 September nine pull requests were open at once, two sessions working in parallel. Every one
of them was green against `main`. **Every pair of them conflicted with every other pair**, and the
file was the same one every time: both had appended a paragraph to the end of `decisions.md`.
Draining nine of those takes about thirty-six conflict resolutions, not one of which is a
disagreement — every one is "keep both paragraphs".

Two sessions writing a decision on the same morning now create two different files, and git merges
two new files without asking anybody anything.

This is the third time the same shape of problem has turned up here. Migration numbers were fixed
by `scripts/check-numbering.sh`; decision *numbers* were fixed by dating them; this is decision
*text*. Each time the answer was the same: replace a convention everyone has to remember with a
mechanism nobody can forget.

## How to add one

Create `docs/decisions/YYYY-MM-DD-short-name.md`:

```markdown
# D-2026-09-14-short-name

What was decided, and why — in the register the rest of the documents use: plain words, the
reason before the mechanics, and what it cost or what it rules out. One paragraph is usually
right; two if the reason needs it.
```

Three rules, and `scripts/check-numbering.sh` enforces all three in CI:

1. **The id on the first line must match the filename.** `2026-09-14-foo.md` holds `D-2026-09-14-foo`.
   A decision filed under the wrong name is a decision nobody finds again.
2. **The id must be unique** across this directory *and* the archive.
3. The date in the id is the day it was decided, and it does not change afterwards.

## Where the old ones are

`docs/decisions.md` — D-001 to D-293 as running numbers, then the dated ids up to
`D-2026-09-13-terms-page`. It is closed, not deprecated: every one of those decisions still
stands unless a later one says otherwise, and the several hundred references to them elsewhere in
the documents all still resolve.

It was left alone on purpose. Splitting three hundred rows into three hundred files would have
conflicted with all nine open pull requests — the fix would have inflicted exactly the cost it
exists to remove.
