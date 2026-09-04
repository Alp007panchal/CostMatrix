# Operations guide

How to set CostMatrix up and how to run it day to day. Written for someone who has never
deployed software. Follow Part B once; keep Parts C and D to hand afterwards.

If a step does not match what you see on screen, the service has changed its wording. The
intent of each step is explained, so look for the equivalent button rather than an exact match.

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
| Anon key | a long string starting `eyJ...` | Project Settings → **API**, under Project API keys |
| Project ID / ref | `abcdefghij` — the same letters as in the URL | Project Settings → **General** |
| Personal access token | a long string starting `sbp_` | Your avatar, top right → **Account preferences** → **Access Tokens** → Generate new token, named `github-actions` |

The access token is shown **once**. If you lose it, delete it and generate another; no harm done.

You do **not** need the service role key. Nothing we build uses it directly — Supabase hands it
to the invitation function automatically, inside its own environment.

If your dashboard shows "Publishable key" and "Secret key" rather than "anon" and
"service_role", those are newer names for the same two things: take the **publishable** one.

- [ ] All four values saved, plus the database password from B2.

### B4. Understand which values are secret

This is the one piece of security you need to hold in your head. Read it twice.

**Safe to publish — the Project URL and the anon key.** These are sent to every browser that
opens CostMatrix. That is by design and it is not a leak. They only let someone *attempt* a
request; the database then checks who is signed in and returns nothing they are not entitled to.
Anyone can read these out of the web page. That is expected and fine.

**Never share — the access token and the database password.** The access token can change
anything in your Supabase account; the database password opens the database directly. They
belong only in GitHub secrets (next step) and your password manager. Never put them in the web
app, never commit them to the repository, never paste them into a chat window, never email
them. If a token is ever exposed, delete it under Account preferences → Access Tokens and
generate another; that invalidates the old one immediately.

The same goes for the **service role key** if you ever have cause to look at it: it bypasses
every security rule in the database. We do not use it anywhere you could accidentally leak it.

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
| `VITE_SUPABASE_ANON_KEY` | the anon key from B3 |

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

### Invite a user
1. Sign in, open **People**.
2. Fill in the name, email and roles under "Invite somebody", then send.
3. They receive an email with a link to set their own password. Nobody can sign themselves up.
4. Check they appear in the list with the right roles ticked.

If the invitation fails, the invite-user function is not deployed (step B9), or Supabase's
built-in email is rate limiting. Authentication → Users in the dashboard shows whether the
account was created.

Roles, as a reminder: **company admin** manages settings and users, **costing engineer** builds
costings, **approver** approves costings and releases quotations. One person can hold several.

### Someone leaves
**People** → **Deactivate** on their row. Do not delete: their name must stay attached to the
costings they built. Deactivating stops them signing in immediately.

### Someone forgets a password
They click **Forgot password** on the sign-in page and get an email. If nothing arrives, send a
reset from Supabase → Authentication → Users.

### Change a company's discount (master admin only)
**Companies** → click the discount on that company's row → change it → Save.
Existing costings do not change: their prices were frozen when they were built. Only new
costings pick up the new discount. This is deliberate.

### Update prices from a supplier (slice 1)
1. Library → Components → **Download Excel**.
2. Send the file to the supplier, or edit the price column yourself.
3. Library → Components → **Upload Excel**, choose the file.
4. Read the preview: how many rows are new, how many changed, and the old versus new price for each. Nothing has been saved yet.
5. Confirm. Every price change is recorded with your name and the time.

Uploads never delete anything. To remove a component, deactivate it on its own screen.

### Change your own company's margins, VAT or currency
**Company** → change the fields → Save. The screen shows the markup each margin implies, since
margins are a share of the selling price rather than of cost.

### Change the copper rate (slice 1)
Library → Material rates → edit the rate per kilogram → Save. New costings use it; existing
ones keep the rate they froze.

### Find out what happened to a costing (slice 1)
Open the costing → **History** tab. Every submission, approval, return, revision and release is
listed with who did it and when. The log cannot be edited by anyone, including you.

### Check the app is running
Open the Vercel URL. If the page loads and you can sign in, everything is working. For more
detail: Vercel dashboard shows deployments; Supabase dashboard shows database health.

### Download a backup (see Part E)
Supabase dashboard → Database → Backups. Or fetch the weekly off-site dump from where the
backup job stores it.

---

## Part D — When something goes wrong

### The page is blank or shows an error
Usually a bad deployment. Vercel dashboard → Deployments → the most recent one → check it says
Ready. If it failed, the log says why. You can click **Rollback** on the previous working
deployment to get back online immediately, then we fix the cause.

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
| **Key** | A long string that identifies or authorises a caller. The anon key is public; the service role key is not. |
| **Row-level security** (RLS) | Rules inside Postgres saying which rows each signed-in user may see. This is what keeps companies apart. |
| **Tenant** | One company using the app, with its own walled-off data. |
| **Deploy** | To publish a new version of the web pages so users get it. |
| **Slice** | One complete workflow built end to end, from database to screen. See `build-plan.md`. |
