# D-2026-09-17-assistant-asks-across-jobs

**17 September 2026.** The assistant can be asked about the company's own jobs, on a screen of its
own, rather than only about the record in front of it. This is roadmap 3.7's remaining third, and
it completes 3.7.

**What was actually in the way was not a permission.** Every conversation hung off one enquiry or
one costing, because `assistant_conversations.entity_type` allowed nothing else — and the question
task told the model so in as many words: *"questions across all costings and the CRM are not
available yet, so say so if asked."* So the change is a third entity type, `company`, and one new
read.

**A question cannot become a change, and the database is what says so.** `assistant_proposals`
keeps its two-value entity constraint, so a proposal from a company-wide conversation is refused by
a check constraint rather than by the model being told not to. The tool refuses first with a
sentence — *open the costing or the enquiry to propose anything* — so the model reads English
rather than a constraint name, but the constraint is the guard. A rule in a prompt is a wish.

**`app.search_costings` is `security invoker`, and that is the whole security design.** It sees
exactly what the person asking could see by clicking, because row-level security answers the
question, not a `where company_id = …` somebody remembered to write. The test that matters is Beta
asking Alpha's question and getting nothing: it passes because of RLS, not because of a filter.

**It names jobs; it never totals them.** Each costing is frozen in its own currency on its own
date, so a figure added across them would look authoritative and mean nothing — the worst kind of
wrong answer, because nobody checks a number that looks right. The function returns a `note` saying
so and the task template repeats it, which is belt and braces on purpose: this is the one thing the
feature could plausibly get wrong in a way that reaches a customer.

**No new switch.** It rides `assistant`, off by default. The screen is behind the same
`FeatureGate` as the settings page, and the nav link disappears with it.

Still unproven, and the pull request says so: **no question has ever been answered by a real
provider.** There is no credit on the Anthropic account. Everything here is proved against the
database and the browser tests — which is to say the read, the refusals and the screen are proved,
and the answering is not.
