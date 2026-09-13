# SIVACON S4 — construction facts for the CostMatrix panel layout

**Source:** Siemens *SIVACON S4 power distribution board — Application Manual*, edition 03/2025, 8PQ9803-1AA61/02 (Alpesh's copy; HTML export and PDF, not committed to the repo). Extracted 12 Sep 2026 for the panel-layout feature (`panel-layout-spec.md`). Figures below are what the manual states; anything marked *our rule* is a CostMatrix decision.

## 1. System envelope

| Item | S4 |
|---|---|
| Main busbar rated current | 630 – 6 300 A (I_cw up to 100 kA 1 s, I_pk up to 220 kA) |
| Height of supporting structure | 2 000 mm; optional base 100 or 200 mm |
| Cubicle widths | 400, 600, 800, 1 000, 1 200 mm (plus 200 mm distribution-busbar compartment, see §2) |
| Depths, main busbar **top / bottom** | 400, 600, 800 mm |
| Depths, main busbar **rear** | 800, 1 000, 1 200 mm |
| Installation | single-front |
| Forms of internal separation | 1, 2b, 3b, 4b |
| Degree of protection | IP30/IP40 ventilated, IP31/IP41 with top-plate kit, IP55 non-ventilated |
| Main busbar sections | 20×10, 30×10, 40×10, 50×10 Cu (2, 4 or 8 sub-conductors per phase); cubicle equipment bars 50×5 … 160×10 |
| Distribution (field) busbar | cascaded up to 1 280 A; non-cascaded up to 2 810 A; 3NJ6 in-line plug-in busbar up to 2 100 A |
| Alignment | lateral and rear |

## 2. Cubicle (section) types

| Cubicle type | Manual section | Composition / rule |
|---|---|---|
| **Incoming feeder cubicle ACB** | 5.1 (busbar top), 6.1 (busbar rear) | 3WA ACB size 1 (630–2 000 A), size 2 (2 500–3 200 A), size 3 (4 000–6 300 A); fixed-mounted or withdrawable. Cable lugs per phase: size 1 up to 6/12, size 2 12/14, size 3 up to 24–28. Busbar-rear version needs depth 800/1 000/1 200 and, for 3WA13, a 400 mm empty cubicle beside it for the main-busbar joint. |
| **Infeed panel MCCB** | 5.2 | 3VA15 / 3VA25 (1 000 A), 3VA26 (1 250 A), 3VA27 (1 600 A, withdrawable). 4–6 cables per phase. |
| **Coupling cubicle ACB** | 5.3 | As incoming feeder. |
| **Outgoing feeder cubicle, fixed-mounted** | 5.4, 6.2 | **= distribution-busbar compartment (200 or 400 mm) + device compartment (600 or 800 mm)** → 800–1 200 mm overall. Assembly kits: 3WA ACB (cascaded), 3VA MCCB (non-cascaded), 3NP1 and 3NJ4 fuse-switch disconnectors, modular installation devices (DIN rail), modular depth-adjustable mounting plates (SIRIUS starters, SIMATIC, SITOP). Devices stack one per cover; **cover heights 150 – 800 mm in 50 mm steps** (150–300, 350–500, 550–600, 650, 800 in the hinge table). Cable connection in the compartment (Form 3b with cable terminals); flexible busbar to 630 A; cables to 225 A per the table. |
| **Cable panel** | 5.5 | Separate cubicle for incoming/outgoing cables with C-type mounting bars. |
| **Mounting plate field** | 5.6 | Cubicle with inner door and a full mounting plate (20 kg load) — the controls / metering section. |
| **Outgoing feeder cubicle 3NJ6** | 5.7 | In-line plug-in fuse-switch disconnectors on a rear plug-in busbar; **50 mm rail pitch**; sizes 00/1/2/3 stacked large at top; total current per cubicle ≤ 2 000 A; blanking-cover rules per size. |
| **Outgoing feeder cubicle 3NJ4** | 5.8 | Fuse-switch disconnector variant. |
| **Corner cubicle** | 5.9 | For L-shaped boards. |

## 3. Forms of internal separation (manual §3.2)

Form 1 none · Form 2b busbars separated from functional units · Form 3b + each functional unit in its own compartment (terminals shared) · Form 4b + connection points separated per unit. *Our rule:* the layout draws partitions per form and counts them for the enclosure uplift (decision 1).

## 4. How this maps to the layout model (our rules)

- A **section** = `busbar_compartment_mm` (0 for busbar-fed sections, 200 or 400 for outgoing feeder cubicles) + `device_compartment_mm` (400/600/800/1 000/1 200) with `connection` = front or rear (rear connection ⇒ main-busbar-rear depths 800–1 200).
- **Mounting designs** in the kit library: `busbar_fed` (3WA ACB, ATS pair, on-load changeover, isolator / AVR bypass — incoming, coupling or infeed cubicle), `mccb_plates` (3VA fixed-mounted, one per cover; `module_height_mm` = cover height, 50 mm grid), `side_by_side_plates` (modular devices on DIN rail, contactors, meters, terminals — modular installation kits or a mounting plate field), `compensation` (APFC steps), `inline_3nj6` (later, 50 mm pitch), `meter_board_plate` (wall boxes).
- **Device compartment usable height** for stacking covers: 2 000 mm less the main-busbar chamber and the cable-connection space — *to be confirmed by Alpesh from the S4 dimension drawings / SIMARIS*; the mockups assume 1 500 mm.
- **Module heights per kit** are decided by us and stored on the kit (`module_height_mm`), not derived automatically; the S4 cover table gives the allowed values.
- Widths, depths and forms come from the lists above; the enclosure line in the costing is built from `sections × (busbar compartment + device compartment)` plus the form uplift.

## 5. Still to take from the manual (when 3.8 is built)

Cover-height per 3VA frame (3VA1 100–250 A, 3VA2 400–630 A, 3VA1/2 3-/4-pole) from the dimension drawings; main-busbar chamber height for top/bottom arrangement; cable-connection space at top/bottom of a device compartment; 3NJ6 blanking-cover rules (manual 5.7) if in-line sections are ever used.
