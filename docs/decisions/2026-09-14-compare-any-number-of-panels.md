# D-2026-09-14-compare-any-number-of-panels

**14 September 2026.** The grid compares **any number of panels**, chosen with one button each, and
the ones not chosen **leave the table**.

It was two dropdowns — "compare A with B" — which is what roadmap 2.9 §3 asked for and the wrong
shape for the job the owner actually does. His screenshot is five sub-boards that ought to be
identical. The question there is not "do these two differ", it is "which one is the odd one out",
and a pair at a time answers that in ten comparisons rather than one.

Two judgements went into it.

**Pressing a panel hides the others**, rather than only tinting the pair. Two columns to compare are
no use four columns apart: with five panels and twenty rows the eye cannot hold the gap. Hiding is
also why buttons beat a multi-select — the set in force has to be readable at a glance, and a pressed
button says so without being opened. Nothing pressed shows everything, which is what the grid did
before and what it does on arrival.

**The roll-up column keeps counting every panel**, and says so: it reads *All 5 panels* rather than
*All panels*. It is the costing's own figure and it matches the totals rows; quietly changing what a
column counts because somebody filtered the view is the kind of thing that is believed for months.
The Excel export is whole-costing for the same reason, and its button now says so — a filtered
spreadsheet arriving in somebody's inbox with no sign that it is partial is worse than no export.

`differingRows` took two panel ids and takes a list. With three or more, a row is marked when any one
of them disagrees with the rest, a blank counting as nought — which is the case that matters, since
the commonest fault in five near-identical boards is one that is missing a row altogether rather than
one that has a different number in it. Both are tested, and the hiding was proved by making the
filter a no-op and watching two tests fail.
