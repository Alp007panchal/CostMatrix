# CostMatrix house style — shared with Opsmatrix

**Status:** confirmed by Alpesh, 14 Sep 2026 (mockups v2). Applies to the web app on `main` first, then folded into `advanced`. Mockups: `docs/reference/mockups/house-style/*.html` (self-contained, open in a browser) and `docs/reference/mockups/house-style/png/*.png`.

## 1. Why

Nationwide runs two apps, Opsmatrix (operations) and CostMatrix. They should look like one family: the same dark sidebar with numbered groups, the same calm pages, the same fonts, colours, buttons and status chips. CostMatrix today has 25 links in one top bar, a 60 rem page cap and no grouping; this document replaces that shell and sets the rules every screen follows.

## 2. Tokens (copy verbatim into `web/src/ui/styles.css`)

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
:root {
  --ink:#14181F; --ink-soft:#2A313D;                 /* sidebar, primary button */
  --paper:#F4F5F2; --paper-2:#EAEBE6;               /* page, subtle fills */
  --line:#DCDDD6; --line-dark:#33394450;            /* borders */
  --accent:#C9622B; --accent-soft:#F0DCC9;          /* active nav, tabs, approve/release */
  --ok:#3D7A4C; --ok-soft:#DEEBE1;                  /* approved, priced, won */
  --warn:#B8862E; --warn-soft:#F3E7CC;              /* submitted, expiring, watch */
  --bad:#B84438; --bad-soft:#F3DBD6;                /* overdue, unpriced, lost */
  --blue:#3A6EA5; --blue-soft:#DCE6F2;              /* sent, from layout, info */
  --text:#1C2027; --text-dim:#5B6270; --white:#fff; --radius:3px;
  --mono:'IBM Plex Mono','SF Mono',Consolas,monospace;
  --sans:'IBM Plex Sans',-apple-system,'Segoe UI',sans-serif;
  --disp:'Space Grotesk','IBM Plex Sans',sans-serif;
}
```

Type: body 14 px `--sans`; page title 22 px `--disp` 600; section title 16 px `--disp` 600; KPI value 30 px `--disp` 700; table 13.5 px; buttons 12.5 px 600; labels, meta lines, references and chips 10.5–11.5 px `--mono`, uppercase with letter-spacing for labels. Spacing on an 8 px grid: page padding 24 × 36, card padding 16 × 20, table row ≈ 44 px. Radius 3 px. No shadows except the panel-layout pop-up. The old `--accent #1f5fbf` blue goes; `.badge` becomes `.chip`.

## 3. Shell (`web/src/app/Layout.tsx`)

Left **sidebar** 232 px, `--ink` background, full height: brand block (`COSTMATRIX` in `--disp` 700 16 px white, company name under it in `--mono` 10 px grey), then groups with a `--mono` uppercase label, items 13 px with a 5 px dot, active item = background `#20262F`, 2 px `--accent` left border, 600 weight. Counts on the right of an item only where something waits for a person (`--mono` grey; orange pill when overdue). Who-you-are (name, company, roles) at the bottom. Below 900 px width the sidebar becomes a bottom bar (as Opsmatrix).

Sidebar groups and items (routes in brackets; items behind a feature switch simply do not render; admin items only for company admins; Companies only for the master admin):

| Group | Items |
|---|---|
| OVERVIEW | Home (/) |
| 1 · ENQUIRY TO QUOTE | Customers (/crm/customers) · Enquiries (/crm/enquiries) · Costings (/costings) · Quotations (/quotations) · Follow-ups (/crm/follow-ups) |
| 2 · LIBRARY | Components (/library/components) · Kits (/library/assemblies) · Library health (/library/health, feature `library_health`) · Library set-up (/library/setup) |
| 3 · INSIGHT | Sales (/sales, feature `sales_analytics`) · Labour variance (/admin/labour-variance, feature `labour_actuals`) |
| SETTINGS | Settings (/settings) · People (/admin/people) |
| HELP | Help (/help) |

**Top bar** (white, border below): page title on the left with a `--mono` meta line under it; on the right the page's actions (buttons), then date · time · Nairobi in `--mono`, then Sign out. The `.page` width cap is removed — content uses the full width with 36 px side padding. The footer link "What CostMatrix stores" moves into Help.

