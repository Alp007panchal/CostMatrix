# CostMatrix — Panel layout pop-up (phase 3.8) — specification

**Status:** feature spec, 12 Sep 2026, from Alpesh's mounting rules and the confirmed mockups (`docs/reference/mockups/panel-layout-*.html`; the high-fidelity ones `panel-layout-front-view-hifi.html`, `panel-layout-rear-view.html`, `panel-layout-3d-view.html` and `panel-layout-double-front.html` set the visual standard the finished feature is judged against — EPLAN Pro Panel level). Builds on foundation F12 (PR #31). Scheduled after the phase 2 queue unless pulled forward.

## 1. Purpose

Draw every panel of a costing at true scale so the enclosure can never be under-sized: the layout decides the sections, their widths and the cubicle count, and writes them into the costing's enclosure line. The same drawing is printed as the GA sketch in Annexure IV. Comparable to EPLAN Pro Panel / Rittal configurators, restricted to what costing needs.

## 2. Standard construction: Siemens SIVACON S4

Decisions (Alpesh, 12 Sep 2026): **SIVACON S4 is the default** free-standing construction; **front-connection and rear-connection sections are both standard**; **module heights are decided by us and held in the kit library**; **double-front boards are standard too** (§2.1).

S4 envelope (from our Application Manual 03/2025, see `sivacon-s4-construction.md`): height 2 000 mm + base 100/200; cubicle widths 400 / 600 / 800 / 1 000 / 1 200 mm; depths 400 / 600 / 800 (main busbar top/bottom) or 800 / 1 000 / 1 200 (main busbar rear); busbar system up to 6 300 A; forms 1 / 2b / 3b / 4b. An **outgoing feeder cubicle = distribution-busbar compartment (200 or 400 mm) + device compartment (600 or 800 mm)**; devices stack one per cover, **cover heights 150–800 mm in 50 mm steps**. Incoming / coupling cubicles hold 3WA ACBs (sizes 1–3, fixed or withdrawable); infeed panels hold 3VA MCCBs up to 1 600 A; a *mounting plate field* (inner door + full plate) is the controls / metering section; 3NJ6 in-line cubicles use a 50 mm rail pitch. Cable connection is inside the device compartment (front connection) or at the rear (rear connection, main busbar rear).

### 2.1 Double-front boards (own fabrication on an S4-style frame)

S4 itself is single-front (the manual lists only single-front installation). Nationwide also builds **double-front boards** on an S4-style frame of its own fabrication: both the front and the back of the board carry mounting faces, with the busbar between them (bottom or top). Main use: **KPLC meter boards** — both faces with MCB, meter and terminal plates; or one face MCB + KPLC meter + terminals and the other face changeover + terminals. MCCB covers and side-by-side plates may also be used on the back face.

In the model a section has an **access** setting: `single_front` (default) or `double_front`. A double-front section has **two device compartments back to back (face A = front, face B = rear)**, each with its own mounting design and its own stack of plates/covers; the depth comes from the deeper list (1 000 / 1 200) or the fabricated frame's depth; cable connection is per face; the fit verdict is per face and the section is "fits" only when both faces fit; the GA sketch prints a front and a rear elevation. Construction `custom_double_front` is added beside `S4`, `S8`, `meter_board`, `custom`, with its own width/depth lists (admin-maintained).

## 3. The model

**Enclosure (per panel)**: construction (`S4` default, `S8`, `meter_board`, `custom`), height, depth, base height, form of separation (1 / 2B / 3B / 4B), main busbar position (top / rear), cable entry (top / bottom). Stored in `panel_layouts` (F12) as the header of the layout.

**Sections** (a panel is an ordered list): width from the construction's list; **access** = single_front or double_front (§2.1); **connection** = front or rear (per face when double-front); **mounting design** (per face when double-front) — one of:

| Design | Devices | Capacity rule |
|---|---|---|
| `busbar_fed` | ACB, ATS pair, on-load changeover, isolator / AVR bypass | The device takes the section; connected up to the horizontal busbar. One or two devices stacked (e.g. ATS pair) if their module heights fit the device-compartment height. |
| `mccb_plates` | MCCBs, horizontal, one per plate | Plates stack down the device compartment; each kit consumes its **module height** (kit library). Vertical busbar on one side (150 mm default), cable alley beside (200 mm default) or behind (adds depth, widens the plate). Capacity = compartment height ÷ module heights. |
| `side_by_side_plates` | MCBs (18 mm modules), contactors, meters, small isolators, terminals, capacitor steps | Plates of a given type stack down the compartment; each plate holds devices across its width. Capacity = plate width ÷ device width (with clearance) per plate, plates ÷ compartment height. |
| `compensation` | APFC steps: capacitor + contactor + fuse/breaker | Like side-by-side plates with the kVAr limit per section from the construction (S8: 600 kvar / 800 mm; S4 value from the manual). |

