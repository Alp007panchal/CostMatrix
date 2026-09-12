# Operations guide

How to set CostMatrix up and how to run it day to day. Written for someone who has never
deployed software. Follow Part B once; keep Parts C and D to hand afterwards.

If a step does not match what you see on screen, the service has changed its wording. The
intent of each step is explained, so look for the equivalent button rather than an exact match.

---

**The live system**

| What | Where |
|---|---|
| The app | https://cost-matrix-theta.vercel.app |
| Database and logins | Supabase project `mssqjuzgycfpfmtjukvq`, region eu-west-1 (Ireland) |
| Code | https://github.com/Alp007panchal/CostMatrix |

---

## Part A — What you are building on

Three services, each free to start, each doing one job:

| Service | What it holds | Who signs in |
|---|---|---|
| **GitHub** | The code and these documents. Already set up: this repository. | You |
| **Supabase** | The database, the user accounts and passwords, and the stored quotation PDFs. | You (admin), and every CostMatrix user indirectly |
| **Vercel** | Serves the web pages to browsers. Holds no data. | You |

How a click reaches the data:

```
Someone opens costmatrix.yourdomain.com
        │
        ▼
Vercel sends them the web pages (HTML, JavaScript). No data yet.
        │
        ▼
The page asks Supabase: "who is this person?"  → Supabase checks the login
        │
        ▼
The page asks Supabase: "give me my costings" → Postgres checks the row-level
        security rules and returns only that person's company's rows.
```

The important consequence: **security lives in the database, not in the web pages.** Even if
someone modified the web page in their own browser, the database would still refuse to return
another company's data. That is why the next part is relaxed about one of the keys being public.

---

## Part B — Setup checklist

Do this once. Tick each box as you go. Expect 30–45 minutes.

Three of these steps cannot be delegated, because they need a person: creating the Supabase
account (B2), authorising Vercel against GitHub (B6), and creating the first administrator (B8).
The rest can be run for you once the secrets in B5 are saved — GitHub keeps them write-only, so
whoever runs the jobs never sees them.

### B1. GitHub — already done

The repository `Alp007panchal/CostMatrix` exists and holds this guide. Nothing to do.

- [ ] You can sign in to github.com and see the repository.

### B2. Create the Supabase project

1. Go to **supabase.com** and sign up. Signing in with your GitHub account is easiest.
2. Click **New project**.
3. Fill in:
   - **Name**: `costmatrix`
   - **Database password**: click Generate, then **save it in your password manager immediately**. You cannot see it again afterwards. Losing it is recoverable but annoying.
   - **Region**: **West EU (Ireland)**, `eu-west-1`. Pick a European region and stay with it: it is what the data-protection note tells other companies, and moving later means moving the whole database. London is a few milliseconds closer to Nairobi; Ireland is in the EU. Either is fine, but the documents say Ireland.
   - **Plan**: Free for now. Part E says when to move to the paid tier.
4. Wait a minute or two while it is created.

- [ ] The project dashboard opens and says the project is healthy.
- [ ] The database password is in your password manager.

### B3. Collect four values

Open a blank note to paste them into. Three come from the project, one from your account.

| Value | Looks like | Where |
|---|---|---|
| Project URL | `https://abcdefghij.supabase.co` | Project Settings (gear icon) → **API** |
| Publishable key | starts `sb_publishable_…` | Project Settings → **API**, under Project API keys |
| Project ID / ref | `abcdefghij` — the same letters as in the URL | Project Settings → **General** |
| Personal access token | a long string starting `sbp_` | Your avatar, top right → **Account preferences** → **Access Tokens** → Generate new token, named `github-actions` |

The access token is shown **once**. If you lose it, delete it and generate another; no harm done.

You do **not** need the secret key (formerly service role). Nothing we build uses it directly —
Supabase hands it to the invitation function automatically, inside its own environment.

Supabase used to call these the **anon** key (a long string starting `eyJ`) and the **service
role** key. They are the same two things under new names. An older project showing `anon` still
works — the app accepts either.

- [ ] All four values saved, plus the database password from B2.

### B4. Understand which values are secret

This is the one piece of security you need to hold in your head. Read it twice.

**Safe to publish — the Project URL and the publishable key.** These are sent to every browser that
opens CostMatrix. That is by design and it is not a leak. They only let someone *attempt* a
request; the database then checks who is signed in and returns nothing they are not entitled to.
Anyone can read these out of the web page. That is expected and fine.

**Never share — the access token and the database password.** The access token can change
anything in your Supabase account; the database password opens the database directly. They
belong only in GitHub secrets (next step) and your password manager. Never put them in the web
app, never commit them to the repository, never paste them into a chat window, never email
them. If a token is ever exposed, delete it under Account preferences → Access Tokens and
generate another; that invalidates the old one immediately.

The same goes for the **secret key** (formerly the service role key) if you ever have cause to
look at it: it bypasses every security rule in the database. We do not use it anywhere you could
accidentally leak it.

