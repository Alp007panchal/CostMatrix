# D-2026-09-16-assistant-drafts-the-letter

**16 September 2026.** The assistant may draft the quotation's cover letter — the subject, the
opening, the closing and the notes on offer — into the four boxes on the Release page. It is the
first of roadmap 3.7's three parts, and the first thing the assistant writes that a customer will
read.

**It proposes; it never writes.** A drafted letter lands as an `assistant_proposals` row of the new
type `quotation_wording` (migration 0133) and stays there until the approver presses *Use this
wording*, which fills the form they were already editing. **Release** is still the only button that
releases anything. That is the assistant's standing rule (spec §6.3) and it matters more here than
anywhere else: these words go out on the company letterhead over a named signatory, and there is no
recall.

**It is the one proposal type the database never applies.** `app.apply_proposal` (0104) has a
branch per type and had none for this one, so a wording proposal fell through every branch and
failed on a null status — a refusal, but spelled as a database error nobody could act on. The
`public.apply_proposal` wrapper, which is what the web calls, now refuses it in a sentence that
says where to read it instead. Ten lines in the wrapper rather than a 120-line copy of the function
to add one `elsif`, because a copy nobody can review is a worse guard than none.

**No price can move, and the guard is in the validator rather than in the prompt.** Telling a model
not to quote a figure is a wish; `checkWording` refusing a payload that matches
`KES|KSH|USD|EUR` beside digits is a rule. The price schedule is built from the costing, as it
always was, and a figure typed into prose is a figure nobody checked. The same check caps each
field's length, because the letter is rendered into a fixed PDF layout and a subject that runs to
three lines pushes the page apart in front of a customer.

**A draft never silently overwrites somebody's words.** The approver may have typed their own
subject before asking, and losing it to a machine is the sort of small betrayal that stops people
using a feature. So `draftedLines` marks every field where their text would be replaced, and says
how many, *before* the button is pressed — and a field the assistant left out is not offered at
all, rather than offered blank.

**No new switch.** It rides `assistant`, which is off by default and master-administrator-only. A
letter can only be drafted from the assistant, so a second switch would gate a door that is already
locked, and an extra row on the Features screen that never means anything on its own is how that
screen stops being read.

Found while building it, and fixed here: the Edge Function coerced any unknown task to `question`
(`index.ts:73`), so a letter request would have been answered as an ordinary question with none of
the prohibitions above ever reaching the model; and the Assistant panel sent every non-review
proposal to the draft-costing card, which would have rendered a wording proposal as an empty table
with an Apply button on it. Both were invisible faults — the screen would have looked like it was
working.

Still unproven, and the pull request says so: **no letter has ever been drafted by a real
provider.** There is no credit on the Anthropic account, so the assistant has never answered live.
Everything here is proved against the fake provider, the database (test 54) and the browser tests.
