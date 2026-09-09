"""Minimal .xlsx / .xlsm reader using only the standard library.

Returns the first worksheet (or a named one) as a list of rows; each row is a
dict of column letter -> cell value (strings). Cached formula results are read,
so a workbook saved by Excel gives the numbers a person saw on screen.
"""
import re
import xml.etree.ElementTree as ET
import zipfile

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
T = "{%s}t" % NS["m"]


def _shared_strings(z):
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter(T)) for si in root.findall("m:si", NS)]


def sheet_paths(z):
    """Map sheet name -> zip path, in workbook order."""
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {r.get("Id"): r.get("Target") for r in rels}
    out = {}
    for s in wb.iter("{%s}sheet" % NS["m"]):
        target = rid_to_target[s.get("{%s}id" % NS["r"])]
        out[s.get("name")] = target if target.startswith("xl/") else "xl/" + target.lstrip("/")
    return out


def read_sheet(path, sheet_name=None):
    with zipfile.ZipFile(path) as z:
        strings = _shared_strings(z)
        paths = sheet_paths(z)
        sheet = paths[sheet_name] if sheet_name else next(iter(paths.values()))
        root = ET.fromstring(z.read(sheet))
        rows = []
        for row in root.iter("{%s}row" % NS["m"]):
            cells = {}
            for c in row.findall("m:c", NS):
                col = re.match(r"[A-Z]+", c.get("r")).group(0)
                v = c.find("m:v", NS)
                if v is None:
                    inline = c.find("m:is", NS)
                    val = "".join(t.text or "" for t in inline.iter(T)) if inline is not None else None
                elif c.get("t") == "s":
                    val = strings[int(v.text)]
                else:
                    val = v.text
                if val is not None and str(val).strip() != "":
                    cells[col] = str(val)
            rows.append(cells)
        return rows


def sheet_names(path):
    with zipfile.ZipFile(path) as z:
        return list(sheet_paths(z))