- [ ] You can say which two of the four values are secret without looking.

### B5. Add the GitHub secrets

These let the automated jobs apply database changes and take backups without any secret sitting
on a laptop or passing through a conversation. GitHub stores them **write-only**: once saved,
nobody can read them back — not you, and not anyone helping you. That is what makes it safe to
have someone else run the setup jobs on your behalf.

1. First create an access token: in Supabase, click your avatar (top right) → **Access tokens**
   → **Generate new token**. Name it `github-actions`. Copy it; it is shown once.
2. In GitHub, open the repository → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**. Add three:

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | the token you just generated |
| `SUPABASE_PROJECT_REF` | the project ref from B3 |
| `SUPABASE_DB_PASSWORD` | the database password from B2 |

- [ ] Three secrets listed on the GitHub Actions secrets page.

GitHub hides these values after saving; even you cannot read them back, only replace them.
That is correct behaviour, not a problem.

### B6. Connect Vercel

1. Go to **vercel.com**, sign up **with GitHub**, and allow it access to the CostMatrix repository.
2. Click **Add New → Project**, pick `CostMatrix`, click **Import**.
3. Settings on the import screen:
   - **Framework preset**: Vite
   - **Root directory**: `web`
   - Build command, output directory and install command: leave as Vercel suggests (`npm run build`, `dist`, `npm install`).
4. Open **Environment Variables** and add two:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Project URL from B3 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | the publishable key from B3, starting `sb_publishable_` |

   (These are the two public values. They are here because the web pages need them.)
5. Click **Deploy** and wait a minute.

- [ ] Vercel shows a successful deployment and gives you a URL like `costmatrix-xxxx.vercel.app`.

### B7. Create the database and deploy the function — I can do this one

The tables do not exist yet in your new project, and the invitation function is not deployed.
One workflow does both, reading the three secrets you just saved.

**Either** tell me the secrets are in place and I will run it and report what happened, **or**
run it yourself: GitHub → **Actions** → **Set up Supabase** → **Run workflow** on `main`. Fill in
the app address if you already have it from step B6; leave it blank if not.

The workflow checks the secrets are present before doing anything, so a missing one gives a
clear message rather than a confusing failure.

- [ ] The workflow finished green.
- [ ] In Supabase → Table Editor, the `companies` and `profiles` tables are there.

From now on, database changes apply themselves whenever they reach `main`. This is the only
time it is started by hand.

### B8. Make yourself the master administrator — this one needs you

Only an administrator can add people, and right now there are none. Creating the first one is
deliberately a human action, so it is two steps in the Supabase dashboard:

1. **Authentication** → **Users** → **Add user**. Use your own email address and choose a
   password. That gives you a login with no company and no roles yet.
