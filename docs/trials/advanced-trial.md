# Staging trial — the advanced app, end to end

**Why this exists.** Seventeen features went onto the staging app on 12 Sep 2026, each behind a
switch of its own, and not one of them has been driven by a person. Tests prove the arithmetic;
they cannot tell you whether a screen makes sense, whether a word is wrong, or whether the proposal a configurator makes is
the board you would have built. That is this hour's job.

`docs/acceptance-test.md` is the other script: the **basic app on production**, which is
unchanged. This one is only for **staging** (the CostMatrix Staging project, the `advanced`
branch's preview URL).

**Before you start.** Sign in to the staging app as yourself (master administrator) — §0 needs that role to switch the features on. Have
`docs/reference/costing-NPP-192-REV1.xlsm` open — several steps compare against it.

**How to note a finding.** Every row in the table at the bottom. Small things count: a word
that reads wrong is as worth writing down as a number that is wrong. Do not stop to tell me
between steps; finish the pass, then send the lot.

---

## 0. Is staging carrying all of it, and is any of it switched on? — 6 minutes

Three things before any clicking, so a missing migration is not mistaken for a broken screen —
and so an empty menu is not mistaken for a missing feature.

- [ ] Open the staging project's **SQL editor** in Supabase. Open
      `supabase/checks/deployed-features.sql` from the repository, copy the whole file in, run it.
      **Expect:** about 60 rows, every one `present = true`. A `false` row is a feature whose
      migration has not landed — write down which and stop; the rest of this script will fail in
      confusing ways.
- [ ] **Every advanced feature now arrives off.** That is deliberate (D-266, and condition 2 of
      the two-track rule): the app has to be able to reach production looking exactly as it does
      today. So the menu is short until you say otherwise, and a short menu at this point is the
      switches working, not a feature missing.
- [ ] Open **Features** in the top bar. **Expect:** seventeen rows, each with what it does in plain
      words, every one **off**, and a switch beside each because you are the master administrator.
      Switch **all seventeen on** — this pass is meant to exercise the lot. Three of them are marked
      in red as changing what an existing costing does (**Approval rules in force**, **Validity and
      the nightly sweep**, **Chosen option and optional extras**); switch those on here and note
      that nothing you have already costed moves.
- [ ] Look at the menu across the top again. **Expect** these to have appeared: **Sales**, and
      under the administrator's half: **Price lists**, **Approval rules**, **Compatibility**,
      **Labour variance**, **Assistant**.

## 1. A supplier price list — 8 minutes *(roadmap 2.2)*

- [ ] **Price lists → Upload a price list.** Use a real supplier list if you have one; otherwise
      export a handful of rows from the Components screen to Excel, change three prices, and
      upload that.
- [ ] The column mapping is guessed. **Expect:** the part-number and price columns already
      chosen. Correct it if not — and note what it guessed wrong.
- [ ] **Expect** the review to show, per row: the price now, the price asked for, the percentage
      change, and how it matched (by code, part number or manufacturer part number). Rows it
      could not match are listed separately with a reason.
- [ ] Tick two rows, accept them. Leave the rest. **Expect:** only those two change.
- [ ] Open one of those parts on **Components**. **Expect:** the new price, and its price history
      showing the old figure, the new one, and the file name it came from.
- [ ] Discard the rest of the upload. **Expect:** nothing else moved.

## 2. Measure a few parts — 5 minutes *(foundation F12)*

The space check stays silent until things have been measured, so measure enough for one panel.

- [ ] **Components** → open the ACB or MCCB you use most → fill in width, height, depth, the
      mounting type, and clearances if you know them. Save.
- [ ] Do the same for **one enclosure cubicle**, and fill in its usable internal area.
- [ ] `data/seed/dimensions-template.csv` in the repository is the bulk way in, with every part
      number already listed — for later, not now.

## 3. One job, configured from the questions — 20 minutes *(roadmap 3.1, 3.2, 3.3, 3.4, 4.1)*

- [ ] **Enquiries → New**: the customer, the job title. Then **New costing** against it.
- [ ] Add a panel. In the panel, **Configure this board**. Answer it as you would describe the
      NPP-192 board to a colleague: fed from grid and generator, a 1250 A ACB incomer, automatic
      changeover, twelve 100 A ways and six 63 A ways, 400 kVAr of correction, metered, form 4B,
      IP54, front access, bottom cable entry.
- [ ] **Work the board out.** Read the proposal before applying anything.
      **Expect:** the incomer is the smallest ACB in your library that reaches 1250 A — check that
      against what you would have picked yourself, and write it down if it differs. Each line says
      which answer put it there. The changeover is in its own section.
      **Expect to see a gap named:** the correction, because every breaker-protected step kit in
      the library still holds one of the eight unpriced parts. That is the configurator telling the
      truth. If it proposes the fuse-protected family instead, fine — note which it chose.
- [ ] Change a quantity in the proposal, set one line to 0, then **Add … to this panel**.
      **Expect:** what you edited, not what was proposed; the lines land in their sections, priced.
- [ ] **Expect** a *things to check* card on the panel if anything does not hang together — a
      device deeper than the cubicle, an accessory on the wrong device, the outgoing ways adding up
      past the incomer. Read the sentences: are they right, and are they the ones you would want?
- [ ] **Work out an APFC bank** of 400 kVAr on the same panel. **Expect** the grading to look like
      your own: roughly 50 / 25 / 18.75 / 6.25 per cent across your four largest sizes.
- [ ] If any of your kits ask for a parameter (busbar metres, steps), **expect** the kit picker to
      ask for it and to show the line quantities it works out from your answer.
- [ ] **Expect** a space line on the panel now that you have measured a cubicle: *fits*, *tight* or
      *will not fit*, with the percentage. It changes no price — it is advice.
- [ ] **Lay this panel out** *(roadmap 3.8)* — the pop-up. Press **Work the board out**.
      **Expect:** the board drawn at true scale, a section per busbar-fed device, covers stacked
      down the feeder sections, and a line under each saying how full it is. Open *Why each section
      is there* and read the rules; tell me any that are wrong, because they are the whole feature.
      **Expect** the kits the library has not described yet to sit in amber on the left, unplaceable
      — that is most of them until the kit template is filled in.
- [ ] Drag a kit onto a section built for another design. **Expect a refusal in words**, not a
      silent nothing. **Save layout** — and check the costing's total has not moved. Then **Put
      these cubicles on the costing** and see the Enclosure section appear.
- [ ] Now the other four views, along the top: **Rear**, **Plan**, **Door**, **3D**.
      **Expect** the rear to show the sections **mirrored** — the order you see them walking round
      the board — each saying whether its cables land on lugs at the back or on shrouded terminals at
      the front. **Expect** *Plan* to look down on the section you last clicked, with the vertical
      busbar, the mounting plate, the cable alley and the door's swing, dimensioned. **Expect** the
      door to be plain unless a part of the panel carries *Mounting: door*, and to name any
      door-mounted part it has no size for. **Expect** *3D* to be an isometric you can see from the
      left or the right — turn the **Doors** layer off to look inside.
      This is the view to judge against your own mockups; tell me anything that looks wrong.
- [ ] Click a section and find the **Section** panel on the left. Change **Cable alley** to *behind
      the plates*. **Expect** the plate to go from 450 to 650 mm on an 800 mm section — and, if the
      section is shallower than 800 mm, **expect the verdict to turn to "will not fit" and say why in
      millimetres**. That refusal is the point: the cables would have nowhere to go.
- [ ] **Save the layout**, then go to that costing's **Release** screen and press *Preview*.
      **Expect** a new **Annexure V — General Arrangement** after the technical offer: a landscape
      page per panel you laid out, in plain black line art, each device carrying a tag `Q1, Q2 …`,
      a dimension line under the board and an overall size. **Expect the same tags** to appear in
      that panel's Annexure IV row, as *Device tags (see Annexure V)* — they are numbered once, so
      they cannot disagree. **Expect** the cover letter's annexure list to now read five.
- [ ] Preview a quotation for a costing whose panels you have **not** laid out. **Expect no
      Annexure V at all** and the list back at four — the quotation must look exactly as it did
      before this feature existed. If it does not, that is a bug and I want to know.
- [ ] Pick **Our double-front frame** in the construction box — if its widths are still empty it will
      tell you so, which is the honest answer until you give me the figures. Where it has them, set
      **two faces** and press *Work the board out* again. **Expect** the covers that needed two
      sections to fit one, with the seventh on **face B**, and the verdict reported **per face** —
      a double-front section fits only when both faces do.
- [ ] **Work out the busbar runs** on the same panel *(roadmap 4.1)* — this is your `CU-OPT1` sheet.
      Press **Start from this board**. **Expect:** the runs a board like this needs, named, with the
      bar sizes your own kits use at those ratings, and a line saying the lengths are your usual
      figures rather than a measurement. Correct two lengths against a real drawing and watch the
      metres and kilograms follow as you type.
- [ ] **Save the schedule.** **Expect the costing's total not to move by one shilling** — a schedule
      is a calculation, not a line. Then **Add these as busbar lines**: now the copper is in the
      price, in a *Busbar* section. Press it a second time and **expect a refusal**, not doubled
      metres.
- [ ] Compare the totals with the `CU-OPT1` sheet of your own workbook if the board is similar:
      70.4 m of 50×10 and 95.3 m of 20×10 were what it worked out for NPP-192, against the 30 and 77
      the estimate carried. The card names that gap when the panel already holds busbar — tell me if
      the sentence reads wrongly.

## 4. The same costing as a grid — 8 minutes *(roadmap 2.9)*

- [ ] Add a second panel, similar to the first: **Copy panel…** then change two quantities.
- [ ] Press **Grid** at the top. **Expect:** both panels as columns, every kit and loose part as a
      row, blanks where a panel does not use something.
- [ ] **Compare** the two panels. **Expect:** only the rows that differ marked amber, and the
      count beside it matching what you changed.
- [ ] Type a quantity into a cell. **Expect** the total to move and the panel card to agree when
      you switch back. Clear a cell: the line goes.
- [ ] **Excel.** **Expect** the file to hold what is on screen, sections and totals, with a second
      sheet of what each panel costs.

## 5. Two options and an extra — 8 minutes *(roadmap 2.7)*

- [ ] On each panel's *Details*, set **Option** — *Option 1* on one, *Option 2* on the other.
- [ ] In **Totals**, **expect** a *Per option* table, and a warning that the grand total is the sum
      of two offers until you choose. Choose one under **Offered as**.
      **Expect:** the total becomes that option's, and the other panel reads *not the chosen option*.
- [ ] Add a third small panel, tick **Optional extra** in its details. **Expect** it priced, and
      reported under the total as *Optional extras, if the customer takes them* — not inside it.

## 6. Approval rules — 6 minutes *(roadmap 2.5)*

- [ ] **Approval rules** → read the one rule every company starts with: *Always require an
      approver*. **Expect** the sentence to read plainly.
- [ ] Add a rule of your own: minimum margin, say 15 %, outcome *an approver must approve it*.
      **Expect** the sentence it reads back to be the rule you meant.
- [ ] On the costing, **expect** a *why this needs approval* card: the verdict, each rule, whether
      it holds, and the figure it looked at.
- [ ] **Submit.** **Expect** the rule that decided to be named, and the history to say so.
- [ ] Approve it as yourself.

## 7. Quotation, validity, re-issue — 10 minutes *(roadmap 2.6, 2.7)*

- [ ] **Release quotation.** **Expect** the PDF to print **a price schedule per option**, and any
      optional extra in its own table under its option, headed *not included in the total above*.
      Compare the schedule against the NPP-192 quotation's shape.
- [ ] **Mark sent.** On **Quotations**, **expect** a line under it: *Valid for N more days*.
- [ ] Press **Re-issue at today's prices** on the approved costing. **Expect** a new revision with
      every line priced again, the approved one untouched, and anything that could not be re-priced
      named.

## 8. What the job actually took — 8 minutes *(roadmap 2.8)*

- [ ] On the costing, **Hours actually worked → Show**. **Expect** the estimate per panel and
      process, and *not yet* where nothing is recorded.
- [ ] File hours against one panel, twice (two weeks). **Expect** them added up, the difference in
      hours and in money at the frozen rate, and the percentage.
- [ ] **Expect the costing's own total not to move.** This is the one I most want confirmed by eye.
- [ ] Remove one entry. **Expect** the figure to drop by that much.
- [ ] **Labour variance** in the menu. **Expect** a row per kit group and process, with what it
      rests on in words — *1 job, 6 kits — too little to change a standard on*.
- [ ] Press **Apply** on one row. **Expect** to be asked to confirm, and the confirmation to say
      new costings use it while existing ones keep the hours they froze. Check the kit group's
      hours afterwards.

## 9. Somebody else's parts list — 6 minutes *(roadmap 2.3)*

- [ ] On a draft costing, **Start from a parts list**. Upload an EPLAN or consultant list, or build
      a small CSV of part numbers and quantities.
- [ ] **Expect** each row matched, and where a matched device is the main device of exactly one
      kit, **the kit proposed rather than the bare device** — with the reason shown.
- [ ] **Expect** unmatched rows to offer a placeholder, and creating one to add the part to the
      library **unpriced and with no costing line** — with the row saying so.
- [ ] Apply. **Expect** the lines on a panel of their own.

## 10. Sales — 6 minutes *(roadmap 3.6)*

- [ ] Decide two enquiries: one **won** naming its quotation, one **lost** with a real reason.
- [ ] **Sales.** **Expect:** the hit rate with *1 of 2 decided* beside it, won and lost in money,
      the share by value, and average days to decide.
- [ ] **Expect** the four breakdowns (customer, value, month, product group), and the lost reason
      in the words you typed.
- [ ] **Expect** the job you recorded hours against to appear under *Margin quoted, margin
      achieved*, with **Measured** at 100 %, and the achieved margin below the quoted one if the
      shop took longer. A job with no hours recorded should **not** be in that table at all.
- [ ] **Expect** *Still out there* to hold only the undecided jobs, with the offer each waits on.

## 11. The assistant — 3 minutes *(roadmap 2.4)*

- [ ] On a costing, open the **Assistant** panel and ask it something.
- [ ] **Expect a failure in plain words** — something about credit — because the Anthropic account
      has none yet. A generic error, or a spinner that never ends, is a finding.
- [ ] **Assistant** in the administrator's menu: **expect** the switch and the usage figures.

## 12. One isolation spot-check — 3 minutes

- [ ] Sign in as a person from another company (or create one). **Expect** none of this job's
      figures anywhere: not on Sales, not on Labour variance, not in the pipeline.

---

## Findings

Number them. For each: which screen, what you did, what you expected, what happened. A
sentence each is plenty.

| # | Screen | What you did | Expected | What happened |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

**What I will do with them.** Each finding comes back as its own small pull request against
`advanced` — or against `main` if it turns out to be in the basic app too — smallest and most
annoying first, unless you order them differently.
