# D-2026-09-13-register-count-free

**13 September 2026.** **The feature register is tested by its invariant, not by a count both sessions must remember.** `40_feature_switches.sql` asserted `count(*) = 16`, with a comment reading "the number moves with every feature built" — and it moved on two branches at once. That is the same shape as the migration numbers and the decision ids, which broke three times in one week before `check-numbering.sh` replaced the convention with a mechanism. The count is replaced by what it was standing in for: every feature has a switch of its own, and every company has every switch, off. Both were proved to bite by introducing the faults on purpose — a feature registered with a blank `option_key`, and a company missing one switch — neither of which the count could ever have caught.

Written by the other session on 13 September, when a decision was still a row in
`docs/decisions.md`. Its pull request (62) was closed with conflicts rather than on its merits,
so the decision never landed — **but the change itself did**, by some later route:
`40_feature_switches.sql` on `main` today asserts the invariants rather than a count, exactly as
described above. So this file records a decision the code has already been following, found while
reviving the rest of PR 62 on 15 September. A change that ships without its reason is how the
next session comes to undo it.