2. **SQL Editor** → **New query**. Open
   [`supabase/bootstrap.sql`](https://github.com/Alp007panchal/CostMatrix/blob/main/supabase/bootstrap.sql),
   paste the whole file in, change the three values at the top (your email, your name, your
   company name), and press Run.

It prints what it did. Running it twice changes nothing, so a mistaken re-run is harmless. If it
says there is no account with that email, step 1 has not been done or the address differs.

- [ ] The script reports that you are the master administrator.

### B9. Point invitation links at your app

If you left the app address blank in B7, ask me to run **Set up Supabase** again with it filled
in, now that Vercel has given you a URL. Without it, invitation emails send people to a Supabase
page rather than to CostMatrix.

- [ ] Done, or noted for later.

### B9a. Where a password link lands

Both kinds of email link — the **invitation** sent from the People screen, and the
**Forgot password** link from the sign-in page — send the person to one page:

| | |
|---|---|
| The page | `/reset-password` |
| On production | `https://cost-matrix-theta.vercel.app/reset-password` |
| On the advanced preview | `https://cost-matrix-git-advanced-alp-team.vercel.app/reset-password` |

It asks for a new password twice and saves it. Nobody needs to be told the address: the links in
the emails go there by themselves. It is the only page in the app you can reach without signing
in first, because somebody following an invitation has no password yet.

Three things it says, rather than failing silently:

- a link that has already been used, or has expired, is named as such, with Supabase's own reason,
  and points back to **Forgot password** for a fresh one;
- two passwords that do not match, or one shorter than eight characters, are refused before
  Supabase is called;
- anything Supabase itself refuses (a password that is too common, say) is shown in its words.

If somebody reports "No such page" after following a link, the deployment they landed on is older
than September 2026 — the page did not exist before then, and the link pointed at nothing.

### B9d. Files on an enquiry or a costing, and their text

Both the enquiry page and the costing page have a **Files** card. Anything attached there is kept
in the app's private storage, visible only to your company, and opened through a link that lasts
a few minutes.

Each file also has its **text read**, so the assistant can use it later without being handed the
PDF: the **Text** column says *waiting*, *read*, *not readable* (only PDF, Word, Excel and plain
text are read) or *could not read*, with a **retry** button. Nothing in the app depends on the
text having been read; it is for the assistant.

Reading happens on Supabase, in the `extract-document` function. Like the other two functions it
deploys to production automatically when it changes on `main`. On staging, re-run **Create
staging project**, which deploys every function.

### B9e. The assistant (advanced app only)

On the advanced app — the `advanced` preview, not production — the enquiry page and the costing
page have an **Assistant** card under the Files card. It is closed until you press **Open**.

What you can ask it, from the buttons above the box:

| Button | What it does |
|---|---|
| **Draft this costing from the attached documents** | Reads every attached file, works out the boards and their parameters, and proposes panel lines from your own kits. Greyed out until something is attached. |
| **Review before submission** | Checks the costing against the documents and your company's policy and writes findings, most serious first. |
| **What kits match a 630 A outgoer?** | An ordinary question about this costing and your library. |

It **proposes; it never changes anything.** A proposal appears as a card under the conversation:

- Every line shows the kit it proposes, the quantity, the sentence from the document it came from,
  and how sure it is. **High** and **Medium** start accepted; **Low** starts rejected, because a
  Low line is its nearest guess.
- **Accept**, **Change** (choose another kit) or **Reject** each line, and edit any quantity.
- The button says how many lines it will apply. Pressing it adds them exactly as if you had picked
  them yourself: same prices, same freeze, same totals. Each one is marked as having come from the
  assistant, and the costing's history says who applied it.
- Items it could not match are listed underneath, with a link to create a placeholder part.
- A review's findings each offer **Apply this fix** where a one-click fix is possible.

If it cannot answer, the card says why and what to do. The four you are most likely to see:

| What it says | What to do |
|---|---|
| The Anthropic account has no credit left | Top it up at console.anthropic.com → Billing. Nothing in CostMatrix needs changing. |
| Anthropic refused the key | Check `ANTHROPIC_API_KEY` in the Supabase project's Edge Function secrets. |
| The model it is set to use does not exist | Check `AI_MODEL` and `AI_MODEL_FAST` on the function. |
| The assistant is switched off for your company | The master administrator switches it on (below). |

**Assistant** in the top navigation (company administrators) holds the switch, the monthly token
budget, the two thresholds a review uses, and the usage: tokens by month, who used it this month,
and what it has cost. Only the master administrator can switch it on or off; the thresholds and the
budget are the company administrator's. A rough guide: drafting from a ten-page specification costs
about 30,000 to 60,000 tokens, a review 10,000 to 20,000 — cents, not pounds — and the assistant
warns at 80 % of the budget and stops at 100 %.

### B9b. Turn on two-factor authentication

Not required to finish setup, so skip the prompts if they interrupt you — but do it before real
customer data exists. You will be holding other companies' commercial information, and each of
these accounts is a way in:

| Account | Why it matters | Priority |
|---|---|---|
| **GitHub** | Holds the code and the Supabase secrets | Highest |
| **Supabase** | Holds every company's data | High |
| **Vercel** | Someone could publish a fake version of the app at your own address | Worth doing |

Each takes about two minutes with an authenticator app on your phone. Save the recovery codes
each service gives you in the same place as your database password: without them, losing your
phone locks you out of your own system.

- [ ] Two-factor authentication on all three, recovery codes saved.

### B9c. Send invitations from your own email address

Skip this to finish setup, but do it before you invite more than one or two people. Until you
do, invitation and password-reset emails go through Supabase's own sender, which allows only a
handful of messages an hour ("email rate limit exceeded" on the invitation form) and often lands
in spam. Your own sender fixes both.

No paid mail product is needed. **A free Gmail account works**, and is what we use.

1. **Create an app password.** Not your normal Gmail password: a separate one that only this app
   uses, which you can revoke on its own.
   1. myaccount.google.com, signed in as the account invitations should come from.
   2. **Security** → **2-Step Verification**. Turn it on if it is off. App passwords do not exist
      without it.
   3. Open **myaccount.google.com/apppasswords** directly. (Searching "app passwords" in the
      account search box also works, but the link is more reliable.)
   4. Type a name, `CostMatrix`, and press **Create**.
   5. Google shows a 16-character password once, in four groups. Copy it. The spaces do not
      matter.
2. **Supabase dashboard** → your project → **Project Settings** → **Authentication** → scroll to
   **SMTP Settings** → turn on **Enable Custom SMTP**.
3. Fill in:

   | Field | Value |
   |---|---|
   | Sender email | the Gmail address |
   | Sender name | CostMatrix |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | the same Gmail address |
   | Password | the 16-character app password |

   Sender email and username must be the same Gmail address. Google rejects a mismatched sender.
4. **Save**. Supabase sends a test message. If it fails, the username or password is nearly
   always the cause, not the host.
5. **Authentication** → **Rate Limits**: set "Emails per hour" to `30`. A free Gmail account
   allows roughly 500 messages a day, so 30 an hour leaves plenty of room. This box only matters
   once your own sender is connected.
6. Check it: People → invite somebody → the email should arrive within a minute, from your Gmail
   address, and not in spam.

Two things to know. Invitations will show the Gmail address as the sender, which is fine for
your own team and testers but worth replacing with a `neiltd.com` sender before you invite other
companies. And this affects login and password-reset emails only: quotations are PDFs you
download and send yourself, so they are unaffected.

**If you would rather not use Gmail.** An existing `neiltd.com` mailbox is better, because
invitations then come from your own domain: ask whoever hosts that mail, or look in the hosting
control panel under "Email accounts", for the outgoing server name, port, username and password,
and put those in the same form. Brevo's free tier is the other option, 300 messages a day with
no card, and gives its own SMTP details after you verify a sender address.

The password stays in Supabase and your password manager. Never paste it into this chat, the
repository or a browser console; nobody, including me, needs to see it.

- [ ] Invitations arrive from your own sender, or noted for later.

### B10. Sign in

Open the Vercel URL. You should get the CostMatrix sign-in page, and your email and password
should take you to a home screen showing your name, your company and your three roles.

- [ ] You are signed in and can see the Home, People, Company and Companies pages.

### B11. Tell me you are done

Message me that the checklist is complete, and say which step gave trouble if any did. Include
the Vercel URL and, if you like, the Supabase project URL — both are public. **Do not send me
the service role key, the database password or the access token.** I never need them; the
automated job uses them from GitHub secrets without showing them to anyone.

---

## Part C — Day-to-day tasks

These describe the finished app. Some screens do not exist yet; each says which build slice
brings it.

### Set up a new company (sessions 5–6 review)
Master administrator, in this order; each step is a screen that already exists.
1. **Companies → Add company**: name, kind (external, buyer), currency code and printed label,
   exchange rate (KES per 1 unit), and its discount on master prices.
2. **People → Invite somebody**: choose the new company in the *Company* box, tick *Company
   admin*. They get an email to set a password.
3. Hand over. The new company admin then does, on their own screens: **Company** (margins,
   VAT, rounding, enclosure uplift, quotation prefix, address), **Rates** (hourly rates per kind
   of work, copper rate, any currency factor of their own), **Quotation wording** (letterhead,
   logos, terms, signatory), **People** (their engineers and approvers).
4. Their library: master parts and kits are already visible at their discount; private parts,
   kits and kit groups are theirs to add (Components, Kits, Kit groups, or Import).
You can read any company's costings, quotations, customers and enquiries (the lists gain a
*Company* column and filter for you) but cannot change them; that is by design.

