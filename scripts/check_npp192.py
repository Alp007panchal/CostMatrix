"""Rebuild the NPP-192 Option 1 material subtotals from the derived seed.

Reads the OPTION1 sheet of docs/reference/costing-NPP-192-REV1.xlsm line by
line, prices each line the way the app will (catalogue EUR x 200 KES for
priced parts, kg per metre x 3,000 KES/kg for busbar) and compares with the
workbook figure. Lines the catalogue does not carry keep the workbook price
(they will be typed in as placeholder parts). The printed differences are
§6.2 of docs/reference/current-costing-and-quotation-reference.md.

Usage: python3 scripts/check_npp192.py [SHEET]
"""
import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from xlsx_reader import read_sheet  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "docs" / "reference" / "costing-NPP-192-REV1.xlsm"
KES_PER_EUR = 113.0
LANDED_FACTOR = 1.769912          # 113 x 1.769912 = 200.0001
COPPER_RATE = 3000.0              # KES per kg


def key(s):
    return re.sub(r"\s+", " ", (s or "").strip()).upper()


def load_seed():
    with open(ROOT / "data" / "seed" / "components.csv", newline="", encoding="utf-8") as f:
        return {key(r["part_number"]): r for r in csv.DictReader(f)}


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def app_price(part):
    """KES unit price the app will compute for a seed part, or None."""
    if part is None:
        return None, ""
    if part["kg_per_metre"]:
        return round(float(part["kg_per_metre"]) * COPPER_RATE, 2), "kg x rate"
    if part["purchase_price"]:
        return round(float(part["purchase_price"]) * KES_PER_EUR * LANDED_FACTOR, 2), "EUR x 200"
    return None, ""


def run(sheet="OPTION1"):
    seed = load_seed()
    section, sections, lines = "", {}, []
    for cells in read_sheet(WORKBOOK, sheet):
        a = cells.get("A", "")
        if a and "B" not in cells and "F" not in cells and not a.startswith("Sub-Total"):
            section = a.strip()
            continue
        price, qty = num(cells.get("F")), num(cells.get("G"))
        if price is None or not qty or "D" not in cells and "C" not in cells:
            continue
        ref = key(cells.get("E", "")) or key(cells.get("C", ""))
        part = seed.get(ref)
        unit, how = app_price(part)
        if unit is None:
            unit, how = price, "workbook price (placeholder)"
        lines.append({"section": section, "ref": ref, "qty": qty, "sheet_unit": price,
                      "app_unit": unit, "how": how,
                      "sheet_total": round(price * qty, 2), "app_total": round(unit * qty, 2)})
        s = sections.setdefault(section, {"sheet": 0.0, "app": 0.0})
        s["sheet"] += price * qty
        s["app"] += unit * qty
    return sections, lines


def group(sections):
    """The workbook's three subtotals: switchgear, busbar & cable, enclosure."""
    out = {"switchgear": [0, 0], "busbar & cable": [0, 0], "enclosure": [0, 0]}
    for name, s in sections.items():
        k = "busbar & cable" if name == "BUSBAR" else "enclosure" if name == "ENCLOSURE" else "switchgear"
        out[k][0] += s["sheet"]
        out[k][1] += s["app"]
    return out


if __name__ == "__main__":
    sheet = sys.argv[1] if len(sys.argv) > 1 else "OPTION1"
    sections, lines = run(sheet)
    print(f"{sheet}: {len(lines)} priced lines")
    print(f"{'subtotal':16} {'workbook':>14} {'app':>14} {'difference':>12}")
    total = [0, 0]
    for k, (sh, ap) in group(sections).items():
        print(f"{k:16} {sh:14,.2f} {ap:14,.2f} {ap - sh:12,.2f}")
        total[0] += sh
        total[1] += ap
    print(f"{'material':16} {total[0]:14,.2f} {total[1]:14,.2f} {total[1] - total[0]:12,.2f}")
    print("\nLines the app prices differently (workbook unit -> app unit, how):")
    for ln in lines:
        if abs(ln["app_unit"] - ln["sheet_unit"]) >= 0.5:
            print(f"  {ln['section'][:22]:22} {ln['ref'][:34]:34} x{ln['qty']:<5g} "
                  f"{ln['sheet_unit']:>12,.2f} -> {ln['app_unit']:>12,.2f}  {ln['how']}")
    print("\nLines kept at the workbook price because the catalogue lacks them:")
    for ln in lines:
        if ln["how"].startswith("workbook"):
            print(f"  {ln['section'][:22]:22} {ln['ref'][:34]:34} x{ln['qty']:<5g} {ln['sheet_unit']:>12,.2f}")
