# D-2026-09-13-labour-check

**13 September 2026.** **A costing that charges nothing for labour says so** (migration 0131). `add_assembly_to_costing` freezes a labour row only `where effective_hours > 0`, so a kit whose group has no hours gets **no labour rows at all**: the material prices correctly, the time is left out, and the costing looks finished. With `kit-group-labour-template.csv` still empty that is the normal case, not an edge one — the most expensive mistake the app can make quietly. `v_costing_labour_gaps` reports it per costing and **names the kit groups to fill in**, because the fix is a row of that template rather than anything in the app. It also tells apart the quieter twin — hours recorded but the frozen hourly rate is zero, where the fix is a rate and a new revision, since a rate set after a costing is created never reaches it. **It blocks nothing and changes no price**: a supply-only job with no labour is legitimate, so it reports and leaves the judgement with the engineer.

Written by the other session on 13 September, when a decision was still a row in
`docs/decisions.md`. Its pull request (62) was closed with conflicts rather than on its
merits, so the decision never landed; it is filed here, unchanged in substance, when the
work was revived at the owner's request on 15 September.
