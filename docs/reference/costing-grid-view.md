# CostMatrix — Costing grid view ("panels at a glance")

**Status:** feature spec, confirmed by Alpesh on 12 Sep 2026 from the mockup in `docs/reference/mockups/costing-grid-view.html`. Roadmap phase 2 item **2.9**, to be built after the BOM import (2.3) and before approval rules / validity (2.5, 2.6).

## 1. Why

A costing often holds several similar panels (a main board plus a schedule of distribution boards). Today each panel is edited on its own; differences between similar panels are invisible until someone reads them side by side. The grid shows the whole costing in one table so quantities can be compared, copied and corrected at a glance, the way the team is used to working in Excel — without leaving the engine, the frozen prices or the audit trail.

## 2. What it is

A second way of viewing and editing the **same** costing records. Nothing new is stored except a per-user view preference (panel-by-panel vs grid) and the compare selection.

- **Columns** = the panels of the costing (`costing_panels`), in their existing order: name, short description, panel quantity. Option panels (`is_option`) are shown with an "option" tag and excluded from the all-panels column.
- **Rows** = every kit and every loose component that appears in **any** panel of the costing. A kit is one row (its internal parts stay inside the kit; a click on the row name opens the kit). A loose component (CT, meter, LOGO, lump sum) is its own row with a "component" / "lump sum" tag. Rows are grouped by section (incomer, outgoers, accessories & metering, busbar & cable, enclosure, other) using the kit group / BOM category, and within a section by rating descending.
- **Cells** = the quantity of that row in that panel. Blank = the panel does not use it. Cells are editable in place: typing a quantity calls the same engine functions as the panel editor (`add_assembly_to_costing` / `add_component_to_costing` when the panel did not have the row, quantity update when it did, remove when set to 0/blank). Prices stay frozen exactly as in the editor; every change writes the usual history/activity entries with `origin = manual`.
- **Right-hand column** = quantity across all panels multiplied by each panel's quantity (matches the BOM roll-up).
- **Bottom rows** per panel: material (KES), labour (KES, hours × rate), selling price ex-VAT (with the margin note), rounded panel price (× panel qty where qty > 1); the all-panels cell shows the costing total. These come from the existing costing views; nothing is recomputed in the browser.

Behaviour that depends on costing status: editable only while the costing is a draft (or a new revision); submitted/approved costings show the grid read-only, as the editor does.

## 3. Actions

- **Panel by panel | Grid** — segmented toggle at the top of the costing screen; remembered per user (`company_options` is not the place — a small per-user preference or local storage is fine).
- **Add panel** — same dialog as today; the new column appears empty.
- **Copy panel…** — pick a source column; creates a new panel with the same kits/components and quantities via the existing copy function (`copy_panel`); user renames it.
- **Compare** — pick two columns; cells whose quantities differ (including blank vs value) are highlighted in amber in both columns and the pair is named in a strip above the grid. One pair at a time.
- **Add a kit to a column** — the existing kit picker, opened from a "+" at the bottom of a column; the kit becomes a row for all panels (blank elsewhere).
- **Excel** — export the grid exactly as shown (sections, columns, totals) to `.xlsx`; a second sheet lists per-panel material/labour/selling; no formulas needed beyond the visible numbers. Uses the app's existing Excel export helper.
- **Attention marks** — a red cell/row when the panel has an unpriced (placeholder) part in that kit, or when the F12 space check (`app.panel_fit`) reports the panel over its safety factor; hover shows the reason.

## 4. Not in scope

Editing prices, margins or panel parameters from the grid (use the panel editor); drag-reordering rows; merging two costings; a customer-facing version (the quotation schedule and technical offer are unchanged).

## 5. Data and performance

No migration expected. One query for the grid: panels of the costing joined to their assemblies/items, pivoted in the web layer; a costing with 20 panels × 60 rows must render without pagination. If a DB helper makes this simpler, a read-only view `v_costing_grid` is acceptable (no engine change).

## 6. Tests

- Grid rows equal the union of all panels' kits and components; cell values equal the editor's quantities.
- Editing a cell produces the same rows, frozen prices and history entries as the same edit in the panel editor; setting a cell to blank removes the line.
- Copy panel from the grid equals `copy_panel`.
- Compare highlights exactly the differing cells for the chosen pair.
- Read-only when the costing is not a draft.
- Excel export contains the same numbers as the grid.
- NPP-192 acceptance test unchanged.

## 7. Mockup

`docs/reference/mockups/costing-grid-view.html` — static HTML of the confirmed design (sample numbers). Match the existing app's look; the mockup follows it (system font, white cards, blue primary button, grey borders).