### Invite a user
1. Sign in, open **People**.
2. Fill in the name, email and roles under "Invite somebody", then send.
3. They receive an email with a link to set their own password. Nobody can sign themselves up.
4. Check they appear in the list with the right roles ticked.

One email address is one login, and a login belongs to one company. Inviting an address that
already has a login is refused, and the screen now shows the reason ("already been registered"):
either use a different address, or move the person with **Move…** below.

"email rate limit exceeded" means Supabase's own sender has reached its hourly allowance, not
that anything is broken: nothing was created, so send the same invitation again later. Connecting
your own email sender (step B9c) removes the limit for good.

If the invitation fails for another reason, the invite-user function may not be deployed (step
B9). Authentication → Users in the Supabase dashboard shows whether the account was created.

Roles, as a reminder: **company admin** manages settings and users, **costing engineer** builds
costings, **approver** approves costings and releases quotations. One person can hold several.

### Someone leaves
**People** → **Deactivate** on their row. Do not delete: their name must stay attached to the
costings they built. Deactivating stops them signing in immediately.

### Somebody was invited by mistake (master administrator)
Only while they have done nothing at all. Their row then shows two more buttons.

- **Move…** puts them in another company, with the roles they were given. Use this when the
  right person was invited into the wrong company.
- **Remove** deletes their login for good, so the email address can be invited again.

Once they have built, approved or released anything the buttons disappear and the row says
*has records*: from then on **Deactivate** is the only option, because their name belongs on
that work. The database enforces this, not just the screen.

### Someone forgets a password
They click **Forgot password** on the sign-in page and get an email. If nothing arrives, send a
reset from Supabase → Authentication → Users.

### Change a company's discount (master admin only)
**Companies** → click the discount on that company's row → change it → Save.
Existing costings do not change: their prices were frozen when they were built. Only new
costings pick up the new discount. This is deliberate.

### Update prices from a supplier's price list (phase 2.2)

The way to re-price from a list the supplier sent you, in their format. **Price lists** in the
menu (administrators only).

1. **Price lists** → choose the file. CSV, Excel and PDF all work; a PDF is uploaded, its text is
   read, and the rows it found are shown — check for rows it missed, since a PDF is read line by
   line.
2. If you are the master administrator, tick **Price the master catalogue** for the shared
   catalogue, or leave it clear to price your own company's private parts.
3. Say which column is the **part number** and which is the **price**. The app guesses from the
   column names; correct it if the guess is wrong. Currency, make and description are optional.
