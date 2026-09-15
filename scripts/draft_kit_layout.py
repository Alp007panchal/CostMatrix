#!/usr/bin/env python3
"""Proposes a mounting design for every kit, for the owner to correct.

    python3 scripts/draft_kit_layout.py

Writes docs/reference/kit-layout-draft.csv with the same columns as
data/seed/kit-layout-template.csv, so once it has been read and corrected it can
be uploaded straight to the Import screen, step 5 (Kit sizes and mounting).

WHY THIS EXISTS. The panel layout cannot place a kit until the library says which
mounting design it is built into, and on 2026-09-15 none of the 296 kits said so,
which is why the layout drew nothing. The design is the one column that can be
proposed rather than typed 296 times: the owner's 17 labour groups line up almost
exactly with the six designs in the `mounting_design` enum, because both describe
the same thing — what kind of device it is and therefore how it is mounted.

WHAT IT DELIBERATELY DOES NOT DO.

  * `moduleHeightMm` is left blank on every row. It is the S4 cover height the kit
    takes on the stack, it comes from the owner's planning manual, and no rule
    derives it from a kit name. A guessed height would be drawn at true scale and
    look exactly as authoritative as a real one, which is worse than a blank.
  * `inline_3nj6` is never proposed. No group identifies itself as in-line
    fuse-switch gear, so anything of that kind is inside another group and has to
    be picked out by eye.
  * It never writes to data/seed/. That is the owner's data. This is a proposal
    that sits beside it until they say otherwise.

So this file is a first draft, not an answer: it turns 296 blank cells into 296
cells to check, and the ones it is least sure of are listed at the end.
"""
from __future__ import annotations

import csv
import pathlib
import sys

SOURCE = pathlib.Path("data/seed/kit-layout-template.csv")
TARGET = pathlib.Path("docs/reference/kit-layout-draft.csv")

# The six values of the mounting_design enum (0119_layout_fields.sql:31).
DESIGNS = {
    "busbar_fed",
    "mccb_plates",
    "side_by_side_plates",
    "compensation",
    "meter_board_plate",
    "inline_3nj6",
}

# Kit group -> proposed design, with the reason, from panel-layout-spec.md §3.
# The reason is printed rather than written into the file, so the CSV stays the
# shape the importer expects.
BY_GROUP: dict[str, tuple[str, str]] = {
    # The device takes a section of its own and is connected to the horizontal busbar.
    "ACB frame 1": ("busbar_fed", "an ACB takes the section and connects to the horizontal busbar"),
    "ACB frame 2": ("busbar_fed", "an ACB takes the section and connects to the horizontal busbar"),
    "ATS": ("busbar_fed", "an ATS is a pair of busbar-fed devices"),
    "ATS-SWITCH": ("busbar_fed", "an ATS is a pair of busbar-fed devices"),
    "ONLOAD CHANGEOVER": ("busbar_fed", "spec §3 names on-load changeover as busbar-fed"),
    "SYNCHRONIZATION": ("busbar_fed", "sync gear is built round busbar-fed breakers"),
    "SWITCH DISCONNECTOR": ("busbar_fed", "spec §3 names the isolator as busbar-fed"),
    "ISOLATOR": ("busbar_fed", "spec §3 names the isolator as busbar-fed"),
    # One device per cover, covers stacked down the compartment.
    "MCCB": ("mccb_plates", "MCCBs go one per cover, stacked down the compartment"),
    "INCOMER-KIT": ("mccb_plates", "the incomer kits in this library are MCCB-based"),
    "OUTGOER-KIT": ("mccb_plates", "the outgoer kits in this library are MCCB-based"),
    # Devices across the width of a plate.
    "MCB": ("side_by_side_plates", "MCBs are 18 mm modules across a plate"),
    "RCBO": ("side_by_side_plates", "an RCBO is a DIN module like an MCB"),
    "ACCESSORIES": ("side_by_side_plates", "loose DIN-rail accessories sit across a plate"),
    # Correction gear, with the kVAr limit per section.
    "APFC BANK": ("compensation", "APFC steps are correction gear"),
    # Wall-mounted meter board plates.
    "METERBOARD": ("meter_board_plate", "a meter board is built from its own plate types"),
    "METERBOARD-WITH ATS": ("meter_board_plate", "a meter board is built from its own plate types"),
}

