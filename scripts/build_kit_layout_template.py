#!/usr/bin/env python3
"""Builds data/seed/kit-layout-template.csv from data/seed/kit-labour-template.csv.

One row per kit, its group, name and main device already filled in, the layout
columns blank for the owner to complete: which mounting design the kit belongs
to, the module height it takes on the stack, how many fit across a plate, and
the footprint it occupies where that is not simply its main device (F12).

    python3 scripts/build_kit_layout_template.py

Import it on the Import screen, step 5 (Kit sizes and mounting). Re-running keeps
anything already typed: the file is the owner's to fill in over time, so it is
merged, never overwritten blind.

The mounting designs, and what belongs to each (panel-layout-spec.md §3):

    busbar_fed           ACB, ATS pair, on-load changeover, isolator, AVR bypass
    mccb_plates          MCCBs, one per cover, stacked down the compartment
    side_by_side_plates  MCBs, contactors, meters, terminals, small isolators
    compensation         APFC steps
    meter_board_plate    the plate types of a wall-mounted meter board
    inline_3nj6          in-line fuse-switch disconnectors, 50 mm pitch

Module heights are on the 50 mm grid (the S4 cover table: 150-800 mm).
"""
from __future__ import annotations

import csv
import pathlib
import sys

SEED = pathlib.Path("data/seed")
SOURCE = SEED / "kit-labour-template.csv"
TARGET = SEED / "kit-layout-template.csv"

COLUMNS = [
    "kitGroup", "kitName", "mainPart",
    "mountingDesign", "moduleHeightMm", "positionsPerPlate",
    # F12, the same three the kit form shows beside them.
    "footprintWMm", "footprintHMm", "footprintDMm",
]
FILLED = {"kitGroup", "kitName", "mainPart"}


def read_existing() -> dict[str, dict[str, str]]:
    if not TARGET.exists():
        return {}
    with TARGET.open(newline="", encoding="utf-8-sig") as f:
        return {row["kitName"]: row for row in csv.DictReader(f) if row.get("kitName")}


def main() -> int:
    if not SOURCE.exists():
        print(f"{SOURCE} not found; run this from the repository root", file=sys.stderr)
        return 1
    kept = read_existing()

    with SOURCE.open(newline="", encoding="utf-8-sig") as f:
        kits = list(csv.DictReader(f))

    written = 0
    with TARGET.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        for kit in kits:
            name = (kit.get("kitName") or "").strip()
            if not name:
                continue
            row = {c: "" for c in COLUMNS}
            row.update({k: v for k, v in kept.get(name, {}).items() if k in COLUMNS and v})
            row["kitName"] = name
            row["kitGroup"] = (kit.get("labourGroup") or kit.get("kitGroup") or "").strip()
            row["mainPart"] = (kit.get("mainPart") or "").strip()
            writer.writerow(row)
            written += 1

    done = sum(1 for r in kept.values() if (r.get("mountingDesign") or "").strip())
    print(f"{TARGET}: {written} kits, {done} already given a mounting design")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