4. Press **See what … rows would change**. Nothing has been saved at this point, and nothing will
   be until step 6.
5. Read the review:
   - **Price changes** — the part, how it was matched, the price it has now, the price the
     supplier asks, and the percentage. A part that had no price at all is marked *was unpriced*.
   - **Needs a person** — a reference the library does not have ("add the part first"), a
     reference two parts answer to, a busbar size (priced by weight, so change the copper rate
     instead), a cell that is not a price, or a currency with no landed factor.
   - A line saying how many rows already match the price you have.
6. Tick the rows you believe and **Accept … ticked**, or **Accept all**. Each accepted price is
   dated from the list, records the supplier as its source, and appears in that part's price
   history. **Discard this upload** throws the whole thing away and changes nothing.

Old costings never move: every price on a costing was frozen when the line was added.

### Update prices from a spreadsheet of our own (slice 1)
Prices are entered as the supplier charges them, in the supplier's currency (the *Purchase*
column); the app lands them in KES with the currency factors and shows *Your price*.
1. Library → Components → **Download Excel**.
2. Send the file to the supplier, or edit the price column yourself.
3. Library → Components → **Upload Excel**, choose the file.
4. Read the preview: how many rows are new, how many changed, and the old versus new price for each. Nothing has been saved yet.
5. Confirm. Every price change is recorded with your name and the time.

Uploads never delete anything. To remove a component, deactivate it on its own screen.

### Measure the parts, so the app can warn about space (F12)

Optional, and useful once you have a cubicle drawing to hand. Nothing breaks while parts are
unmeasured; the space line on a costing panel simply stays quiet.

**One part at a time:** Components → open a part → **Size and mounting…** → width, height and
depth in millimetres, what it mounts on, what it weighs, and the clearances the maker asks for
around it. For an enclosure cubicle the same panel also asks for the **usable area inside it**, the
busbar and cable chamber sizes, and the form it is built to.

**Many parts at once:** ask me to regenerate `data/seed/dimensions-template.csv` (it already lists
all 735 part numbers with their descriptions), fill in the columns you know in Excel, save as CSV,
then Import → **step 4, Dimensions**. It changes nothing but the measurements — never a price or a
category — blank rows count as "not done yet", and re-generating the file keeps what you typed.

**A kit's footprint:** Kits → open a kit → the three footprint boxes. Leave them blank unless the
kit takes more room than its main device and clearances, for instance accessories mounted beside it.

**What it buys you:** once the kits on a panel and the cubicles costed for it are both measured, the
panel shows one line — how full the board is, or that it will not fit with a suggestion to add a
cubicle. The figure includes a safety factor of 1.3 for wiring and access, which a company
administrator can change. It is a warning only: it changes no price, and the real arrangement comes
with the layout canvas later.

### Decide when a costing needs an approver (phase 2.5)

**Approval rules** in the menu (administrators only). Rules are read top to bottom and the first
one whose conditions **all** hold decides what happens when a costing is submitted.

Every company starts with one rule, *Always require an approver*, which is what the app did before
rules existed. Leave it alone and nothing changes.

A rule can test the job total, either margin, the profit margin, whether anything on it has no
price, how many such parts there are, how old the prices are, and the revision number. It can then:

| Outcome | What happens |
|---|---|
| Approve it automatically | Submitting approves it; nobody is asked. The history records which rule did it, and no name goes in the approver's place, because no person approved it. |
| An approver must approve it | What happens today. |
| Only the master administrator may approve it | For the largest jobs. Note this means a master administrator **of your own company**; for another company's costing nobody can satisfy it, because the master administrator's access there is read-only. |
| It cannot be submitted at all | The engineer is told which rule stopped it, and fixes the costing. |

Put the narrow rules first: a rule that blocks unpriced parts is useless below one that approves
everything small. Each costing shows an **Approval** card saying which rule decided and, when you
have written rules of your own, every rule with the figures it looked at.

### When a quotation runs out (phase 2.6)

Each quotation carries a validity date, set when it was released from your company's validity days.
The app checks every night: one whose date has passed while it was still released or sent is marked
as run out, and if it had actually been **sent** to the customer a follow-up is raised for somebody
to chase it. The status does not change — an expired quotation can still be won.

- The **Quotations** screen shows *Valid for 20 more days*, *Runs out today* or *Ran out 3 days ago*
  under each one, and has a **Check what has run out** button for anybody who does not want to wait
  for the night.
- To quote the same job again at current prices: open the approved costing and press **Re-issue at
  today's prices**. That makes a new revision with every line priced again — what could not be
  re-priced is named — and leaves the approved revision exactly as it was agreed. Check it, submit,
  approve and release as usual.

### Change your own company's margins, VAT or currency
**Company** → change the fields → Save. The screen shows the markup each margin implies, since
margins are a share of the selling price rather than of cost.

