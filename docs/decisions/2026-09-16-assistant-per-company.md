# D-2026-09-16-assistant-per-company

**16 September 2026.** The master administrator picks the company at the top of the Assistant
settings screen, and the switch, the budget, the thresholds and the usage all follow the choice.
This is roadmap 3.7's last third — *"external companies switched on per company"* — and it turned
out to be one line of the wrong company id rather than a feature.

**The permission was already right.** `company_options_write_master` (0102) lets a master
administrator write any company's options, and `app.protect_master_options` refuses everybody else
the `ai_*` and `feature.*` keys. Nothing about who may do this needed inventing. What was wrong was
that `AssistantSettingsPage` read `company.id` from the session, so the only person allowed to
switch the assistant on could switch it on **for their own company and nobody else's** — and an
external company could therefore never have it. A permission nobody can reach is not a permission.

**The figures had to move with the switch, which is the part that needed a migration.**
`app.assistant_allowance` (0103) and `app.assistant_usage` (0104) both read
`app.current_company_id()`. Shown beside a switch for Beta they would have reported Alpha's tokens,
Alpha's cost and Alpha's people. A wrong number next to a real decision is worse than no number, so
both now take the company they are asked about, and both carry `company_id` in what they return so
the screen can never quietly disagree with the database.

**One rule, in one place.** `app.assistant_company(for_company)` resolves it: null is your own,
another company is refused unless you are the master administrator. It raises rather than returning
null — a function that quietly answers about the wrong company is exactly the failure this is
guarding. The test that matters is the one where Alpha's own administrator asks for Beta's usage and
is refused; without it, "may name a company" would be a hole in the tenancy rather than a feature.

**Dropped and recreated rather than replaced**, because a defaulted argument alongside a
zero-argument function of the same name makes every existing call ambiguous. The Edge Function
still calls `assistant_allowance` with no argument and did not change.

**No new switch.** This changes who can reach an existing one, not what the app does.

Worth saying beside it: this completes roadmap 3.7, and **none of 3.7 can actually answer yet.**
There is still no credit on the Anthropic account, so switching a company on gives that company a
button which explains, correctly, that there is no credit.
