# D-2026-09-16-revision-carries-the-drawing

**16 September 2026.** A revision carries each panel's latest drawing forward, behind
`layout_follows_revision`, off by default — and the copy re-points every device at the revision's
own kit lines rather than cloning the jsonb.

`create_costing_revision` copied the costing, its rates, its panels, its kit lines, its items and
its labour, and never `panel_layouts`. A revision's panels are new rows and a drawing hangs off a
panel, so a revised costing started undrawn — and because `pdf/ga.ts` gives a panel with no saved
layout no sheet, **Annexure V simply vanished from the revised quotation**. Nothing said so. Found
by checking a sentence written into the runbook rather than trusting it.

**Why it is a switch and not a fix.** A revision usually means the board has changed. A drawing
carried onto a changed board is a wrong drawing on a quotation, which is worse than a missing one —
so which behaviour is right depends on the job, and that is the owner's call rather than a default
anybody can pick for them. Off reproduces what shipped exactly: the layout is not copied at all,
rather than copied and hidden, because rows nobody asked for are how a switched-off feature stops
being switched off.

**The part worth remembering.** `panel_layouts.sections` is jsonb and every placement inside it
carries a `costing_assembly_id`. A revision re-creates those lines as new rows, so a copy that
clones the jsonb hands the new panel a drawing wired to lines that do not exist on it. The PDF
would render it perfectly — `ga.ts` matches nothing by that id — while the editor reads "0 of N
placed" against every kit and door-mounted devices match no section. **It would look right and be
wrong**, which is the failure mode this repository keeps meeting and keeps having to design
against. So `remap_layout_sections` re-points every id through `copied_assemblies`, the mapping the
revision already builds, and a placement the mapping cannot cover is dropped rather than carried.

That was proved rather than asserted: the naive version — cloning the jsonb — was written first,
and it passes every assertion in `53_layout_follows_revision.sql` except the one that counts ids,
which it fails with three devices pointing at the wrong revision. An assertion that only a wrong
implementation fails is worth more than three that any implementation passes.

`copy_costing` and `copy_panel` are deliberately untouched: a copy is a new job, which makes
carrying a drawing a different question. It is in `docs/open-questions.md` rather than decided here.