### Cost a panel from kits (session 3)
Costings → open a draft → in a panel: **Kit group → rating → kit → quantity → Add kit**. The kit
arrives with its lines priced today and its hours from the kit group (or its own). A kit with an
unpriced part is greyed out with "unpriced part": price the part on the Components screen first.
Under the kits, *Outside a kit* adds a catalogue component on its own (type to search; cubicles
are uplifted) or a **typed line** with its own price for a part the catalogue does not hold.
Loose lines gather in one *Components and enclosure* line per section. The screen reads straight
down: the **Totals** card at the top (it shows the material split by category, which is what the
old sheets subtotalled), then the panels, then the bills of materials, then the history.

### Build a panel in sections
Above the pickers is **Add to section**. Choose one of the offered names — Incomer, AVR bypass,
ATS, 2nd incomer, Outgoers, Accessories, APFC bank — or type your own, and everything you add
next goes there; leave it empty and the lines sit in no section, as they always did. The panel
then reads section by section, each with its own material and labour subtotal. A kit put in the
wrong place is moved with the small box beside its name.

Sections change no price: they are how a panel is read. Two things follow them, though — the
loose parts of each section gather in that section's own *components and enclosure* line, and
**Draft from the kits** writes the technical description under the section headings. The bills
of materials stay grouped by category, which is what they are bought by.

### Copy a costing, or one panel, for a similar job
On **Costings**, the **Copy** button at the end of a row starts a new job from that one: give it
a title, point it at an enquiry if you have one, and press *Copy at today's prices*. You get a new
costing number, revision 0, a draft — and the costing you copied is left exactly as it was.

**A copy is priced again from scratch.** Every catalogue line takes today's purchase price,
landed factor and copper rate, and your company's settings as they are now. That is the point:
a job quoted last year at last year's copper price would be quoted wrong. A line you typed in
keeps the price you typed, because nothing else knows what it cost. If a part has since left the
catalogue or lost its price, the line comes across at its **old** price and the screen lists it —
check those before quoting.

Inside a costing, **Copy this panel** at the bottom of a panel does the same for one panel: into
the same costing (a second, near-identical board) or into another of your open drafts.

A copy is not a revision. A revision is another version of the *same* job, keeps the number and
supersedes the one before it; a copy is a *different* job that happens to start from this one.

### Write the technical offer from the kits (session 4)
In a panel → *Details* → **Draft from the kits**: the technical description is written from
the panel's kits under their section headings (a kit in no section falls back to its kit group),
each with its lines, then the loose components and the enclosure. Edit it freely; the quotation prints what you leave. A panel whose description is
left blank gets the same draft at release, so Annexure IV is never empty for a costed panel.

### Start a costing from somebody else's parts list (phase 2.3)

When a consultant sends a schedule, a customer attaches their own list, or you have an EPLAN
export: **Costings** → open a draft costing → **Import a parts list** → *Import a file…*

1. Choose the CSV or Excel file. Say which column holds the **part number**; the app guesses from
   the column names. A missing quantity column means one of each.
2. **Match … rows.** Nothing is added to the costing yet.
3. Read the review. Each row offers a choice, already set to what the app thinks:
   - **Kit** — the row named a device that is a kit's main device, so the kit is offered first.
     That is usually what you want: the kit carries the busbar, cable, accessories and labour that
     the bare device does not.
   - **Part on its own** — for a part no kit is built around, or when you want just the device.
   - **Placeholder** — for a part number nobody has. It is added to your company's library with no
     price; it does **not** go on the costing, because an unpriced part cannot be costed. Price it
     on the Components screen, then add it. Only an administrator can do this.
   - **Leave this row out.**
4. Set the quantities if the file's are wrong, name the new panel, and **Bring in …**.

What comes in lands on a panel of its own, priced by the engine exactly as hand-added lines are,
and every line records that it came from that file. Rows the app could not read at all — no part
number, a quantity like "as required" — are listed with the reason and brought in by nobody.

### Add a part that is not in the catalogue (session 3)
In the panel, *Outside a kit → typed in with a price*: name, category, price each in your
currency, quantity. It lives in that costing only. When you know its purchase price, add it to
the catalogue so the next costing can pick it.

