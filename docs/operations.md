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

### Finding your way around

The links are down the **left-hand side** now, in six named groups, rather than in one long bar
across the top. What you see depends on your roles and on which features your company has switched
on, so a shorter list is not a fault.

| Group | What is in it |
|---|---|
| **Overview** | Home |
| **1 · Enquiry to quote** | Customers · Enquiries · Costings · Quotations · Follow-ups |
| **2 · Library** | Components · Kits · Library health · Library set-up |
| **3 · Insight** | Sales · Labour variance |
| **Settings** | Settings · People |
| **Help** | Help |

A number beside a link means something is waiting for a person; an **orange** one means it is late.

Two of those links open a page with a column of tabs down its left. Nothing moved address — every
link you have bookmarked still works and simply lands on the right tab.

| Was its own link | Now |
|---|---|
| Company | **Settings → Company details** |
| Quotation wording | **Settings → Quotation wording** |
| Approval rules | **Settings → Approval rules** |
| Compatibility rules | **Settings → Compatibility rules** |
| Features | **Settings → Features** |
| Assistant | **Settings → Assistant** |
| What broke | **Settings → What broke** |
| Companies (master administrator) | **Settings → Companies** |
| Rates | **Library set-up → Rates & currency factors** |
| Kit groups | **Library set-up → Kit groups & labour hours** |
| Price lists | **Library set-up → Price lists** |
| Import | **Library set-up → Import** |

Your name, your company and your roles are at the **bottom of the sidebar**. Two cards that used to
be on the home page have gone: *How your company is set up* is now Settings → Company details, and
*Your roles* is that block at the bottom of the sidebar.

On a narrow screen — a phone, or a small laptop window — the sidebar becomes a row of links along
the **bottom** instead.

### A costing, tab by tab