**Meter boards** (wall-mounted): four plate types — `contactor_changeover`, `meter`, `mcb`, `terminal` — stacked in a box chosen from the catalogue as the smallest whose usable height and width hold all plates.

**Device data** (kit library, F12 fields plus two new ones):

- on the **kit**: `mounting_design` (the design above it belongs to), `module_height_mm` (the plate/module height the kit consumes in an `mccb_plates` or `busbar_fed` section; blank for side-by-side devices), `positions_per_plate` optional override for side-by-side devices;
- on the **component**: `width_mm / height_mm / depth_mm`, `mounting_type`, `clearances`, `weight_kg` (F12, already built); side-by-side capacity uses `width_mm` + clearance, MCBs use 18 mm modules.

**Placement**: `panel_layouts.cubicles[]` (rename to `sections[]` in the JSON) each with `{width, depth, access, form, faces[]}` where each face is `{side: front|rear, connection, design, plates[] or slots[]}` (a single-front section has one face) and `placements[] {kit_line_id, face, plate_index or slot, position, qty}`.

## 4. The pop-up

Opens from a panel in the costing ("Layout"). Three columns:

1. **Kits in this panel** grouped by mounting design, each showing size/module height and "placed x of y". Drag onto a section.
2. **Canvas**: tabs **Front / Rear / Side / Door / 3D**. Front is the editor (default); **Rear is an editor too when any section is double-front** (drag kits onto the back face), otherwise it shows the rear connection (lugs, cables, shrouded terminals) read-only; Side is the plan/depth view; Door shows door-mounted meters and lamps; 3D is an isometric picture for the customer. Front view at true scale Horizontal busbar chamber top, cable chamber bottom, sections side by side with their vertical busbar and cable alley drawn, plates drawn as yellow bars, devices as blue rectangles at true size, clearances dashed, partitions for the chosen form as thick lines. Dropping a kit on a section puts it on the right plate type; if there is no room the drop is refused with the reason. **Auto-arrange** places everything by the rules; the engineer adjusts. Section settings: width, connection, design, vertical busbar side, cable alley beside/behind, depth.
3. **Does it fit?** Per section: plates used / possible, positions used / capacity, kVAr used / limit; verdict; suggested fix (e.g. "make F an MCCB section, 600 mm"); **Enclosure line in the costing**: current vs from-layout (sections × widths, form uplift), and **Apply to enclosure line**, which adds/removes cubicle lines through the normal costing editor (`origin = configurator`).

Buttons: view tabs, layer chips (doors, covers, busbars, cables, tags, dimensions, rulers, 50 mm grid), zoom and snap, Auto-arrange, GA sketch (PDF), Save layout, Close. Devices are drawn with real faces (ACB with trip unit and ON/OFF, MCCB toggle, DIN modules, 96×96 meters, contactors, capacitors), busbars and droppers in copper, cables to the cable space, tags Q1…, rulers and dimension lines, and a section-capacity strip under the drawing — see the high-fidelity mockups.

## 5. Outputs

- Enclosure line(s) in the costing (cubicles by width and depth; form uplift once decision 1's rule is defined — the layout supplies the partition and shroud counts it needs).
- **GA sketch** (A4 landscape PDF) as Annexure IV: front elevation (plus rear elevation for double-front boards) with section labels, device tags (Q1, Q2 …) matching the technical-offer bullets, dimensions, title block with reference and revision. Saved with the quotation; also printable for the workshop.
- Later: plate and vertical-busbar lines priced from the layout (phase 4).

## 6. Rules and guard rails

- The layout never changes prices; it changes only enclosure lines, and only when the engineer clicks Apply.
- A costing revision carries its layout; approved costings show the layout read-only.
- Devices without dimensions or module height are placed as "unsized" placeholders and make the verdict "unknown" for that section — never "fits".
- Auto-arrange is deterministic and explained (which rule put what where).

## 7. Tests

Capacity rules per design against hand-worked examples (NPP-192: incomer ATS section, solar section, outgoer sections with 13 MCCBs, APFC 400 kVAr; a double-front KPLC meter board with MCB + meter + terminal plates on face A and changeover + terminals on face B); refuse-drop when full; Apply writes exactly the cubicle lines the verdict lists; GA sketch device tags equal the technical-offer list; NPP-192 acceptance unchanged.

## 8. Before build (data)

Module heights per kit group / kit (Alpesh, from our S4 planning manual), device dimensions (dimensions template), plate widths per section width and connection (S4 manual), default vertical busbar and cable alley widths.