### Import the seed (session 2)
Import (in the top bar; administrators only). First download the five files from GitHub:
open the repository's `data/seed` folder on `main`, open each file and press its download button
("Download raw file"). Three steps, in order, each fed by those files exactly as they are: **1 Components** — `components.csv`
plus `category-map.csv` (the second file tells the importer which of the four BOM categories
each catalogue category belongs to; a `BOM category:` note on a single row overrides it).
Busbar rows become weight-priced parts: kg per metre = catalogue EUR ÷ the copper rate (15 EUR
per kg), and the preview says how many were derived. **2 Kits and kit groups** — `kits.csv` plus
`kit-labour-template.csv` (the second file gives each kit its labour group and main device, and
any hours filled in for a single kit become that kit's own hours). **3 Kit group hours** —
`kit-group-labour-template.csv` once you have filled the three hours columns; blank cells are
skipped and counted. Choose the file(s) → **Preview** shows how many rows are new, changed,
unchanged and rejected, with the reason for every rejection → **Apply** saves. Nothing is ever
deleted, and a second import of the same files changes nothing. Expected on the first import:
735 parts (7 placeholders without a price, plus one part whose price is blank in the export),
296 kits in 17 groups with 720 lines. Placeholders show "no price" on the Components screen, and
a kit that holds one cannot be added to a costing until you give it a purchase price. The master
admin imports the master library; a company admin imports private parts and kits for their company.

### Change a currency's landed factor (session 1)
Rates → Currency factors. Each currency shows one figure: KES per 1 unit **landed**, with the
exchange rate, freight, duty and handling in it (200 per EUR today). **Change** writes your
company's own figure; the master admin ticks *master* to change the default for everyone, and may
add a new currency at the bottom of the table. A purchase price in a currency with no row cannot
be saved. New costings use the new figure; existing ones keep what they froze.

### Read the APFC bank size (session 3)
A panel built from kVAr step kits (the APFC group, chosen by rating × quantity) shows a line
under its kit table: "APFC bank: 400 kVAr in steps". Change the quantities and it follows.

### Set the enclosure uplift (session 1)
Company → Enclosure uplift %. Added to catalogue cubicle prices (components ticked *enclosure
cubicle*) when they enter a costing, and frozen there.

### Set kit group hours (session 1)
Kits → kit group (link in the intro) → type the hours per kind of work in each group's row;
they save when you leave the cell. A kit with its own figure for one kind of work keeps it; blank
on the kit means the group's hours apply. On a kit: choose its group, rating and poles under
the title, and tick the radio button of the line that is its main device.

### Change the copper rate (slice 1)
Rates → Material rates → **Change** on Copper busbar → type the rate per kilogram → Save. The
master figure is in **EUR per kg (15)** and lands through the EUR factor; the *Lands at* column
shows the KES per kg (3,000). A company's own figure is in its own currency. New costings use it; existing
ones keep the rate they froze.

### Set up the quotation letterhead and wording
**Quotation wording** (company admin). Upload the header logo, add the footer marks one by one,
fill in the address lines, the standard opening and closing, the signatory, and the five terms.
Every new quotation starts from these; the approver can still change the wording on each one.

### Release a quotation
Open an approved costing → **Release quotation** (approvers only). Check the customer name and
the wording, click **Preview PDF** to see it, then **Release**. The PDF is stored and the
reference number issued in one step. If anything fails, nothing is released — try again.

Once released, nothing on it changes. To alter a quoted job, create a new revision of the
costing; releasing that gives the same number with the next REV.

### Log a customer and an enquiry
**Customers** → **Add customer**, then on the customer's page add the people and projects.
**Enquiries** → **Log enquiry** → choose the customer (and contact or project if you like),
give it a short title. It gets a number, EN-2026-0001. Create the costing from the Enquiries
screen's **Costings** button, or pick the enquiry on the new-costing form.

When the quotation is marked sent, the enquiry becomes *quoted* on its own; won or lost follow
too. You can also set the status by hand on the Enquiries screen.

### Chase a quotation
**Quotations** → **Follow up** on a sent quotation → pick a date and say what to do. It appears
on **Follow-ups**, overdue ones first. Mark it **Done** when done.

### Export a bill of materials
Open any costing → **Bills of materials**, below the panels. One line per category with the
material value; **Excel** or **CSV** per category, or **All four as one workbook**. Quantities
are already multiplied through assembly and panel quantities, so the figure is what to buy.
Works on a draft too, which is handy for checking a costing before submitting it.

### Keep the drawing and the specification with the enquiry
**Enquiries** → click the enquiry number. The enquiry's own page shows what was asked for, the
costings raised against it, the quotations released, and **Files**: type what the file is, then
choose it, and it is uploaded. Up to 20 MB each, any kind — drawings, PDFs, spreadsheets, saved
emails. Only your company can open them; the link a click produces lasts a few minutes, so send
people the file rather than the link. *Remove* deletes the record and the file itself.

### Record the outcome of a job
**Quotations** → **Mark sent** when a quotation goes to the customer. When you hear back, press
**Won or lost?** on the job (or on the row in **Enquiries**) and decide the whole enquiry at once:

- **Won** asks which quotation won it. That one is marked won; every other offer still on the
  table against the same enquiry is marked **superseded** — they were never turned down, they
  are simply no longer live.
- **Lost** asks why, and every offer still on the table takes that reason. It is what the sales
  reports are built on later, so make it honest.

The quotations screen reads one job as one job: the enquiry at the top, each offer under it, and
the earlier revisions of an offer folded behind the newest — press *2 earlier revisions* to see
them. A quotation whose costing was raised without an enquiry has nowhere to record won or lost;
link its costing to an enquiry if you need to.

### Find out what happened to a costing (slice 1)
Open the costing and scroll to **History** at the bottom. Every submission, approval, return,
revision and release is listed with the name of the person who did it and when. The log cannot be
edited by anyone, including you. A person removed since then leaves their entry behind, reading
*Someone no longer here*: the record of what happened never goes with them.

### Check the app is running
Open the Vercel URL. If the page loads and you can sign in, everything is working. For more
detail: Vercel dashboard shows deployments; Supabase dashboard shows database health.

### Download a backup (see Part E)
Supabase dashboard → Database → Backups. Or fetch the weekly off-site dump from where the
backup job stores it.

---

## Part D — When something goes wrong

### The page is blank or shows an error
A screen that hits an error now says so in a box ("This screen hit an error and stopped
drawing") with the message and links home; the navigation keeps working. Copy the message
and tell the administrator what you had just done. A fully white page with nothing on it is
usually a bad deployment instead: Vercel dashboard → Deployments → the most recent one → check
it says Ready. If it failed, the log says why. You can click **Rollback** on the previous
working deployment to get back online immediately, then we fix the cause.

### A user cannot sign in
- Is the account active? Admin → Users.
- Did they ever set a password? If the invitation expired, resend it.
- Check Supabase → Authentication → Users to see whether the account exists at all.

### A user says "you do not have permission"
They are missing a role. Admin → Users → tick the role they need. Note that only an **approver**
can approve a costing or release a quotation; that restriction is deliberate and enforced by the
database, so it cannot be worked around from the screen.

### A user sees no data at all
They are probably attached to the wrong company. Admin → Users → check the company. A user
belongs to exactly one company and sees only its data.

### An old quotation shows a price that is no longer current
**This is correct, not a bug.** Prices, discounts, exchange rates, hours and margins are frozen
into a costing when it is built, so an approved costing and its PDF never change under you.
To re-price, open the costing and create a new revision, which starts from current prices.

### The site is down
Check status.supabase.com and vercel-status.com. If both are healthy, the problem is ours;
tell me what the page shows. Your data is unaffected by a hosting outage.

### You think data has been lost
Stop. Do not try to fix it by re-entering data. Tell me immediately and note the time. The
database keeps daily backups (paid tier) and we hold a weekly off-site dump; the sooner we
look, the more precisely we can restore.

---

## Part E — Backups and data protection

### What each tier gives you

**Free tier** — fine for building, not for real quotations. No automatic daily backups, and the
project pauses if unused for a week. Use it until real customer data exists.

**Paid tier** — daily backups kept for a week, and point-in-time recovery, which restores the
database to any moment (for example, five minutes before a mistake). Check Supabase's pricing
page for the current cost; it changes.

**Switch to the paid tier before the first real quotation is released.** That is the moment
data becomes irreplaceable. Note it in your calendar now.

### The three layers

1. **Supabase daily backups and point-in-time recovery** — automatic, once on the paid tier.
2. **A weekly off-site dump** — an automated job in GitHub takes a full copy of the database and stores it away from Supabase, so a problem with the Supabase account itself does not take the backups with it. Kept for twelve weeks. It emails you if it fails.
3. **Quotation PDFs** — stored in Supabase and included in the weekly dump. They can also be regenerated from the costing data.

### The restore drill

A backup you have never restored is not a backup. Once before go-live, and once a quarter
after, do this and write the date in `docs/decisions.md`:

1. Take the most recent weekly dump.
2. Create a fresh empty Supabase project (free tier is fine for the drill).
3. Restore the dump into it.
4. Sign in and open a costing. Check the totals match.
5. Delete the drill project.

If any step fails, the backup process is broken and fixing it is the most urgent thing on the
list.

### Data protection promise to other companies

CostMatrix holds data for companies other than your own, so the app carries a short terms page
stating: what is stored, that it is held in Ireland, that no company can see another company's
data, and that a company's data is deleted on request. Keep that promise literally: the
database enforces the isolation, and the master admin has read-only access to company data for
support, with no ability to change it.

---

## Part F — Words explained

| Word | Meaning here |
|---|---|
| **Repository** (repo) | The folder of code and documents stored on GitHub. |
| **Branch** | A parallel copy of the repository where work happens before it is accepted into the main version. |
| **Commit** | One saved change, with a message saying what it was and who made it. |
| **Main** | The trunk of the repository: the current agreed version. |
| **Migration** | One numbered file of database instructions ("add this table"). Running them in order builds the database from nothing, so it can always be rebuilt. |
| **Environment variable** | A setting given to the app from outside the code, such as which Supabase project to talk to. Lets the same code run against a test database or the real one. |
| **Key** | A long string that identifies or authorises a caller. The publishable key is public; the secret key is not. |
| **Row-level security** (RLS) | Rules inside Postgres saying which rows each signed-in user may see. This is what keeps companies apart. |
| **Tenant** | One company using the app, with its own walled-off data. |
| **Deploy** | To publish a new version of the web pages so users get it. |
| **Slice** | One complete workflow built end to end, from database to screen. See `build-plan.md`. |
