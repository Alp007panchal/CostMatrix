"""Read the kit-export workbooks into plain kit lines. Shared by both scripts."""
import re
from pathlib import Path

from xlsx_reader import read_sheet

KIT_FILES = [
    "kits-export-2026-08-20 (3).xlsx",
    "kits-export-2026-08-20 APFC BANK.xlsx",
    "kits-export-C&S PORTFILIO.xlsx",
    # "kits-export-2026-08-20 (3) -SAMPLE.xlsx" is a sample of the format only;
    # its two ATS kits differ from the main file's and are not imported.
]
MAIN_MARKERS = {"1", "2"}


def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def iter_kit_lines(raw_dir):
    """Yield dicts: source_file, row, group, kit_name, category, marker,
    description, part_number, quantity. Group-header rows set `group` for the
    lines that follow; the header row and blank rows are skipped."""
    for name in KIT_FILES:
        path = Path(raw_dir) / name
        if not path.exists():
            continue
        group = ""
        for idx, cells in enumerate(read_sheet(path), start=1):
            if idx == 1 or not cells:
                continue
            if set(cells) == {"A"}:
                group = norm(cells["A"])
                continue
            if "F" not in cells:
                continue
            marker = norm(cells.get("C", ""))
            yield {
                "source_file": name,
                "row": idx,
                "group": group,
                "kit_name": norm(cells.get("A", "")),
                "category": norm(cells.get("B", "")),
                "marker": marker if marker in MAIN_MARKERS else "",
                # The APFC workbook puts the part description in the Frame Size column.
                "description": "" if marker in MAIN_MARKERS else marker,
                "part_number": norm(cells["F"]),
                "quantity": norm(cells.get("G", "")),
            }