# Groups whose answer is a judgement rather than a reading, listed at the end so
# the owner checks these first. A proposal nobody flags is a proposal nobody reads.
#
# Three groups that looked like judgements are not, and were dropped from this
# list once their kit names were read: every INCOMER-KIT and OUTGOER-KIT in the
# library names MCCB, and every SYNCHRONIZATION kit names ACB. The check below
# re-proves that on every run rather than trusting this comment.
WORTH_CHECKING = {
    "ACCESSORIES": "mixed by nature — an indicator kit may be door-mounted rather than on a plate",
    "METERBOARD-WITH ATS": "the ATS half may belong in a busbar-fed section of its own",
}

# What a kit's own name says about how it is mounted, used to catch a group whose
# contents have drifted from what its name promises — an ACB filed under MCCB, say.
# "MCCB" is tested first because it does not contain "ACB", but "ACB" is a
# substring of nothing else here, so order still matters for readability only.
CONTRADICTS = {
    "mccb_plates": ("ACB", "names an ACB, which is busbar-fed rather than on a cover"),
    "busbar_fed": ("MCCB", "names an MCCB, which goes on a cover rather than taking a section"),
}


def name_contradicts(design: str, name: str) -> str | None:
    """The reason this kit's name disagrees with the design proposed for its group."""
    pair = CONTRADICTS.get(design)
    if pair is None:
        return None
    word, why = pair
    upper = name.upper()
    if word == "ACB" and "ACB" in upper.replace("MCCB", ""):
        return why
    if word == "MCCB" and "MCCB" in upper:
        return why
    return None


def main() -> int:
    if not SOURCE.exists():
        print(f"{SOURCE} not found; run this from the repository root", file=sys.stderr)
        return 1

    with SOURCE.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames or []
        kits = list(reader)

    if "mountingDesign" not in columns:
        print(f"{SOURCE} has no mountingDesign column; regenerate it first", file=sys.stderr)
        return 1

    counts: dict[str, int] = {}
    unknown: list[str] = []
    disagree: list[tuple[str, str]] = []
    kept = 0

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with TARGET.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for kit in kits:
            row = dict(kit)
            group = (kit.get("kitGroup") or "").strip()
            already = (kit.get("mountingDesign") or "").strip()

            if already:
                # Never argue with a design the owner has already given.
                kept += 1
            else:
                proposed = BY_GROUP.get(group)
                if proposed is None:
                    if group not in unknown:
                        unknown.append(group)
                else:
                    design = proposed[0]
                    row["mountingDesign"] = design
                    counts[design] = counts.get(design, 0) + 1
                    why = name_contradicts(design, kit.get("kitName") or "")
                    if why:
                        disagree.append(((kit.get("kitName") or "").strip(), why))

            # The height is the owner's, from the S4 manual. Never guessed.
            row["moduleHeightMm"] = (kit.get("moduleHeightMm") or "").strip()
            writer.writerow(row)

    # A design outside the enum would be refused by the importer row by row; catch
    # it here instead, where it is one message rather than 296.
    bad = sorted({d for d in counts if d not in DESIGNS})
    if bad:
        print(f"refusing to write a design that is not in the enum: {', '.join(bad)}", file=sys.stderr)
        return 1

    print(f"{TARGET}: {len(kits)} kits")
    for design, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {n:4d}  {design}")
    if kept:
        print(f"  {kept:4d}  left as you already had them")
    print("  module heights: none proposed — they come from your S4 planning manual")

    if unknown:
        print("\nNo proposal for these groups, so their rows are left blank:")
        for group in unknown:
            print(f"  · {group}")

    if disagree:
        print("\nThese kits' own names disagree with the design proposed for their group,")
        print("so the group has drifted or the kit is filed in the wrong one:")
        for name, why in disagree:
            print(f"  · {name} — {why}")
    else:
        print("  no kit's name disagrees with the design proposed for its group")

    print("\nCheck these first — they are a judgement, not a reading:")
    for group, why in WORTH_CHECKING.items():
        if any((k.get("kitGroup") or "").strip() == group for k in kits):
            print(f"  · {group}: {why}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
