# D-2026-09-15-layout-says-what-it-is-missing

**15 September 2026.** The panel layout says when the obstacle is the library rather than the
board, the runbook describes the screen that exists instead of the one that did not, and a script
proposes the mounting design for all 296 kits so the column can be checked rather than typed.

The owner opened the layout on a real panel, saw an empty drawing, and asked what the screen was
for. Nothing was broken: every kit in the library is undescribed — `mountingDesign` filled in on
**0 of 296** rows, `widthMm` on **0 of 735** — so there was no rule by which to arrange anything.
The screen said *"No sections yet. The button above arranges the kits…"*, which describes the
button rather than the obstacle, and is the most useless kind of true.

A screen that cannot do its job should say which of the two reasons applies, because only one of
them is the person's to act on. An unarranged board and an undescribable board looked identical,
so the first thing the owner could do about it was ask a human. `libraryGap()` separates them: when
**every** kit on the panel is undescribed the drawing names the gap and both places to fill it,
and when one kit can still be placed the old wording stands, because then the button really is the
next step.

The runbook was worse than silent. `operations.md` still opened *"The layout pop-up itself is not
built yet"*, written before the three pull requests that built it — so the one document somebody
would consult told them the screen they were looking at did not exist.

**The draft script proposes one column and refuses to guess the other.** The 17 labour groups map
cleanly onto the six mounting designs, because both describe the same thing: what kind of device it
is, and therefore how it is mounted. Module heights are a different matter — they come from the S4
planning manual, no rule derives them from a kit name, and a guessed height would be **drawn at
true scale and look exactly as authoritative as a real one**. So the script fills the design, leaves
every height blank, writes to `docs/reference/` rather than to the owner's `data/seed/`, names the
two groups whose answer is a judgement, and checks every kit's own name against the design proposed
for its group so an ACB filed under MCCB is named rather than quietly mis-drawn. Three groups that
looked like judgements turned out not to be, once their names were read.

Two claims written into the runbook were checked against the code and one was wrong: a revision does
**not** carry the panel drawing. That is recorded in `open-questions.md` as a question rather than
fixed here, because copying a drawing forward onto a board that has changed may be worse than
starting undrawn, and that is the owner's call.
