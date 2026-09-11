/**
 * The worked example for the draft task (AI spec §7): how the NPP-192 technical
 * offer — a 1600 A main LV board for Triclover — maps to this company's kits.
 * Taken from docs/trials/npp192-trial-build-sheet.md §B, kept as data so it can
 * be edited without touching code.
 */

export const NPP192_EXAMPLE = `Technical offer: "1600A MAIN LV BOARD, free standing, Form 3B, IP31, front access, bottom cable entry; incomer 1600 A 4P motorised ACB from KPLC with changeover to two 800 A generator ACBs; 1600 A solar incomer; 400 kVAr APFC; 16 outgoers."

Parameters: incomer_a 1600; sources mains, gen, solar; changeover ats; form 3B; ip IP31; access front; cable_entry bottom; apfc_kvar 400.

Kits (name exactly as in the library — quantity):
  Incomer (KPLC): 1600A 4P WITHDRAWABLE MOTORIZED ACB with changeover accessories-KIT — 1
  Incomer (GEN): 800A 4P WITHDRAWABLE MOTORIZED ACB-WITH ACCESSORIES-KIT — 2
  Solar incoming: 1600A 3P FIXED MANUAL ACB-KIT — 1
  Indication: INDICATOR KIT — 5
  Surge protection: SPD TYPE 1+2-KIT — 1
  APFC bank: 50KVAR APFC-FUSE KIT — 4; 25KVAR APFC-FUSE KIT — 4; 12.5KVAR APFC-FUSE KIT — 6; 5KVAR APFC-FUSE KIT — 5
  APFC incomer: 800A 3P FIXED MANUAL ACB-KIT — 1
  Outgoers: 630A,TP,MCCB, Adjustable, 36kA-OUTGOER-KIT — 1; 400A,TP,MCCB, Adjustable, 36kA-OUTGOER-KIT — 3; 250A,TP,MCCB, Adjustable, 25KA-KIT — 6; 160A,TP,MCCB, Adjustable, 25KA-KIT — 3; 125A,TP,MCCB, Adjustable, 25KA-KIT — 3

Loose components: LOGO (ATS controller) — 1; 1600A/5 CTs — 8; 800A/5 CTs — 14; LM1340 meters — 3; RPCF-16 APFC controller — 1; cubicles 800(W)X800(D)X2100(H)-2B — 5 and 400(W)X800(D)X2100(H)-2B — 1.

Unresolved (not in the catalogue, proposed as placeholders): 2 × synchro-check relays; timers and relays; 2 × fan and filter FK5526-230.`