**Two new pages with vertical tabs** (`.vlayout`: 250 px tab column + content; `.vtab` active = white, `--accent` left border):
- `/settings` — Company: Company details (/admin/company), Quotation wording (/admin/quotation-defaults), Approval rules (/admin/approval-rules), Compatibility rules (/admin/compatibility-rules). App: Features (/admin/features), Assistant (/admin/assistant), What broke (/admin/errors), Companies (/admin/companies, master admin). The old routes keep working and redirect to the tab.
- `/library/setup` — Rates & currency factors (/library/rates), Kit groups & labour hours (/library/kit-groups; shows "17 empty" while hours are missing), Price lists (/library/price-lists, feature `price_lists`), Import (/library/import).

## 4. Rules for every screen

1. One title per page, one `--mono` meta line, and one plain sentence (`.intro`) saying what the page is for.
2. At most four KPI tiles, one exception bar ("things need a decision now", red left border, items with a coloured severity bar and a source line), and two numbered sections (`.section-head`: number in mono, coloured dot, title, right-aligned hint).
3. Lists open with filters on one line (search, two dropdowns, a count chip) and show five to eight columns; secondary facts go on a second line inside the cell (`.sub`). Numbers right-aligned, tabular. Details open **beside** the list (right column), not on a new page.
4. Long screens use vertical tabs (costing panels, settings, library set-up); short ones use underline tabs under the intro.
5. Status is a `.chip` in `--mono` uppercase with the soft background of its colour: DRAFT dim · SUBMITTED warn · APPROVED ok · SENT blue · WON ok · LOST bad · EXPIRED warn · NO PRICE bad · FROM LAYOUT blue.
6. Buttons: `.btn` dark = the one primary action; `.btn.secondary` white; `.btn.accent` orange only for Approve and Release; `.btn.ghost` for row actions.
7. Nothing is typed twice: counts in the sidebar, tiles and exception bar all come from the same queries the pages already use.

## 5. Per-screen changes (see the mockups)

- **Home** (`modules/dashboard`): intro sentence; four tiles (waiting for your approval, quotations out, follow-ups overdue, won this month); exception bar with up to three items (costings awaiting approval, follow-ups overdue, library gaps from Library health); section 1 "On your desk" (costing, customer/project, status, ex-VAT, what next); section 2 "Follow-ups this week". Drop the "How the company is set up" and "Your roles" cards (they move to Settings › Company details and the who-you-are block).
- **Costing editor** (`modules/costing/CostingEditor.tsx`): top bar = reference · customer · project, meta line with revision, panel count and status chip, actions ← Costings · Copy · Exports ▾ · Approve / Return (or Submit while draft). Status steps Draft → Submitted → Approved → Quotation released. Left column: vertical tabs for each panel (name + ex-VAT), "+ Add a panel", then "All panels side by side" (the grid), Documents (count), Approval & history; totals panel under the tabs. Right column: section 1 = the selected panel (toolbar + Add kit / + Free line / Layout / Copy panel; kit table Tag · Kit (group and hours on the second line) · Qty · Material · Labour · Line total · Check, with subtotal rows per section: incoming, outgoing, compensation, enclosure & busbar); section 2 = checks on this panel (warnings as alert items with a source line).
- **Components / Kits** (`modules/library`): intro; filters; table Part no. · Description (category · supplier on the second line) · EUR · KES landed · Price (chip with the price date, NO PRICE, or N DAYS OLD when older than the 90-day rule); details form beside the list with Description, Price EUR, Landed KES, Size for layout, Status; "Used in N kits" list under it. Kits the same shape with Kit · Group · Module height · Material · Hours.
- **Quotations** (`modules/quotation`): intro; four tiles (sent · open, follow-up overdue, expiring within 14 days, won this month); tabs Open / Won / Lost / Expired / All; table Reference · Customer (project · validity on the second line) · Ex-VAT · Status · What next (Release PDF, Chase, Won or lost?, or the next follow-up date).
- **Library health**: keep its two groups, restyle as sections with the exception-bar look; the "List them" buttons become `.btn.secondary.small`.
- **Everything else** (CRM pages, sales, labour variance, help, terms, admin forms): the new shell and stylesheet only; forms use `.form-grid` two columns with mono labels.

## 6. What does not change

No database or engine changes. Routes stay (old admin and library routes redirect into the two tabbed pages). The panel-layout pop-up keeps its own drawing styles. Tests: existing page tests updated for the new navigation; add a test that every route is reachable from the sidebar or a tab for each role.
