#!/usr/bin/env python3
"""Derive data/seed/kits.csv and kit-group-labour-template.csv from the kit
exports in data/raw/, then write data/seed/README.md with the full report.

Run after build_seed.py:  python3 scripts/build_kits.py

Rules (docs/reference/current-costing-and-quotation-reference.md §6):
- A row carrying only a name is a group header for the kits that follow.
- Lines are gathered by kit name wherever they sit; a kit whose lines are
  interrupted by another kit's is flagged `non-contiguous`, never repaired.
- The main device is the line marked 1 or 2 in Frame Size, else the first
  line that is not busbar, cable or controls (`main-assumed`). One per kit.
- A line whose kit name changes back to an earlier kit while the kit just
  started has only its main device is flagged `stray-line`: in the exports
  such lines are usually mislabelled (the 4P kit's cable carrying the TP
  kit's name). Nothing is repaired.
- Kits with no group header take their main device's category as group.
- The same kit name in two files with identical lines is merged; with
  different lines the later one is suffixed with its file tag (`name-collision`).
- Rating and poles are parsed from the kit name for later use by the
  technical offer; blanks are allowed.
"""
import csv
import json
import re
import sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
SEED = ROOT / "data" / "seed"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from kit_rows import iter_kit_lines, norm  # noqa: E402
from seed_readme import write_readme  # noqa: E402

FILE_TAG = {"kits-export-2026-08-20 APFC BANK.xlsx": "APFC",
            "kits-export-C&S PORTFILIO.xlsx": "C&S",
            "kits-export-2026-08-20 (3) -SAMPLE.xlsx": "SAMPLE"}
PROCESS_TYPES = ["assembly", "wiring", "busbar"]   # codes from migration 0003
POLES = {"SP": "1", "DP": "2", "TP": "3", "FP": "4", "1P": "1", "2P": "2", "3P": "3", "4P": "4"}


def key(s):
    """Kit identity: case, spaces and commas do not make a different kit
    (`5KVAR APFC -FUSE KIT` and `5KVAR APFC-FUSE KIT` are one kit)."""
    return re.sub(r"[\s,]+", "", (s or "").upper())


NOT_A_DEVICE = {"BUSBAR", "CABLE", "CONTROLS & WIRING", ""}


def rating(name):
    m = re.search(r"(\d+(?:\.\d+)?)\s*(KVAR|A)\b", name, re.I)
    return (m.group(1), m.group(2).upper()) if m else ("", "")


def poles(name):
    m = re.search(r"\b(SP|DP|TP|FP|[1-4]P)\b", name.upper())
    return POLES[m.group(1)] if m else ""


def gather():
    kits = OrderedDict()
    last_key_in_file, seen_in_file = {}, {}
    for line in iter_kit_lines(RAW):
        k = key(line["kit_name"])
        f = line["source_file"]
        line["flags"] = set()
        if k not in kits:
            kits[k] = {"name": line["kit_name"], "group": line["group"], "files": [f],
                       "lines": [], "flags": set()}
        kit = kits[k]
        if f not in kit["files"]:
            kit["files"].append(f)
        prev = last_key_in_file.get(f)
        if prev not in (None, k) and (f, k) in seen_in_file:
            kit["flags"].add("non-contiguous")
            if len(kits[prev]["lines"]) == 1 and key(line["category"]) in NOT_A_DEVICE | {"MCCB", "MCB"}:
                line["flags"].add(f"stray-line(previous kit: {kits[prev]['name']})")
        seen_in_file[(f, k)] = True
        last_key_in_file[f] = k
        kit["lines"].append(line)
    return kits


def split_collisions(kits):
    """Same name in two files: merge identical line sets, else split."""
    out = OrderedDict()
    for k, kit in kits.items():
        by_file = OrderedDict()
        for ln in kit["lines"]:
            by_file.setdefault(ln["source_file"], []).append(ln)
        first_file = next(iter(by_file))
        base = dict(kit, lines=by_file[first_file], files=[first_file])
        out[k] = base
        for f, lines in list(by_file.items())[1:]:
            same = [(key(l["part_number"]), l["quantity"]) for l in lines] == \
                   [(key(l["part_number"]), l["quantity"]) for l in base["lines"]]
            if same:
                base["files"].append(f)
                base["flags"].add("merged-duplicate")
                continue
            name = f"{kit['name']} [{FILE_TAG.get(f, 'DUP')}]"
            out[key(name)] = dict(kit, name=name, lines=lines, files=[f],
                                  flags=set(kit["flags"]) | {"name-collision"},
                                  group=lines[0]["group"])
    return out


