"""Write data/seed/README.md from the two build reports. Called by build_kits.py."""
import json
from pathlib import Path

INTRO = """# Seed data — derived, never edited by hand

Generated from `data/raw/` by `scripts/build_seed.py` then `scripts/build_kits.py`
(Python 3, standard library only). Re-running both must leave this folder unchanged;
to change the seed, change the raw files or the scripts. What each rule means is
explained in `docs/reference/current-costing-and-quotation-reference.md` §6.

```
python3 scripts/build_seed.py && python3 scripts/build_kits.py && python3 scripts/check_npp192.py
```

## Files

| File | One row per | Columns |
|---|---|---|
| `components.csv` | part | `part_number, name, category, bom_category, brand, unit, purchase_price, purchase_currency, kg_per_metre, is_enclosure_cubicle, is_placeholder, source_file, flags` |
| `category-map.csv` | raw category | `raw_category, bom_category, is_busbar, is_enclosure_cubicle, parts` |
| `kits.csv` | kit line | `kit_group, kit_name, rating, rating_unit, poles, line_no, part_number, line_category, quantity, is_main_device, source_file, flags` |
| `kit-group-labour-template.csv` | kit group × process type | `kit_group, process_type, hours, note` — **hours are blank; the owner fills them in** |

Column notes:

- `purchase_price` is the catalogue price in `purchase_currency` (EUR throughout). The app
  converts to KES with the currency's exchange rate and landed-cost factor
  (master default 113 × 1.7699115 = 200 KES per EUR, back-solved from NPP-192).
- `kg_per_metre` is filled for busbar sizes only: width × thickness × 8.96 g/cm³. The app
  prices busbar as kg per metre × the copper rate (default 3,000 KES/kg), not from the EUR
  price, which is kept for reference.
- `bom_category` is one of the four BOM export categories seeded by migration 0003:
  `switchgear`, `busbar`, `accessories_hardware`, `enclosure_parts`.
- `is_placeholder = yes` marks a part the kits use but the catalogue does not price; it
  imports with no price and must be priced before a costing that uses it can be submitted.
- `flags` (space-separated): `no-price`, `placeholder`, `from-kits`, `category-guessed`,
  `currency-assumed`, `price-differs:<file>=<price>` on components; `main-assumed`,
  `main-only`, `no-device-line`, `non-contiguous`, `stray-line(previous kit: …)`,
  `name-collision`, `merged-duplicate`, `quantity-assumed`, `unknown-part` on kits (kit-level flags sit on the main-device line).
- `is_main_device`: exactly one `yes` per kit. `rating`/`rating_unit`/`poles` are parsed
  from the kit name (`630A TP …` → 630, A, 3); blank when the name carries none.
"""


def _list(items, fmt=lambda x: f"`{x}`", limit=40):
    items = list(items)
    if not items:
        return "- none\n"
    out = "".join(f"- {fmt(i)}\n" for i in items[:limit])
    if len(items) > limit:
        out += f"- … and {len(items) - limit} more (see the JSON report)\n"
    return out


def write_readme(seed):
    seed = Path(seed)
    c = json.loads((seed / ".components-report.json").read_text())
    k = json.loads((seed / ".kits-report.json").read_text())
    cr = c["report"]
    lines = [INTRO, "## Counts\n"]
    lines.append(f"| What | Count |\n|---|---|\n| Components | {c['components']} |\n")
    for cat, n in c["by_bom_category"].items():
        lines.append(f"| — {cat} | {n} |\n")
    lines.append(f"| — placeholders (no catalogue price) | {c['placeholders']} |\n")
    lines.append(f"| Kits | {k['kits']} |\n| Kit lines | {k['lines']} |\n| Kit groups | {len(k['groups'])} |\n")
    lines.append("\nKits per group: " + ", ".join(f"{g} {n}" for g, n in sorted(k["groups"].items())) + ".\n")

    lines.append("\n## What the scripts flagged — for the owner to check\n")
    lines.append("\n### Components\n")
    lines.append(f"\n**Duplicate part numbers inside one file** (first row kept):\n\n"
                 + _list(cr["duplicates"], lambda d: f"`{d[0]}` in `{d[1]}` row {d[2]}"))
    lines.append(f"\n**Same part, different price in two files** (first file wins, flagged):\n\n"
                 + _list(cr["price_differs"], lambda d: f"`{d[0]}`: `{d[1]}` {d[2]} vs `{d[3]}` {d[4]}"))
    lines.append(f"\n**Parts without a price:**\n\n" + _list(cr["no_price"], lambda d: f"`{d[0]}` {d[1]} (`{d[2]}`)"))
    lines.append(f"\n**Parts used by kits but missing from the catalogue** (added as placeholders):\n\n"
                 + _list(cr["from_kits"], lambda d: f"`{d[0]}` ({d[1]}, `{d[2]}`)"))
    lines.append(f"\n**Category guessed** (raw category not in the map, put under switchgear):\n\n"
                 + _list(cr["category_guessed"], lambda d: f"`{d[0]}` raw category {d[1]} (`{d[2]}`)"))
    lines.append(f"\nHeading rows skipped: {len(cr['headings'])}. Blank rows skipped: {len(cr['dropped_empty'])}. "
                 f"Parts repeated identically across files: {len(cr['repeats'])}.\n")

    lines.append("\n### Kits\n")
    lines.append(f"\nMain device assumed to be the first line (no 1/2 marker): {k['main_assumed']} kits.\n")
    lines.append("\n**Kits with a main device and nothing else** (`main-only`; probably missing lines):\n\n"
                 + _list(k["main_only"]))
    lines.append("\n**Kits whose lines are interleaved with another kit's** (`non-contiguous`; check the "
                 "busbar line landed on the right kit):\n\n" + _list(k["non_contiguous"]))
    lines.append("\n**Same kit name in two files with different lines** (`name-collision`, suffixed):\n\n"
                 + _list(k["name_collision"]))
    lines.append("\n**Lines that probably belong to the kit just above them** (`stray-line`; the export "
                 "gives them the wrong kit name, so one kit is missing its cable and another has two):\n\n"
                 + _list(k["stray_lines"], lambda d: f"`{d[0]}` — `{d[1]}` — {d[2]}"))
    lines.append("\n**Lines with no quantity** (set to 1):\n\n"
                 + _list(k["quantity_assumed"], lambda d: f"`{d[0]}` — `{d[1]}`"))
    lines.append("\n**Unknown part numbers:**\n\n" + _list(k["unknown_parts"], lambda d: f"`{d[0]}` — `{d[1]}`"))
    lines.append("\nThe JSON reports (`.components-report.json`, `.kits-report.json`) hold the full lists.\n")
    (seed / "README.md").write_text("".join(lines))
