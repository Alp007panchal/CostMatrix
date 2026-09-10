# Trial run — rebuild NPP-192 Option 1 in CostMatrix

Purpose: build the Triclover 1600 A main LV board in the live app from the seeded kits, approve it, release the quotation PDF and BOMs, and compare with the original (`NPP192LV BOARD TRICLOVER INDUSTRIESREV1.pdf`). Everything below comes from the `OPTION1` sheet of the costing workbook, translated into kit names exactly as they appear in the library. Tick each block as you go.

## A. Header

| Field | Value |
|---|---|
| Customer | TRICLOVER LIMITED |
| Project / title | Supply only of LV switchboards |
| Panel line item 1 | `1600A MAIN LV BOARD`, qty 1, UOM PC |
| Board tag (if asked) | MBD-B |
| Enclosure attributes (if asked) | Free standing, Form 3B, IP31, front access, bottom cable entry |

## B. Kits — add to panel line item 1

| Section | Kit name (exact) | Qty |
|---|---|---|
| Incomer (KPLC) | `1600A 4P WITHDRAWABLE MOTORIZED ACB with changeover accessories-KIT` | 1 |
| Incomer (GEN) | `800A 4P WITHDRAWABLE MOTORIZED ACB-WITH ACCESSORIES-KIT` | 2 |
| Solar incoming | `1600A 3P FIXED MANUAL ACB-KIT` | 1 |
| Indication | `INDICATOR KIT` | 5 |
| Surge protection | `SPD TYPE 1+2-KIT` | 1 |
| APFC 400 kVAr | `50KVAR APFC-FUSE KIT` | 4 |
| | `25KVAR APFC-FUSE KIT` | 4 |
| | `12.5KVAR APFC-FUSE KIT` | 6 |
| | `5KVAR APFC-FUSE KIT` | 5 |
| APFC incomer | `800A 3P FIXED MANUAL ACB-KIT` | 1 |
| Outgoers | `630A,TP,MCCB, Adjustable, 36kA-OUTGOER-KIT` | 1 |
| | `400A,TP,MCCB, Adjustable, 36kA-OUTGOER-KIT` | 3 |
| | `250A,TP,MCCB, Adjustable, 25KA-KIT` | 6 |
| | `160A,TP,MCCB, Adjustable, 25KA-KIT` | 3 |
| | `125A,TP,MCCB, Adjustable, 25KA-KIT` | 3 |

The panel card should show "APFC bank: 400 kVAr in steps" once the four APFC kits are in.

## C. Loose components — add to the same panel line item

| Purpose | Part number | Qty |
|---|---|---|
| ATS controller | `LOGO` | 1 |
| Controls and wiring lump sum | `CONTROLS & WIRING` | 1 |
| CTs for changeover and metering | `1600A/5` | 8 |
| | `800A/5` | 14 |
| Multifunction meters | `LM1340` | 3 |
| Extra 6 A MCBs (22 in the workbook, 15 come in the indicator kits) | `5TJ6106-7` | 7 |
| APFC controller | `RPCF-16` | 1 |
| Enclosure cubicles (3,500 + 800 mm wide, 2,100 high, 800 deep) | `800(W)X800(D)X2100(H)-2B` | 5 |
| | `400(W)X800(D)X2100(H)-2B` | 1 |

Not in the catalogue, so they cannot be added yet — note whether the app lets you type a one-off line: 2 × synchro-check relays (KES 35,000 each in the workbook), timers and relays (6 × KES 3,000), 2 × fan and filter FK5526-230 (KES 7,875 each).

## D. Settings to use for the trial

| Setting | Value |
|---|---|
| Enclosure uplift for form 3B | 0 % for now (rule not decided yet) — note where the app asks for it |
| Labour | rates and hours are not filled yet, so labour will show 0 — expected |
| Profit margin | 10 % of selling price |
| Negotiation margin | 0 % |
| Rounding | up to KES 100 (default) |
| VAT | 16 % |

## E. Workflow to exercise

1. Save as draft → submit → approve (as approver) → release the quotation PDF.
2. Download the PDF and the four BOMs (switchgear, busbar, accessories & hardware, enclosure parts).
3. Make one change after approval (e.g. outgoer qty) and check it creates REV1 and keeps REV0 read-only.

## F. What to compare with the original

| Item | Original (workbook / PDF) | App |
|---|---|---|
| Switchgear subtotal | 2,520,637.80 | |
| Busbar & cable subtotal | 1,236,360.00 | |
| Enclosure subtotal | 408,000.00 | |
| Material total | 4,164,997.80 | |
| Panel price ex-VAT (with legacy 25 % labour uplift) | 5,784,800 | |
| VAT 16 % | 925,568.00 | |
| Total incl. VAT | 6,710,368.00 | |

Expect the app's material to be lower than the workbook (stale prices in the workbook, about 134,000, itemised in `docs/reference/npp192-acceptance-from-seed.md`), the enclosure to differ (cubicles instead of 102 × 4,000), and labour to be 0 until hours are filled. What matters in this trial is that every screen works, the PDF looks like the original's four annexures, and you note anything missing or awkward.

## G. Notes — things missing or awkward (fill in as you go)

- 