def finish(kits, known_parts):
    rows, report = [], {"main_assumed": 0, "main_only": [], "non_contiguous": [],
                        "name_collision": [], "merged": [], "unknown_parts": [],
                        "quantity_assumed": [], "stray_lines": [], "groups": {}}
    for k, kit in kits.items():
        lines = kit["lines"]
        marked = [i for i, l in enumerate(lines) if l["marker"]]
        devices = [i for i, l in enumerate(lines) if key(l["category"]) not in NOT_A_DEVICE]
        main = marked[0] if marked else devices[0] if devices else 0
        if not marked:
            kit["flags"].add("main-assumed")
            report["main_assumed"] += 1
        if not devices:
            kit["flags"].add("no-device-line")
        if len(marked) > 1:
            kit["flags"].add("multiple-main-markers")
        if len(lines) == 1:
            kit["flags"].add("main-only")
            report["main_only"].append(kit["name"])
        group = kit["group"] or key(lines[main]["category"]).replace("-C&S", "")
        kit["group"] = group
        report["groups"].setdefault(group, 0)
        report["groups"][group] += 1
        for flag, bucket in (("non-contiguous", "non_contiguous"), ("name-collision", "name_collision"),
                             ("merged-duplicate", "merged")):
            if flag in kit["flags"]:
                report[bucket].append(kit["name"])
        r, unit = rating(kit["name"])
        for i, ln in enumerate(lines):
            flags = (set(kit["flags"]) if i == main else set()) | ln["flags"]
            if ln["flags"]:
                report["stray_lines"].append((kit["name"], ln["part_number"], sorted(ln["flags"])[0]))
            qty = ln["quantity"]
            if not qty:
                qty, _ = "1", flags.add("quantity-assumed")
                report["quantity_assumed"].append((kit["name"], ln["part_number"]))
            if key(ln["part_number"]) not in known_parts:
                flags.add("unknown-part")
                report["unknown_parts"].append((kit["name"], ln["part_number"]))
            rows.append({"kit_group": group, "kit_name": kit["name"], "rating": r, "rating_unit": unit,
                         "poles": poles(kit["name"]), "line_no": i + 1, "part_number": ln["part_number"],
                         "line_category": ln["category"], "quantity": qty,
                         "is_main_device": "yes" if i == main else "no",
                         "source_file": "; ".join(kit["files"]), "flags": " ".join(sorted(flags))})
    return rows, report


def main():
    with open(SEED / "components.csv", newline="", encoding="utf-8") as f:
        known = {key(r["part_number"]) for r in csv.DictReader(f)}
    kits = split_collisions(gather())
    rows, report = finish(kits, known)
    rows.sort(key=lambda r: (r["kit_group"], r["kit_name"], r["line_no"]))
    cols = list(rows[0].keys())
    with open(SEED / "kits.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    with open(SEED / "kit-group-labour-template.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["kit_group", "process_type", "hours", "note"])
        for g in sorted(report["groups"]):
            for p in PROCESS_TYPES:
                w.writerow([g, p, "", ""])
    report["kits"] = len(kits)
    report["lines"] = len(rows)
    (SEED / ".kits-report.json").write_text(json.dumps(report, indent=1) + "\n")
    print(f"kits.csv: {len(kits)} kits, {len(rows)} lines, {len(report['groups'])} groups")
    for k in ("main_assumed", "main_only", "non_contiguous", "name_collision", "merged",
              "unknown_parts", "quantity_assumed", "stray_lines"):
        v = report[k]
        print(f"  {k}: {v if isinstance(v, int) else len(v)}")
    write_readme(SEED)


if __name__ == "__main__":
    main()
