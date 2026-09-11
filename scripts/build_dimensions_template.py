#!/usr/bin/env python3
"""Builds data/seed/dimensions-template.csv from data/seed/components.csv.

One row per catalogue part, its part number and description already filled in,
every measurement blank for the owner to complete. Import it on the Import
screen, step 4 (Dimensions); it touches only the F12 columns, never a price.

    python3 scripts/build_dimensions_template.py

Re-running it keeps any measurements already typed into the existing template:
the file is the owner's to fill in, so it is merged, never overwritten blind.
"""
from __future__ import annotations

import csv
import pathlib
import sys

SEED = pathlib.Path("data/seed")
SOURCE = SEED / "components.csv"
TARGET = SEED / "dimensions-template.csv"

COLUMNS = [
    "partNumber", "description", "category",
    "widthMm", "heightMm", "depthMm", "mountingType", "weightKg",
    "clearanceTopMm", "clearanceBottomMm", "clearanceLeftMm", "clearanceRightMm",
    # Enclosure cubicles only.
    "usableWMm", "usableHMm", "usableDMm",
    "busbarChamberWMm", "busbarChamberHMm", "cableChamberWMm", "cableChamberHMm",
    "formOfSeparation",
]
FILLED = {"partNumber", "description", "category"}


def read_existing() -> dict[str, dict[str, str]]:
    if not TARGET.exists():
        return {}
    with TARGET.open(newline="", encoding="utf-8-sig") as f:
        return {row["partNumber"]: row for row in csv.DictReader(f) if row.get("partNumber")}


def main() -> int:
    if not SOURCE.exists():
        print(f"{SOURCE} not found; run this from the repository root", file=sys.stderr)
        return 1
    kept = read_existing()

    with SOURCE.open(newline="", encoding="utf-8-sig") as f:
        parts = list(csv.DictReader(f))

    written = 0
    with TARGET.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        for part in parts:
            number = (part.get("partNumber") or "").strip()
            if not number:
                continue
            row = {c: "" for c in COLUMNS}
            row.update({k: v for k, v in kept.get(number, {}).items() if k in COLUMNS and v})
            row["partNumber"] = number
            row["description"] = (part.get("description") or "").strip()
            row["category"] = (part.get("category") or "").strip()
            writer.writerow(row)
            written += 1

    measured = sum(1 for r in kept.values() if (r.get("widthMm") or "").strip())
    print(f"{TARGET}: {written} parts, {measured} already measured")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
