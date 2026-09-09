#!/usr/bin/env python3
"""Derive data/seed/components.csv and category-map.csv from data/raw/.

Standard library only. Run from anywhere:  python3 scripts/build_seed.py
Prints a validation report; the same report is written to data/seed/README.md
by build_kits.py (run second), so the two scripts must both be run.

Rules (see docs/reference/current-costing-and-quotation-reference.md §6):
- Sources are merged in priority order; the first file to name a part wins and
  a differing price elsewhere is flagged, never silently replaced.
- A row with no part number but a description becomes a placeholder part with
  a synthetic PLC- number. A row with neither is dropped.
- A blank or zero price is allowed and flagged `no-price`.
- Busbar rows get kg per metre from the copper table (8.96 g/cm3 x section).
- Part numbers used by kits but absent from the catalogue are added as
  placeholders flagged `from-kits`, so every kit can be imported.
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
from kit_rows import iter_kit_lines  # noqa: E402

SOURCES = [
    "component-catalog-ALL.csv",
    "component-C&S.csv",
    "component-catalog-ENCLOSURE.csv",
    "component-catalog-BUSBAR AND CABLES.csv",
    "component-catalog-SAMPLE.csv",
    "component-catalog-ACB.csv",
]

# raw category (upper-cased) -> app BOM category. The four codes are the ones
# seeded by supabase/migrations/0003_library.sql.
CATEGORY_MAP = {
    "ACB": "switchgear", "MCCB": "switchgear", "MCB": "switchgear", "APFC": "switchgear",
    "CT": "switchgear", "METERING": "switchgear", "SPD": "switchgear", "LED": "switchgear",
    "CONTACTOR": "switchgear", "ISOLATOR": "switchgear", "ATS SWITCH": "switchgear",
    "BYPASS SWITCH": "switchgear", "ONLOAD CHANGEOVER": "switchgear",
    "SWITCH DISCONNECTOR": "switchgear", "CONTROLS": "switchgear", "RCBO": "switchgear",
    "RCCB": "switchgear", "INTERLOCK": "switchgear",
    "BUSBAR": "busbar", "BUSBAR-LINK": "busbar", "CABLE": "busbar",
    "SINOVA MCCB ACCESSORIES": "accessories_hardware",
    "ACB SINOVA ACCESSORIES": "accessories_hardware",
    "MCCB ACCESSORIES": "accessories_hardware",
    "CONTACTOR ACCESSORIES": "accessories_hardware",
    "ENCLOSURE": "enclosure_parts",
}
COPPER_DENSITY_KG_PER_MM2_M = 8.96 / 1000  # 8.96 g/cm3 -> kg per (mm2 x m)


def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def key(s):
    return norm(s).upper()


def slug(s):
    return re.sub(r"[^A-Z0-9]+", "-", key(s)).strip("-")[:40]


def kg_per_metre(part):
    m = re.fullmatch(r"(\d+)\s*X\s*(\d+)\s*MM", key(part))
    if not m:
        return ""
    w, t = int(m.group(1)), int(m.group(2))
    return f"{w * t * COPPER_DENSITY_KG_PER_MM2_M:.3f}"


def read_raw(name):
    with open(RAW / name, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def is_section_header(row):
    """Heading rows: `BUSBAR,,,,` or `CABLE,CABLE,,,` in the busbar file, and
    `,3VJ11 SERIES,,,` in the main catalogue. No price, no category, and the
    description is blank or repeats the part number."""
    if norm(row["priceEur"]) not in ("", "0"):
        return False
    pn, desc = key(row["partNumber"]), key(row["description"])
    if norm(row["category"]) != "" and pn != "":
        return False
    # A row with no part number and no price is a heading, whatever its
    # category column says: real placeholder parts only arrive from the kits.
    return (pn != "" and desc in ("", pn)) or (pn == "" and desc != "")


def build():
    parts = OrderedDict()        # key -> record
    report = {"dropped_empty": [], "headings": [], "duplicates": [], "repeats": [], "price_differs": [],
              "placeholders": [], "no_price": [], "category_guessed": [],
              "currency_assumed": [], "from_kits": []}
    for name in SOURCES:
        section = ""
        for i, row in enumerate(read_raw(name), start=2):
            pn, desc = norm(row["partNumber"]), norm(row["description"])
            if is_section_header(row):
                section = key(pn or desc)
                report["headings"].append((pn or desc, name, i))
                continue
            if not pn and not desc:
                report["dropped_empty"].append((name, i))
                continue
            if not pn:
                pn = "PLC-" + slug(desc)
                placeholder = True
            else:
                placeholder = False
            k = key(pn)
            price = norm(row["priceEur"])
            price_num = float(price) if price not in ("", "0", "0.0") else None
            if k in parts:
                kept = parts[k]
                if price_num is not None and kept["purchase_price"] not in ("", f"{price_num:g}"):
                    kept["flags"].add(f"price-differs:{name}={price_num:g}")
                    report["price_differs"].append((pn, kept["source_file"], kept["purchase_price"], name, price))
                elif kept["source_file"] == name:
                    report["duplicates"].append((pn, name, i))
                else:
                    report["repeats"].append((pn, name))
                continue
            raw_cat = key(row["category"]) or section
            cat_key = raw_cat.replace("_", " ")
            cat_key = {"BUSBAR-LINK": "BUSBAR-LINK"}.get(cat_key, cat_key)
            bom = CATEGORY_MAP.get(cat_key)
            flags = set()
            if bom is None:
                bom = "switchgear"
                flags.add("category-guessed")
                report["category_guessed"].append((pn, raw_cat or "(blank)", name))
            currency = key(row["purchaseCurrency"])
            if price_num is None:
                flags.add("no-price")
                report["no_price"].append((pn, desc, name))
                currency = currency or ""
            elif not currency:
                currency = "EUR"
                flags.add("currency-assumed")
                report["currency_assumed"].append((pn, name))
            if placeholder:
                flags.add("placeholder")
                report["placeholders"].append((pn, desc, name))
            is_busbar = cat_key == "BUSBAR"
            parts[k] = {
                "part_number": pn,
                "name": desc or pn,
                "category": raw_cat or "",
                "bom_category": bom,
                "brand": norm(row["brand"]),
                "unit": "m" if cat_key in ("BUSBAR", "CABLE") else "pcs",
                "purchase_price": f"{price_num:g}" if price_num is not None else "",
                "purchase_currency": currency,
                "kg_per_metre": kg_per_metre(pn) if is_busbar else "",
                "is_enclosure_cubicle": "yes" if cat_key == "ENCLOSURE" else "no",
                "is_placeholder": "yes" if placeholder else "no",
                "source_file": name,
                "flags": flags,
            }
    # Parts that kits reference but the catalogue lacks.
    for line in iter_kit_lines(RAW):
        k = key(line["part_number"])
        if not k or k in parts:
            continue
        cat_key = key(line["category"]).replace("-C&S", "")
        bom = CATEGORY_MAP.get(cat_key, "switchgear")
        flags = {"placeholder", "from-kits", "no-price"}
        if cat_key not in CATEGORY_MAP:
            flags.add("category-guessed")
        parts[k] = {
            "part_number": norm(line["part_number"]),
            "name": norm(line["description"]) or norm(line["part_number"]),
            "category": cat_key, "bom_category": bom, "brand": "",
            "unit": "m" if cat_key in ("BUSBAR", "CABLE") else "pcs",
            "purchase_price": "", "purchase_currency": "",
            "kg_per_metre": kg_per_metre(line["part_number"]) if cat_key == "BUSBAR" else "",
            "is_enclosure_cubicle": "no", "is_placeholder": "yes",
            "source_file": line["source_file"], "flags": flags,
        }
        report["from_kits"].append((norm(line["part_number"]), cat_key, line["source_file"]))
    return parts, report


def write_components(parts):
    cols = ["part_number", "name", "category", "bom_category", "brand", "unit",
            "purchase_price", "purchase_currency", "kg_per_metre",
            "is_enclosure_cubicle", "is_placeholder", "source_file", "flags"]
    rows = sorted(parts.values(), key=lambda r: (r["bom_category"], r["category"], r["brand"], r["part_number"]))
    with open(SEED / "components.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, lineterminator="\n")
        w.writeheader()
        for r in rows:
            out = dict(r)
            out["flags"] = " ".join(sorted(r["flags"]))
            w.writerow(out)
    return len(rows)


def write_category_map(parts):
    seen = {}
    for r in parts.values():
        c = r["category"] or "(blank)"
        seen.setdefault(c, {"raw_category": c, "bom_category": r["bom_category"],
                            "is_busbar": "yes" if c == "BUSBAR" else "no",
                            "is_enclosure_cubicle": "yes" if c == "ENCLOSURE" else "no",
                            "parts": 0})
        seen[c]["parts"] += 1
    with open(SEED / "category-map.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["raw_category", "bom_category", "is_busbar",
                                          "is_enclosure_cubicle", "parts"], lineterminator="\n")
        w.writeheader()
        for c in sorted(seen):
            w.writerow(seen[c])


def main():
    SEED.mkdir(parents=True, exist_ok=True)
    parts, report = build()
    n = write_components(parts)
    write_category_map(parts)
    summary = {
        "components": n,
        "placeholders": sum(1 for p in parts.values() if p["is_placeholder"] == "yes"),
        "no_price": sum(1 for p in parts.values() if "no-price" in p["flags"]),
        "by_bom_category": {c: sum(1 for p in parts.values() if p["bom_category"] == c)
                            for c in sorted({p["bom_category"] for p in parts.values()})},
        "report": {k: v for k, v in report.items()},
    }
    (SEED / ".components-report.json").write_text(json.dumps(summary, indent=1) + "\n")
    print(f"components.csv: {n} parts "
          f"({summary['placeholders']} placeholders, {summary['no_price']} without a price)")
    for k, v in report.items():
        print(f"  {k}: {len(v)}")


if __name__ == "__main__":
    main()