Opening a costing now shows its **panels as tabs** down the left, each with what that panel comes to,
and the totals underneath them where they stay in view while you work. Under *Whole costing* are the
things that belong to the costing rather than to one panel: **All panels side by side** (the grid),
**Margins & rounding**, **Documents & imports**, **Hours actually taken**, **Assistant**,
**Exports** (the four bills of materials, and the drawing office's files) and **Approval & history**.

Across the top are four steps — Draft → Submitted → Approved → Quotation released — with the one it
is at now in orange. That is the quickest way to see where somebody else's costing has got to.

**All panels side by side** puts every panel in a column and every kit in a row. While the costing is
a draft you can change a panel's own details straight from the top of its column: its **name**, how
many of it, its **tag**, its **option** label, and the **extra** tick that prices a panel and prints
it but leaves it out of the total. Type and press Enter, or click away — the same as every other box
in the app. A name typed blank is ignored rather than saved, so a column can never lose its name, and
a quantity must be more than nought.

Three of a panel's fields are still only on the panel's own tab, because they need room to read: the
unit, the enclosure dimensions and the technical description that prints on the quotation.

The **×** beside a panel's name removes that panel. It asks first, and the question names the panel,
says how many kits are on it and what it is worth — read it before you say yes, because **a removed
panel does not come back**. The same question is now asked by **Remove panel** on the panel's own
tab, which until today deleted on one click without asking anything.

With several panels open the grid scrolls inside its own box: the **panel names stay across the top**
and the **kit names stay down the left** while the figures move under them.

**Show** is a row of buttons, one per panel. Press the ones you want to look at and the rest leave the
table, so the columns you are comparing sit next to each other. Press two or more and every row where
they do not all agree is marked in amber — a panel that does not have a row at all counts as nought,
which is usually the fault you are looking for. Press a panel again to drop it, or **All** to go back
to the whole costing.

Two things always cover **every** panel, whichever are shown: the last column, which reads *All 5
panels*, and the **Excel** file. A spreadsheet that quietly left panels out would be worse than none.

### What is on your desk (home page)
Signing in already shows your follow-ups. With **What is on your desk** switched on, a card above
them lists the work waiting on **you**, and nothing else:

- **Sent back to you** — a costing you submitted that an approver returned, with the comment they
  left. It is a draft again, so nothing else in the app will ever mention it: this card is the only
  reminder.
- **Waiting for you to approve** — shown only if you are an approver. A costing engineer is not
  shown a queue they cannot clear.
- **Released, never sent** — the PDF exists and the customer has not been told. Mark the quotation
  **sent** once you have sent it and the line goes.
- **Sent, still no answer** — neither won nor lost. Not a fault; the oldest is simply the one worth
  asking about.

Each line says how long it has sat there, oldest first, and links to the thing itself. **Nothing on
it can be ticked off**, on purpose: every line is cleared by doing the work — fixing the costing,
approving it, marking the quotation sent, recording the answer. And when there is nothing waiting
the card is not there at all, rather than telling you so.

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

### What broke — the error reports

**Administrators → What broke.** Screens that failed in the last 30 days, recorded by the app
itself when they failed. Nobody has to send you anything, which matters because most people
never do.

Two kinds of row:

- **The screen stopped drawing** — the app hit an error mid-render and showed the person a
  message instead of the screen. This is what the blank Components page was on 9 September.
- **Something would not load** — a query came back with an error and the screen showed a red
  line. More common, and until now completely invisible to you.

Each row is one *fault*, not one occurrence: the same failure, on the same screen, for the same
person is counted rather than repeated, so *"4 times"* tells you it is still happening. You see
your own company's; as master administrator you see every company's, with the company named.

**Nothing appears here when nothing is wrong**, which is the usual state and reads as such.

Rows delete themselves after ninety days — swept by the next report rather than by a scheduled
job, so there is nothing to maintain. What is kept is on the terms page: the message, the route,
who was signed in and which browser. A message can quote the value that caused the failure, so it
is not treated as harmless; it is simply not kept long.

If you want something done about one, send me its wording and what the person was doing.
### The guide people actually read — Help

**Help**, in the top bar, for everybody who can sign in. One page each for the costing engineer,
the approver and the administrator, and one everybody gets: *things that look like faults and are
not* — the old quotation showing old prices, the colleague who has left still being named, and a
screen that broke having already told you.

It opens on the guide for that person's roles. Somebody nobody has given a role to yet sees all of
it rather than an empty page, which is what an invited person meets on their first morning.

This document is the reference and is written for you. The Help screen is the one to point a new
engineer at; it is one screenful, and it is in the app, because a guide nobody can find is a guide
nobody reads. **Its wording is yours** — say what you want changed and it is one small pull
request; the text lives in one file (`web/src/modules/help/guides.ts`).

### What CostMatrix stores — the terms page

`/terms`, linked from **What CostMatrix stores** at the bottom of every screen and from the
sign-in page. It is readable **without signing in**, deliberately: somebody deciding whether to
accept an invitation has to be able to read it first, so you can send the link to a company you
are about to invite.

It says, in plain words, what is stored, that it is held in Ireland, that no company can see
another company's data, and that a company's data is deleted on request. It also says the two
things people mistake for faults: an old quotation shows the prices it was actually sent with,
and somebody who leaves is deactivated rather than erased, because their name is in the history
of costings they worked on.

**The wording is yours.** It describes what the app does and is not a lawyer's document. It
claims no retention period, because none has been decided. To change any of it, say what you
want it to say and it is one small pull request — the text lives in one file
(`web/src/modules/legal/terms.ts`), apart from the page that draws it.

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

### Record the hours a job actually took, and fix the standards (phase 2.8)

**On the costing, under “Hours actually worked”.** Press *Show*. The table compares what the costing
was priced on, panel by panel and process by process, with what the shop floor took. To file hours:
choose the panel, choose the process, type the hours, add a note such as *week 32* if you like, and
press *Record these hours*. Hours can be filed a week at a time — they are added up — and a wrong
entry is corrected by pressing *Remove* beside it in the list underneath.

This works on an approved costing, which is the point: the boards are built after the quotation goes
out. **Recording hours changes no price, no total and no quotation.** A costing keeps the hours it
was priced on, for ever.

**Then, once a few jobs have hours against them: Labour variance** (administrators' menu). One row
per kit group and process type: the standard in force, what the jobs actually took per kit, whether
that is longer or quicker, and how much it rests on — *1 job, 6 kits — too little to change a
standard on*, up to *6 jobs, 40 kits — enough to take seriously*. The rows with the most hours at
stake come first, not the biggest percentages.

Read the sample size before you act. A board's hours are shared across its kits in proportion to what
they were costed at, because the shop records hours per board rather than per kit, so one unusual job
can move a figure.

**Hours the report cannot place.** Under the table a card may appear, *Hours no kit group can be
blamed for*. Those hours were worked on a board the costing gave no hours of that kind — usually a
board of loose parts, or one built from a kit whose group still has blank standard hours. They are
in none of the figures above, which is exactly why they are listed rather than dropped: fill the
group's hours in under *Set kit group hours* and they join the report.

**Nothing changes a standard until you press *Apply*.** That sets the kit group's hours for that
process to the suggested figure; you are asked to confirm, and the confirmation says the part that
matters — new costings use the new figure, and existing costings keep the hours they froze. A master
group can only be changed by the master administrator; your own company's groups, by your company
administrator.

### Read the sales reports (phase 3.6)

**Sales**, in the main menu. Everything on it comes from decisions already recorded on enquiries —
nothing on this screen changes anything, and values are always ex-VAT.

It leads with the **hit rate**: jobs won as a share of jobs *decided*. Jobs still open are not
counted as losses, and the figure always says what it rests on — *1 of 2 decided* — because a
100 % hit rate on one job is not a fact about the business. Beside it: what was won and lost in
money, the **share by value** (one large job outweighs three small ones), and the average days a
customer takes to decide.

- **Still out there** — every open and quoted enquiry with its value, how long it has been waiting,
  the offer it is waiting on and how many days that offer has left. An offer past its date says
  *ran out*.
- **By customer, by value, by month** — the same hit rate cut three ways, busiest first.
- **By product group** — by kit group, so you can see which families you win, with the material and
  hours at stake in each.
- **Why jobs were lost** — the reasons as they were typed when the enquiry was marked lost,
  commonest first. This is the one report that is only as good as what gets typed: a reason left
  blank shows as *no reason recorded*.
- **Margin quoted, margin achieved** — the same sum with the hours the shop recorded in place of the
  estimate. A job appears here **only once hours have been recorded against it** (under *Hours
  actually worked* on the costing), and **Measured** says how much of its labour is fact rather than
  estimate. Read a row with one eye on that column.

To change the value bands, a company administrator edits `analytics_value_bands` in the company
options — the default is 500 K / 2 M / 10 M.

### Configure a standard board from the questions (phase 3.1)

On a panel, **Configure this board**. Answer what the board is, in the order a customer describes it:

1. **Fed from** — grid, generator, solar. Two or more supplies let you choose a changeover.
2. **Incomer** — the rating in amps, and whether it is an ACB, an MCCB or a switch disconnector.
3. **Changeover** — automatic (ATS), manual, a changeover switch, or synchronised in parallel.
4. **Outgoing ways** — a line per rating: amps × how many, MCCB or MCB. *+ another rating* adds a line.
5. **Correction and metering** — kVAr of power-factor correction, and whether the board is metered.
6. **Enclosure** — form, IP, access, cable entry. These are **recorded on the panel and printed with
   it**; the cubicles are still costed as catalogue cubicles plus your uplift, as they always were.

Then **Work the board out**. You get the kits it proposes, grouped into the panel's sections, each
with the answer that put it there — *12 ways at 100 A* — and a quantity you can change. Two things
it tells you rather than hiding:

- a kit **bigger than what you asked for**, when the library has nothing nearer, marked on the line;
- anything it **could not answer** — a kind of kit you do not stock, or one whose every version holds
  a part with no price — named with the reason.

Nothing is added until you press **Add … to this panel**. What is added is what is on the screen, and
each kit is priced and frozen exactly as if you had picked it from the kit picker yourself. A panel
that already has kits is added to, never cleared.

A non-standard board is still built kit by kit, as before. The correction is worked out by the same
APFC grader as the *Work out an APFC bank* button, so both give the same answer.

### Read a costing as a grid (phase 2.9)

At the top of a costing, two buttons: **Panel by panel** and **Grid**. The grid shows the whole
costing as one table — every panel a column, every kit and loose component any of them uses a row —
and it remembers which one you last used, on your own computer.

- **Type in a cell** to change a quantity. A blank cell means that panel does not use the row; type a
  figure into it and the kit is added to that panel. Clear a cell and the line is removed. Prices
  freeze and the history records it exactly as on a panel card — it is the same edit, made in a
  different place.
- **Two cells the grid will not guess at**, and says so instead: a row the panel holds on more than
  one line (two sections, for instance), and a typed-in lump sum on a panel that does not have it.
  Both are done on the panel card.
- **Compare** two columns with the two pickers: the rows that differ — including a blank against a
  figure — are marked in amber and counted.
- **+** at the bottom of a column opens the usual kit picker for that panel; **Copy panel…** makes a
  near-identical column, re-priced as a copy always is; **Add panel** adds an empty one.
- **Red marks** mean something to look at: a row whose part the library no longer prices, and a panel
  whose space check (F12) says it is tight or will not fit. Hover for the reason.
- **Excel** downloads what is on screen — the sections, the columns and the totals — with a second
  sheet of what each panel costs and sells for.

The grid is read-only once the costing is submitted or approved, exactly as the panel cards are.
Prices, margins and panel parameters are not edited here; that stays on the panel card.

### Offer one job two ways, and quote an extra separately (phase 2.7)

Two different things, and the app keeps them apart.

**Two alternatives the customer picks one of** — the ACB board or the MCCB board, Option 1 or
Option 2 in the old workbook. In each panel → *Details* → **Option**, type the same label on every
panel belonging to that option, e.g. `Option 1`. A panel you leave blank is common to both, and is
counted whichever option is taken. The **Totals** card then shows a *Per option* table, and the
quotation prints a price schedule per option exactly as the NPP-192 quotation did.

Then, under that table, **Offered as**: choose the option the job's own total should mean. Until you
choose, the grand total is the two offers added together — which is not the price of anything — and
the card says so. Choosing Option 2 makes the total the common panels plus Option 2; Option 1's
panels stay on the quotation, stay priced, and are marked *not the chosen option* on the screen.
The BOM total follows the same choice, so what it says to buy is the board you are building.

**An extra the customer may take or leave** — a spare feeder, a second set of keys. Tick
**Optional extra** in that panel's *Details*. It is priced like any other panel and printed on the
quotation, but it is left out of the total; the Totals card shows it as *Optional extras, if the
customer takes them*, and the quotation prints it in its own table under the schedule it belongs
to, headed "not included in the total above". On the bill of materials it keeps its row, with an
**Optional** column marking it and a separate OPTIONAL EXTRAS line under the total, so the buyer
can see what is only bought if the customer says yes.

Both travel: a revision and a copy keep the option labels, the extras and which option the job is
offered as.

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

### See what the library is missing (Library health)
**Library health** in the top bar, for administrators, once the switch is on. It reads the library
as it stands now — not the notes in `data/seed/README.md`, which were written on the day the seed
was built and say nothing about what you have fixed since — and it sorts every fault by what it
does to a costing:

- **Stops a costing.** A part with no price, or a kit holding one. The costing refuses it and names
  the part, so nothing is lost; the work simply stops until you set a price. Also here: a part
  priced in a currency whose **landed factor** somebody has removed. Its price looks fine on the
  Components screen and the costing still refuses it, which is the most confusing of the three, so
  it is told apart and sends you to Rates → Currency factors rather than to the part.
- **Costs, and leaves something out.** Worse, because nothing complains. A kit in no kit group, or
  one whose group has no hours, is costed with its material right and **no labour at all** — and
  the quotation can be released and sent like that. Fixing it is the three hours columns on
  **Kit groups**, or the `kit-group-labour-template.csv` import.
- **Worth a look.** A kit with only its main device and no busbar, cable or accessories; a kit with
  no rating, which is how kits are found. Neither is necessarily wrong — a supply-only kit really
  has no connection material — which is why they are not mixed in with the first two.

Each row says how many there are, three or four examples, and the screen that puts it right;
**List them** shows the lot. A part is listed with how many kits hold it, so the one that breaks
the most costings is at the top. **The screen changes nothing.** It reads, and it never refuses.

On the seed as imported it opens on eight parts waiting for a price (held by fifteen kit lines),
thirteen kits that would be refused because of them, three kits in no group at all, one kit with
only its main device — and almost every kit with no hours, which is the labour template.

### Change a currency's landed factor (session 1)
Rates → Currency factors. Each currency shows one figure: KES per 1 unit **landed**, with the
exchange rate, freight, duty and handling in it (200 per EUR today). Beside it, **Bought in it**
says how many parts are purchased in that currency — the size of what your change moves. The
material rates table has the same column, **Prices**: the copper rate carries eleven parts, which
is the whole busbar catalogue. **Change** writes your
company's own figure; the master admin ticks *master* to change the default for everyone, and may
add a new currency at the bottom of the table. A purchase price in a currency with no row cannot
be saved. New costings use the new figure; existing ones keep what they froze.

### If the app refuses to remove a rate or a kit group
Three things cannot be deleted while something still rests on them, and the message says what and
what to do first:

- a **kit group** that kits are still in — move them to another group first. Without this guard the
  kits would simply fall out of the group and cost **zero labour**, with nothing said.
- the **master landed factor** for a currency parts are still bought in — reprice them in another
  currency first. Without it their price cannot be worked out at all, while the purchase price goes
  on showing on the Components screen.
- a **master material rate** that weight-priced parts still use — give them a fixed price first.
  The copper rate is the one that matters: it prices the whole busbar catalogue.

Your **own** currency factor or material rate can always be removed: the master row catches the
parts, so nothing is orphaned. And a rate or group nothing depends on goes without argument — the
guard refuses a fault, not a delete.

### Work out an APFC bank from a target (phase 3.2)
In a draft costing, on the panel: **Work out an APFC bank**. Type the target in kVAr, choose
fuse-protected or breaker-protected steps (or leave it to pick), and press *Work it out*. You get
the steps it proposes — for 400 kVAr, the bank you built on NPP-192: 50×4, 25×4, 12.5×6, 5×5 —
with the quantities editable. Change any of them; the total follows. **Add** puts them on the
panel as ordinary kit lines in an *APFC bank* section, priced and frozen like any other kit.

If the sizes in your library cannot reach the target exactly, the card says how far short it is
rather than quietly rounding. And if you ask for breaker-protected steps today it will tell you
that every one of those kits still holds a part with no price — those are the eight parts on the
Components screen waiting for you.

The grading — how much of the target goes into the biggest step, how much into the next — is a
company setting, so it can be changed without a new version of the app. Ask and I will change it.

### Lay a panel out (phase 3.8)
On a panel in a draft costing: **Lay this panel out**. A pop-up opens with three columns — the
kits on the panel, the board drawn at 1 : 4, and whether it fits.

**Work the board out** arranges the kits by the rules of their mounting designs: a busbar-fed
device takes a section of its own; MCCB covers stack down a device compartment until it is full and
then a second section opens; the modular devices and the correction each get a section. Every
section says which rule made it — open *Why each section is there*.

Then correct it: **drag a kit** from the left onto a section, **double-click** one on the drawing to
take it off. A drop onto a section built for another design is refused in words, and so is one that
does not fit what is left.

- **Save layout** keeps the drawing as the next version and **moves no price**. Earlier versions
  are kept, so you can go back.
- **Put these cubicles on the costing** takes the widths the drawing needs and adds them as
  enclosure lines in an *Enclosure* section — ordinary component lines, priced and frozen. A width
  the catalogue has no cubicle for is named rather than quietly dropped. Pressing it twice is
  refused; *Replace the ones already there* is the deliberate second pass.

**Two things it tells you honestly.** A kit the library has not described — no mounting design, or
no module height — is shown in amber, cannot be dragged, and makes its section read *unknown*
rather than *fits*. And the usable height of a device compartment is **assumed at 1,500 mm** until
somebody reads it off the S4 dimension drawings; it is a company setting, so correcting it is a
number rather than a new version of the app.

#### The other four views
Above the drawing: **Front · Rear · Plan · Door · 3D**.

- **Rear** is the back of the board, with the sections **mirrored** — the order you see them in
  walking round it. A rear-connection section shows its cable lugs and the cables behind the plates;
  a front-connection one shows only the shrouded backs of its terminals. On a **double-front**
  section the back is a device compartment of its own, and this view is an editor too: drag kits onto
  face B. Dropping onto the back of a one-face section tells you to turn two faces on first.
- **Plan** looks down on **one** section — the one you last clicked — because depth belongs to a
  section rather than to the board. It draws the vertical busbar on its side, the mounting plate, the
  cable alley and the door's swing, with the width and depth dimensioned.
- **Door** draws the doors with the parts mounted on them. What counts as door-mounted is the
  component's own **Mounting: door** on the Components screen, never a guess from its name. A
  door-mounted part with no width and height on record is listed under the drawing instead of being
  drawn at an invented size.
- **3D** is an isometric picture for the customer, seen from the left or the right — press *Seen
  from the left* to turn it round. Turn the **Doors** layer off to show the covers and devices
  inside. It is a fixed viewpoint, not a model you can spin.

The **layer** chips — Doors, Covers, Busbars, Cables, Tags, Dimensions — only hide and show. The two
pickers to their right, **cables beside / behind** and **one face / two faces**, *re-arrange the
board*, so they sit apart from the chips and the next *Work the board out* uses them.

#### One section's settings
Click a section on the front view and the left column's **Section** panel appears: its cable alley,
which side the vertical busbar is on, its depth (only the depths the construction actually offers),
its form, and whether it carries two faces. Every change re-asks the database for the verdict, so a
choice that makes a section too small is refused by the same rule the costing uses.

**The one that catches people:** putting the cable alley **behind** the plates gives you a wider
plate — 650 mm instead of 450 on an 800 mm section, so a wider or a second device fits — but it
needs **800 mm of depth and access from the back**. Choose it on a shallower section and the verdict
reads *will not fit* and says why, in millimetres. That is deliberate: the cables have nowhere to go.

A **double-front** section is judged face by face, and fits only when **both** faces fit. Taking the
second face off while kits are still on it is refused rather than losing them.

Under *Does it fit?* the board's own line reads its width, height, depth and roughly what it
weighs — summed from the weights on its parts, saying how many parts carry none.

#### The drawing on the quotation (Annexure V)
Save a layout and it prints with the quotation. On the **Release** screen, *Preview* or release as
usual: after Annexure IV comes **Annexure V — General Arrangement**, one **landscape** page per
panel that has a saved layout, and the cover letter's annexure list grows to five.

- A panel you have **not** laid out gets **no sheet**, and a quotation with no layouts at all looks
  exactly as it did before — four annexures, nothing landscape. Nothing is ever drawn from a guess.
- Each device carries a tag — **Q1, Q2 …** — and the same list is added to that panel's row in
  Annexure IV, as *Device tags (see Annexure V)*. They cannot disagree: they are numbered once.
- A device the library has never measured is drawn with a **dashed** outline and labelled *size not
  on record*. That is the prompt to fill its module height in.
- The scale is chosen so the board fills the page and is printed on the sheet, beside *not to scale
  on print — work to the dimensions*. A print dialog can shrink a page; the dimensions cannot lie.
- The footer takes the **form** and the access from the drawing itself and adds the panel's own
  enclosure note where it has one. A board whose form nobody chose prints no form.

On a **double-front** board — one where you have put kits on a face at the back — you get a
**second landscape page straight after the first**: the rear elevation. It is the same board seen
from behind, so the sections run **right to left** and each section's busbar chamber is on the
other hand; the header says so in as many words. Only the devices on face B are drawn, under the
tags they already carry on the front sheet, and a section with nothing behind it is drawn empty and
marked *no devices on this face*, with its heading saying whether its back shows cable lugs or
shrouded terminals.

A board you have set to double-front access but not yet drawn anything behind gets **one** sheet,
not a blank second one. Its footer still reads *front and rear access*.

### Draw the panel, and put the enclosure on the costing (phase 3.8)

On a panel in a draft costing: **Layout**. It draws the board at true scale — the frame, the
busbar chamber across the top, each section with its devices on their covers — and turns that
drawing into the enclosure lines on the costing.

**Before it can draw anything, the library has to describe the kits.** This is the part that
catches people out: a board whose kits have no *mounting design* cannot be arranged at all, and
until then the screen shows every kit in amber under **Not described yet** and draws nothing. It
now says so on the drawing itself, and names the two places to fix it.

**What each kit needs**

- **Mounting design** — how the kit is built into a board, and therefore what rule arranges it:
  *busbar-fed* (an ACB, an ATS pair, a changeover or an isolator, which takes a section of its own
  and connects straight to the horizontal busbar), *MCCB cover* (one device per cover, stacked down
  the compartment), *side-by-side plate* (MCBs, contactors, meters, terminals, across the width of a
  plate), *correction* (APFC steps, with the kVAr limit per section), *meter board plate*, or
  *in-line 3NJ6*.
- **Module height** in millimetres, on the 50 mm grid — the cover height the kit takes on the stack.
  Every design except the side-by-side plate needs it; a kit with a design but no height is still
  listed, with the missing half named beside it.
- Optionally **positions per plate**, and a footprint where that is not simply the main device.

Two ways in, whichever suits: on one kit at a time under **Kits**, in the boxes under its
footprint; or for the whole library at once under **Import**, step 5, *Kit sizes and mounting*.
Step 4, *Dimensions*, is what draws each device at its true size — the layout works without it, but
the devices are drawn at their compartment's spacing rather than their own.

**A first draft of the designs, to save typing it 296 times.**
`python3 scripts/draft_kit_layout.py` writes `docs/reference/kit-layout-draft.csv` with a mounting
design proposed for every kit from its group, the same columns as the template, so you can correct
it and upload it straight to Import step 5. It **never proposes a module height** — those are yours,
from the S4 planning manual, and a guessed one would be drawn at true scale and look just as
authoritative as a real one. It prints the two groups whose answer is a judgement rather than a
reading, and it checks every kit's own name against the design proposed for its group, so an ACB
filed under MCCB is named rather than quietly mis-drawn.

**Using the screen**

1. Choose the **construction** at the top right. *Siemens SIVACON S4* is seeded from the Application
   Manual. S8, the meter board and our own double-front frame are named and empty — those widths are
   yours, and a made-up one would be worse than a blank.
2. **Work the board out** arranges every described kit into sections by the rules of its design.
   It is a starting point, not an answer: drag a kit onto another section to move it, and the drop
   is refused with a reason when there is no room.
3. The two dropdowns above the drawing set how a section is built: whether the cable alley sits
   **beside** the vertical busbar or **behind** it (behind adds depth and widens the plate), and
   whether the board is **one face** or double-front. *Section* on the left edits the selected
   section on its own — width, connection, design, depth.
4. The **view tabs** are Front (the editor), Rear (an editor too when any section is double-front,
   otherwise the rear connections read-only), Plan, Door and 3D. The **layer chips** — Doors,
   Covers, Busbars, Cables, Tags, Dimensions — only show and hide; none of them changes the board.
5. **Does it fit?** on the right gives a verdict per section in the unit that design counts in:
   millimetres of height for covers, positions for side-by-side plates, kVAr for correction.
6. **Save layout** keeps the drawing with the panel. It **moves no price at all**, and it comes
   back when you open that panel again. Save before you leave: the next step needs a saved
   drawing, and **a revision or a copy of the costing does not carry the drawing** — its panels
   are new rows, and they start undrawn. Worth knowing before you revise a job whose quotation
   carried a general-arrangement sheet.

**Putting the enclosure on the costing** is the one button here that touches money. It works from
the **saved** drawing, so press *Save layout* first — on a panel with nothing saved it says so
rather than using what is on screen.
**Put these cubicles on the costing** adds the cubicles the drawing asks for as ordinary component
lines in an *Enclosure* section, priced and frozen exactly like hand-typed ones. Press it twice and
it refuses rather than doubling them; if you have changed the drawing and want the new cubicles in
place of the old lines, use **Replace the ones already there**. Anything the drawing needs that the
catalogue has no part for is listed rather than invented.


### Work out the busbar runs (phase 4.1)
This is your `CU-OPT1` sheet, on the panel. In a draft costing, on the panel: **Work out the
busbar runs**.

**Start from this board** lists the runs a board like this one needs — incoming tails for each
supply, changeover and ATS tails where it has them, horizontal and vertical busbar, a row of
outgoing tails for each rating in the feeder schedule, the correction's tails sized from its kVAr,
and an earth bar. The bar sizes come from your own library: the bar your 800 A kits carry is the
bar an 800 A run gets. **The lengths are your company's usual figures, not a measurement of the
board in front of you** — that is the column to correct against the drawing. (A board nobody has
configured has no ratings to work from, so the button says so; add the runs by hand instead.)

Each row is the sheet's own sum: phases × runs per phase × length × sets, and the metres appear as
you type. Underneath, the totals per bar size in metres, kilograms and money at today's copper
rate.

**Save the schedule** keeps it with the panel and **moves no price at all** — it is a calculation,
not a line. It comes back when you open the card again, and a revision or a copy of the costing
carries it.

**Add these as busbar lines** puts one line per bar size, at those metres, into a *Busbar* section
— ordinary component lines, priced and frozen exactly like hand-typed ones. Press it twice and it
refuses rather than doubling the metres; if you have changed the schedule and want the new figures
in place of the old lines, use **Replace the busbar lines already there**.

The one thing worth looking at even if you never apply it: when the panel already carries busbar,
the card says how far the schedule and the costing are apart. On NPP-192 that gap was real — the
sheet worked out 70.4 m of 50×10 and the estimate carried 30 — because nothing carried one into
the other. Now something does.

### Read the APFC bank size (session 3)
A panel built from kVAr step kits (the APFC group, chosen by rating × quantity) shows a line
under its kit table: "APFC bank: 400 kVAr in steps". Change the quantities and it follows.

### Switch a feature on (the road to production)
**Features** in the top bar. Everything built since the foundations arrives **switched off**, for
every company, and stays off until you switch it on here. Only you, as the master administrator,
can: a company administrator sees the list and its state but no buttons, and the database refuses
the change rather than the screen hiding it.

Three of them are marked in red because **switching them on changes what an existing costing
does**, and those are the ones to try on the staging app first — open a real job, write down its
total, switch the feature on, and read the total again:

| Feature | What changes |
|---|---|
| Approval rules in force | What happens when a costing is submitted. Off, every costing needs an approver, as it does today. |
| Validity and the nightly sweep | A quotation that has run out is marked overnight and a chase is raised. This is the only thing in the app that writes while nobody is watching. |
| Chosen option and optional extras | The headline figure of a job with two options or an optional extra. |

The rest only add a screen: switching one on shows a menu item, and nothing already costed moves.
Switching a feature off again hides it; nothing that was entered while it was on is deleted.

### Read the compatibility checks on a panel (roadmap 3.4)
A panel shows a short list under its name when a check finds something: a device deeper than the
usable depth of the cubicle bought for it, a part listed for other devices than the one in its kit,
or outgoing ways adding up to far more than the incomer. The costing screen carries one line above
the panels saying how many there are altogether. **They change nothing** — no price, no hour, no
total — and a check says nothing at all until the library holds what it reads. So an untouched
catalogue shows no notes, which is the honest answer, not a fault.

What each check reads, and where you fill it in on the Components screen: the depth of a device
(*Depth mm*), the usable depth inside a cubicle (*Usable depth*), and the frame a part is listed
for. The outgoing-ways check reads the kits' ratings, which the library already holds, and the
section each kit sits in on the panel — so put the incomer in **Incomer** and the ways in
**Outgoers** and it reads correctly.

### Change or switch off a compatibility check (roadmap 3.4)
Compatibility → the three checks, each with the one figure it uses: the room to leave behind a
device (100 mm), and how many times the incomer the outgoing ways may come to (4 ×). Type a new
figure and press **Save**; **Switch off** silences a check for everybody. *How loud* has two
settings: *a note on the panel*, which is what they all ship as, and *a blocker an approval rule
can act on* — which still changes nothing by itself. To make a blocker stop a costing being
submitted, go to Approval rules and write one on *Compatibility findings marked as blockers*.

### Set the enclosure uplift (session 1)
Company → Enclosure uplift %. Added to catalogue cubicle prices (components ticked *enclosure
cubicle*) when they enter a costing, and frozen there.

### Set kit group hours (session 1)
**Start here if you have not done it yet.** Every group is blank today, so every costing charges
nothing for assembly, wiring or busbar time — the material prices correctly and the time is left
out. `docs/reference/labour-hours-worksheet.md` is the 17 groups laid out biggest first, with an
example kit against each and what the three processes cover, so the 51 figures can be filled in
one sitting; the top four groups alone cover 183 of the 296 kits.

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

**Let the assistant write the letter.** Under *Cover letter* on the same screen there is
**Draft the wording** — visible only when the assistant is switched on for your company. It reads
this costing and writes four things: the subject line, the opening, the closing and the notes on
the offer. It cannot write a price, a discount, a payment term or a delivery date; the Edge
Function refuses a draft that names a figure, and the price schedule is built from the costing as
it always was.

What comes back is a proposal, not a change. You read it, and then:

- **Use this wording** puts it in the four boxes. If you had already typed something in one of
  them, that box is marked *replaces what you wrote* before you press anything, and a line says
  how many of your own lines would go.
- **Discard** throws it away and leaves the form exactly as it was.

Either way nothing is saved: **Release** is still the only button that releases a quotation, and
the words are still yours to edit afterwards. The costing's history records that the wording came
from the assistant and who took it.

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

**It checks itself, four times a day.** The **Uptime check** workflow asks whether the site is
serving the app and whether Supabase is answering, at 06:00, 12:00, 18:00 and 00:00 UTC. If
either is down it fails, and GitHub emails you — you do not have to watch anything.

It checks twice, twenty seconds apart, before it says anything is down, so a blip during a
deployment does not cry wolf. And it looks at what comes back, not just the status code: a
misconfigured host will happily return a cheerful error page with a 200 on it.

To ask right now rather than wait: **Actions** → **Uptime check** → **Run workflow**. The run
summary says what answered and how quickly.

By hand, the same check takes ten seconds: open the Vercel URL and sign in. For more detail the
Vercel dashboard shows deployments and the Supabase dashboard shows database health.

**If you want to be told within minutes rather than within hours**, this workflow is not the
thing to change — four times a day is deliberate, because GitHub bills Actions by the minute on
a private repository and a five-minute check would eat about four times the free monthly
allowance. The better answer is a free uptime service: **UptimeRobot** or **Better Stack** both
check every five minutes on their free plan and email or text you. Point one at
`https://cost-matrix-theta.vercel.app`, expect a 200, send alerts to your address. It takes five
minutes to set up, needs nothing from this repository, and this workflow stays as the floor that
needs no account and cannot lapse when a subscription does.

One thing to know about scheduled workflows: **GitHub stops running them after 60 days with no
activity in the repository.** While work is going on that never happens; if the app is ever left
alone for two months, press *Run workflow* once to wake it up.

### When a costing says it charges nothing for labour (migration 0131)
Switch **The missing-labour check** on (master administrator → Features) and a costing that carries
no labour tells you so, above the totals. It **blocks nothing and changes no price** — a supply-only
job legitimately has no labour, so it reports and leaves the judgement to you.

Two different faults, with two different fixes:

- **"This costing charges nothing for labour."** Its kits have no hours in the library. The warning
  names the **kit groups** responsible — those are the rows of
  `data/seed/kit-group-labour-template.csv`, or the **Kit groups** screen. Fill them in, then make a
  **new revision**: a costing freezes the hours it was given, so an existing one will not pick them up.
- **"Some hours are priced at nothing."** The hours are there, but the hourly rate frozen onto that
  costing is zero. Set it under **Rates → Labour rates** and, again, make a new revision — a rate set
  after a costing is created does not reach it.

While the labour template is empty this will fire on every costing, which is correct: every kit
currently costs zero labour.

### Download a backup (see Part E)
Supabase dashboard → Database → Backups. Or fetch the weekly off-site dump from where the
backup job stores it.

### Hand the job to the drawing office (phase 4.3)
On a costing, the **The drawing office** card. It changes no price — everything on it is a
reference or a file.

**The references.** Type the **EPLAN project** as the drawing office names it and the **drawing
numbers**, one per line, then *Save project details*. They go on the costing, they appear on the
exports, and a **revision carries them** — it is the same board on the same drawings. A **copy**
starts with none, because a copy is a different job that will have its own.

Rather than typing them, press **Paste an EPLAN project export instead** and paste the project
properties straight out of EPLAN. It reads whatever shape they come in — `Project name: …`,
`Drawing no = …`, a two-column export, tabs — shows you what it found, and saves nothing until you
press the save button in that box. **Every line it could not read is listed**, so if your export
uses a field name it does not know, you will see it rather than wonder why nothing happened. Tell
me the name and I will add it.

**The technical offer as Word.** *Technical offer as Word* writes a real `.docx` onto your machine,
one heading per panel with the description as editable paragraphs. It is a **copy**: edit it, send
it, nothing you type in it reaches the costing or the quotation.

**The parts list.** *Parts list (CSV)* or *(Excel)* writes one row per line of the costing, with
these columns, in this order:

> Device tag · Part number · Manufacturer · Description · Quantity · Unit · Panel · Panel quantity ·
> Section · Kit · Mounting · Width mm · Height mm · Depth mm · Weight kg · Our code · Category ·
> Costing · EPLAN project · Drawing numbers

The order is fixed on purpose: the drawing office maps it in EPLAN's parts import **once** and then
never again. Three things to know:

- **Quantity is per panel**, with the panel count in the next column — not multiplied together. A
  board built twice shows 1 and 2, so nobody double-orders.
- **Device tag** is the tag the panel layout draws (`Q1`, `Q2` …). Lay a panel out and its kits'
  parts carry their tags; don't, and the column is blank — the list still imports, the devices just
  will not match a drawing.
- The card **warns you before you export**: how many rows have no manufacturer part number (EPLAN
  matches on that, so those rows will not find a part) and how many kits are not placed yet.

The figures are the **frozen** ones, so an old costing exports what was actually quoted rather than
what the catalogue says today.

*Not verified against a real EPLAN installation* — there is none here. The columns follow EPLAN's
parts-import fields and are documented above; if the mapping needs a different heading, say which
and it is a one-line change.

---

## Part C2 — Taking the advanced app to production

The advanced track was built on the staging project from 10 September, and crossed to production
on **12 September** — 75 commits and 19 migrations, every feature switched off, and nothing on
the live app looked different.

**It happens once more, and then never again.** The panel layout and the Word/EPLAN exports were
merged into `advanced` after that release, so one more `advanced → main` pull request brings them
across. From 13 September there is **one track**: work goes to `main`, each feature behind a
switch that is off, and the section at the end of this part is the rhythm from then on.

### What the merge actually does

Merging `advanced` into `main` runs two workflows against **production**:

- **Deploy database** applies migrations 0100 onward to your real catalogue, kits, costings and
  quotations. This is the largest single change since the app went live.
- **Deploy functions** puts the Edge Functions there, and Vercel rebuilds the site.

**Nothing you can see changes.** Every advanced feature arrives switched off, so the app looks as
it does now, plus a **Features** item in the top bar. What you switch on afterwards, and when, is
yours.

### Before you merge

1. **Take a backup.** Supabase → your production project → Database → Backups, and take one now
   rather than relying on last night's. Part E explains what each tier gives you.
2. Check the pull request is green — both CI jobs, including *Rehearse the upgrade on a database
   that already holds rows*. That job builds a database at 0017, fills it with the real seed and
   a released quotation, applies every advanced migration on top, and **refuses any figure that
   moves**. It is the closest thing to a dress rehearsal that does not touch your data.
3. Pick a quiet hour. Nobody should be part-way through costing a job.

### After you merge, in the first five minutes

1. GitHub → **Actions** → *Deploy database* → the run on `main` has a green tick. If it is red,
   stop and send me the log; **do not** merge anything else.
2. Open the live app. Sign in. It should look exactly as it did.
3. Open one costing you know and check its total is the figure you remember. This is the one that
   matters; everything else can be fixed at leisure.
4. Components still shows 735 parts. Kits still shows 296.
5. A new **Features** item appears in the top bar. Open it: everything says *Off*.

### Then, one at a time

Switch on the ones that only add a screen first — price lists, the BOM import, files, sizes, the
costing grid, the configurators, the compatibility checks, sales analytics. Each shows a menu item
and changes nothing already costed.

Leave the three marked in red until last, and for each of those: open a real costing, write its
total down, switch the feature on, and read the total again. They are the ones that change what an
existing costing does, and they are described on the Features screen itself.

### If something is wrong

The backup from step 1 is the answer, and Part E is how to use it. Nothing in this merge deletes
data: the migrations add tables and columns and rewrite functions. A feature switched on can
always be switched off again, and switching it off hides it without deleting what was entered
while it was on.

### From now on: one track

There is no second track to release from any more, so there is no repeat of the day above. The
ordinary rhythm is:

1. A feature is built on a branch off `main` and merged into `main`. **Deploy database** applies
   its migration to production. Nothing you can see changes, because the feature is switched off.
2. When you want to try it, staging is where you do that: it runs the same code (the `advanced`
   branch, which is now just the copy staging deploys from). `docs/trials/advanced-trial.md` is
   the click-through.
3. Then switch it on for real work on the **Features** screen, one at a time, writing a real
   total down before and after for anything marked as changing an existing costing.

**Keeping staging in step** is one thing nobody does automatically yet: after a change reaches
`main`, `main` has to be merged into `advanced` for staging to pick it up. Worth automating once
the two are level; until then, ask and it is one command.

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
   **On the free tier there are none**, which is why the line above about switching matters.
2. **A weekly dump kept away from Supabase** — the **Weekly backup** job in GitHub, which runs
   at 02:15 UTC every Sunday and can also be started by hand (Actions → Weekly backup → Run
   workflow). It takes three files — the roles, the schema and the data — checks they are not
   empty, and keeps them for 90 days as an artifact on that run. If it fails you get a red tick
   in Actions and GitHub's own failure email.
3. **Quotation PDFs** — held in Supabase Storage. They are **not** in the weekly dump, which is
   the database only; they can be regenerated from the costing data, which is.

**Where the dump lives, honestly.** On GitHub, not on Supabase — so a problem with the Supabase
account does not take the backups with it, which is what this layer is for. It is *not* away
from GitHub. If you want it further away, say so and it is one secret and half an hour of work
to send it to a bucket as well; the job is written to pick that up.

### The restore drill

A backup you have never restored is not a backup. Do this **once now**, and once a quarter
after, and write the date in `docs/decisions.md`:

1. Actions → **Weekly backup** → open the latest green run → download the artifact at the
   bottom of the page. You should have `roles.sql`, `schema.sql`, `data.sql` and `taken-at.txt`.
2. Create a fresh empty Supabase project (the free tier is fine for a drill).
3. Restore into it, in this order — the order matters, and the third file is meaningless
   without the first two:

   ```sh
   psql "<the drill project's connection string>" -f roles.sql
   psql "<the drill project's connection string>" -f schema.sql
   psql "<the drill project's connection string>" -f data.sql
   ```

4. Point a local copy of the app at the drill project and sign in, or query it directly. **Open
   a costing you know and check the total to the cent.** Counting rows is not enough: the thing
   that matters is that a price says what it said.
5. Delete the drill project.

If any step fails, the backup process is broken and fixing it is the most urgent thing on the
list — ahead of any feature.

**What is already proved, and what is not.** Every pull request runs
`supabase/tests/restore-drill.sh`, which dumps a full database, restores it into an empty one and
refuses any of fourteen figures that moves. So the *mechanism* is known to work on this schema.
What that cannot prove is that **your** dump, of **your** project, restores — only the drill
above does that, and it is the reason to do it rather than trust the green tick.

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
