# Labour hours worksheet — the 51 figures the app is waiting for

**Why this exists.** Every kit in the library resolves to **zero hours**, so every costing prices
its material correctly and charges **nothing** for assembly, wiring or busbar time. Nothing in the
app is broken; it is waiting for these numbers. Fill them in and every costing starts pricing
labour the way the reference document says it should — hours × the rate per process — instead of
the percentage-of-material the spreadsheets used.

**51 figures: 17 groups × 3 processes.** An hour spent here is the difference between a quotation
that covers its own build cost and one that does not.

## How to fill it in

Either way works, and blank cells are skipped, so you can do it in passes:

- **On screen** — *Kit groups* (from the Kits page). Type the three figures against a group and
  press save. Best for doing a few at a time.
- **In one file** — `data/seed/kit-group-labour-template.csv`, then **Import → step 3, Kit group
  hours**. It previews before it writes. Best for doing the lot in one sitting.

**Hours are for one kit, not for a panel.** The app multiplies by how many of that kit the panel
carries, and then by the panel quantity. So the figure against *ACB frame 1* is the time for one
800 A ACB kit, not for a board full of them.

**A kit can override its group.** If one kit in a group is unusual, give it its own hours on the
kit itself; the group figure covers the rest. Do that after the groups, not instead of them.

## What each process covers

| Process | What goes in it |
|---|---|
| **Panel assembly** | Mounting the device, its plate or cover, mechanical fixing, labelling, the shroud and partition work that comes with it |
| **Wiring** | Power and control wiring for that kit — CTs, trip circuits, indication, interlocks, terminating at the terminals |
| **Busbar fabrication** | Cutting, bending, drilling, plating and bolting the copper that belongs to the kit, and its droppers |

If a kit genuinely takes no time in a process, **write 0** rather than leaving it blank. Blank
means "not answered yet" and the costing keeps charging nothing; 0 means "answered: none".

## The 17 groups, biggest first

Filling the **top four covers 183 of the 296 kits** — about three in every five. If you only have
twenty minutes, do those and the rest can follow.

| # | Kit group | Kits | An example kit | Assembly | Wiring | Busbar |
|---|---|---:|---|---|---|---|
| 1 | MCB | 59 | 6A SP-10KA-KIT | | | |
| 2 | ACB frame 1 | 44 | 800A 3P FIXED MANUAL ACB-KIT | | | |
| 3 | MCCB | 44 | 20A,TP,MCCB, Adjustable, 25KA-KIT | | | |
| 4 | ACB frame 2 | 36 | 2000A 3P FIXED MANUAL ACB-KIT | | | |
| 5 | ONLOAD CHANGEOVER | 13 | 3150A FP Onload C/O Switch W/Out Encl-KIT | | | |
| 6 | SWITCH DISCONNECTOR | 13 | 3150A TP Switch Disconnector (1+2)-KIT | | | |
| 7 | INCOMER-KIT | 12 | 320A,TP,MCCB, Adjustable, 25kA-INCOMER-KIT | | | |
| 8 | OUTGOER-KIT | 12 | 320A,TP,MCCB, Adjustable, 25kA-OUTGOER-KIT | | | |
| 9 | ATS | 12 | 800A 4P WITHDRAWABLE MOTORIZED ACB-ATS KIT | | | |
| 10 | SYNCHRONIZATION | 12 | 800A 4P WITHDRAWABLE MOTORIZED ACB-SYNC KIT | | | |
| 11 | APFC BANK | 10 | 50KVAR APFC-FUSE KIT | | | |
| 12 | ATS-SWITCH | 9 | ATS 630A 4P Bottom Incomer & Top Outgoing-KIT | | | |
| 13 | METERBOARD | 6 | STANDARD METERBOARD-SINGLE PHASE | | | |
| 14 | METERBOARD-WITH ATS | 6 | STANDARD METERBOARD-SINGLE PHASE-ATS | | | |
| 15 | ACCESSORIES | 3 | SPD TYPE 1+2-KIT | | | |
| 16 | RCBO | 3 | 16A DP RCBO 30mA-KIT | | | |
| 17 | ISOLATOR | 2 | 63A TP MCB Isolator-KIT | | | |

Two that are worth a moment's thought rather than a quick number, because their name hides how
much work they are:

- **ACB frame 1 and frame 2 are split on purpose.** A frame 2 breaker is not a frame 1 breaker
  with a bigger number on it; if the assembly time is the same for both, that is worth being sure
  of rather than assuming.
- **SYNCHRONIZATION and ATS** carry the control wiring, not just the breakers. If your wiring
  figure for them looks like the plain ACB figure, it is probably missing the control side.

## Where the hourly rates come from

These are **hours**, not money. What an hour costs is set once per company on **Rates**, one rate
per process, and a costing freezes both the hours and the rates at the moment it is made — so
changing a rate later never moves a quotation you have already sent.

Worth checking while you are here: if a rate is zero, the hours are recorded and still cost
nothing. The check on the costing screen tells those two cases apart, because the fix is
different — a missing rate is the *Rates* screen, and a new revision, since a rate set after a
costing was created never reaches it.

---

*The groups, counts and examples above come from `data/seed/kit-group-labour-template.csv`, which
is the file the importer reads. If the library gains a group, regenerate that file and this table
is out of date by one row.*
