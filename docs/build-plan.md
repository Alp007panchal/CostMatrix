# Build plan

The app is built in vertical slices. A slice is one complete workflow that works end to end,
from database to screen, with tests, before the next slice starts. Each slice ends with:
migrations merged, pgTAP tests green, a short demo script in `docs/demos/`, and new lines in
`decisions.md` for anything decided on the way.

Time estimates assume one developer working with you part-time and are rough.

## Slice 0 — Foundation (about one week)

Not a user workflow, but everything else stands on it.

- Create the Supabase project (London) and a staging project.
- Install Supabase CLI; local database runs with `supabase start`.
- Migrations 0001 (extensions, `app` schema, helper functions) and 0002 (companies, settings, profiles, roles, counters, RLS).
- Seed: in-house company, master admin user, process types, categories.
- Web app skeleton: login, session, route guard by role, top navigation, empty pages per module.
- Master admin screen: create a company, create its first company admin, set discount.
- Company admin screen: invite users, assign roles.
- Master admin company switcher (read-only view of another company).
- CI: lint, typecheck, run migrations and pgTAP on a throwaway database.
- Weekly backup job and first draft of `docs/operations.md` (deploy, invite a user, restore).

Done when: you can log in as master admin, create a test company and a user, log in as that
user and see an empty costing list, and CI is green.

## Slice 1 — Cost one panel end to end (RECOMMENDED FIRST, about two to three weeks)

Master admin:
- Components with category, make, part number, unit and KES price; price history on change.
- Rate-based components (busbar sizes with kg per metre) and the master copper rate.
- One or more master assemblies with material list and hours per process type.
- Master default hourly rates.

Company admin:
- Currency and exchange rate, labour hourly rates, material rates, material and labour margin (with "same for both"), rounding step, VAT %.

Costing engineer:
- Create costing (number issued, company settings frozen).
- Add panels with quantity, option label, unit of measure; add assemblies to a panel; change quantities of items; edit hours with source hours shown.
- Set negotiation margin (default 0).
- Totals panel per panel and per option: material, labour, margins, rounded unit price, subtotal, VAT, grand total, all from the database views.
- Submit.

Approver:
- Approve, or return to draft with a mandatory comment.
- History log visible on the costing.

Not in this slice: PDF, CRM, private library, revisions, exports, master admin browsing.

**Why this slice first.** It is the whole reason the app exists. It exercises the frozen-price
and hours-based labour model that Excel gets wrong. Every later slice hangs off a costing.
Putting three or four of your real assemblies through it early will surface any misreading of
the labour model before the PDF, revisions and CRM are built on top of it. It also forces the
tenant isolation, role checks and calculation views to be right from the start.

Done when: the reference job (`docs/reference/costing-NPP-192-REV1.xlsm`, Option 1) rebuilt in
the app reproduces its material subtotal of 4,164,997.80 and the margin and rounding steps, a
second test company cannot see it, and an approver has approved one costing and returned one.

## Slice 2 — Quotation release and revisions (about two weeks)

- Company quotation defaults: letterhead, salutation and closing, signatory, notes on offer, the five terms sections, logo(s), currency word, quotation prefix.
- Panel technical description editor with the app-drafted text, and enclosure dimensions.
- PDF template exactly as `docs/quotation-template.md`, checked against `docs/reference/quotation-NPP-192-REV1.pdf`.
- Reference numbering: prefix + sequence + REV, sequence issued at first release.
- Release by approver: PDF rendered, uploaded to private storage, `app.release_quotation` records it. Download from the costing.
- Revision: "Revise" on an approved costing creates Rev N+1 in draft; older revision read-only with a banner; only current revision editable or quotable.
- Optional per-line "refresh price" on a new revision, logged in history.

Done when: a released PDF matches the reference layout, a revision can be made and released again, and the first PDF is unchanged.

## Slice 3 — BOM exports (about three days)

- Four category exports (switchgear, busbar, accessories & hardware, enclosure parts) as CSV and XLSX from any costing revision, quantities multiplied through assembly and panel quantities.

## Slice 4 — CRM phase 1 (about two weeks)

- Customers, contacts, projects with dropdown selection everywhere.
- Enquiries with numbering; costing linked to an enquiry (required for new costings from here on).
- Quotation status sent / won / lost with lost reason; enquiry status follows.
- Follow-up reminders: create on a sent quotation, list of due and overdue per company, mark done.
- `stage` and `owner` on enquiries stored now, funnel view later.

## Slice 5 — Multi-tenant library features (about two weeks)

- Private components and private assemblies per company, with company admin setting hours.
- Company override of master hours per assembly, shown beside master hours.
- Company price view with discount applied; master admin view showing both.
- Master admin read-only browsing of any company's costings, quotations and CRM.
- Onboarding checklist for a new external company (currency, rates, margins, users, quotation defaults).

## Slice 6 — Go-live hardening (about one week)

- Restore drill from the weekly dump into a fresh project, written up.
- Monitoring: Supabase alerts, uptime check on the web app, error reporting in the browser.
- Custom domain and email sender for Supabase Auth invitations.
- One-page user guide per role.
- Import of the existing component list from Excel, in the "db" sheet layout of the reference workbook (Make, Item, Description, Reference, Price).

## Later phases (not scheduled)

Sales pipeline view, activities and call notes, email sending from the app, sales targets and
reports, hiding master components per company, company-defined categories.

## Working rhythm

- One slice at a time. No slice starts until the previous one's "done when" is met with you.
- Every change goes through a pull request with CI green.
- `decisions.md` is updated in the same pull request as the change it records.
