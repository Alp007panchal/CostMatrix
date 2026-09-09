"""Consolidate the four kit exports into one clean kits (assemblies) seed file.

Inputs (from "KITS AND CATALOGUE.zip", Alpesh, 8 Sep 2026), all in the app's kit-export layout
(Kit Name, Linked Category, Frame Size, Labor Hours, Labor Rate, Part Number, Quantity):
  kits-export-2026-08-20 (3).xlsx          - Siemens ACB / MCCB / incomer / outgoer / MCB / ATS / sync / accessory kits
  kits-export-C&S PORTFILIO.xlsx           - the same kit types built on the C&S range
  kits-export-2026-08-20 APFC BANK.xlsx    - APFC step kits (fuse and breaker variants) and standard meterboards
  kits-export-2026-08-20 (3) -SAMPLE.xlsx  - two ATS kits, superseded by the main file (logged, not imported)

Outputs: data/seed/kits.csv, kits-issues.csv, kit-group-labour-template.csv, kit-labour-template.csv.
Usage: python scripts/build_kits.py <folder-with-originals>
"""
import glob
import re
import sys

import openpyxl
import pandas as pd

UP = (sys.argv[1] if len(sys.argv) > 1 else 'data/source').rstrip('/') + '/'
OUT = 'data/seed/'
CONT = {'CABLE', 'BUSBAR'}  # line types that are "continuations" of the kit above them

components = pd.read_csv(OUT + 'components.csv', dtype=str, keep_default_na=False)
comp_cat = dict(zip(components.partNumber, components.category))


def clean(v):
    return '' if v is None else re.sub(r'\s+', ' ', str(v)).strip()


rows, issues = [], []
files = [f for f in sorted(glob.glob(UP + 'kits-export*.xlsx'))]
for f in files:
    fname = f.split('/')[-1]
    superseded = 'SAMPLE' in fname
    ws = openpyxl.load_workbook(f, data_only=True).worksheets[0]
    group, current = '', None
    for rownum, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        kit, cat, frame, hours, rate, part, qty = [clean(v) for v in (list(r) + [None] * 7)[:7]]
        if not any([kit, part]):
            continue
        if part == '':           # a group header row: kit name only
            group = kit
            continue
        cat_norm = comp_cat.get(part, cat.upper().replace('-', ' '))  # catalogue category is authoritative
        # Continuation rows carrying the wrong kit name (copy-paste drift in the export):
        # a busbar/cable line whose kit name differs from the kit above, while that kit has no
        # busbar/cable yet and the named kit already has one → it belongs to the kit above.
        if current and cat_norm in CONT and kit != current['kit']:
            above_has = any(x['kit'] == current['kit'] and x['file'] == fname and x['cat'] in CONT for x in rows)
            named_has = any(x['kit'] == kit and x['file'] == fname and x['cat'] in CONT for x in rows)
            named_exists = any(x['kit'] == kit and x['file'] == fname and x['cat'] not in CONT for x in rows)
            if not above_has and (named_has or not named_exists):
                issues.append({'file': fname, 'row': rownum, 'kit': kit, 'partNumber': part,
                               'problem': f'{cat_norm} line labelled "{kit}" sits under kit "{current["kit"]}", which had none',
                               'action': f'moved to "{current["kit"]}"'})
                kit = current['kit']
        rows.append({'file': fname, 'row': rownum, 'group': group, 'kit': kit, 'cat': cat_norm, 'frame': frame,
                     'hours': hours, 'rate': rate, 'part': part, 'qty': qty, 'superseded': superseded})
        current = rows[-1]

df = pd.DataFrame(rows)

# --- kit group: the export only carries group headers from the MCCB section onwards; kits before
# the first header (ACB kits) and the C&S file's first section get their main device's category.
first_cat = df[~df.cat.isin(CONT)].groupby('kit').cat.first()
df['group'] = [g if g else first_cat.get(k, '') for g, k in zip(df.group, df.kit)]
df['group'] = df.group.replace({'ACCESORISES': 'ACCESSORIES', 'OUTGOER-KITS': 'OUTGOER-KIT'})

# --- superseded sample file
for _, r in df[df.superseded].iterrows():
    issues.append({'file': r.file, 'row': r.row, 'kit': r.kit, 'partNumber': r.part,
                   'problem': 'SAMPLE file duplicates a kit in the main export with different quantities',
                   'action': 'not imported (main export wins)'})
df = df[~df.superseded].copy()

# --- kit-name fixes
name_fix = {
    '4000A 4P WITHDRAWABLE MOTORIZED ACB-KIT with changeover accessories-KIT':
        '4000A 4P WITHDRAWABLE MOTORIZED ACB with changeover accessories-KIT',
    '2000A 4P 2000A 4P EDO WITH MIRCROPRO4.1 RELAY WM2 ACB-C&S ATS KIT':
        '2000A 4P EDO WITH MIRCROPRO4.1 RELAY WM2 ACB-C&S ATS KIT',
    '2000A 4P 2000A 4P EDO WITH MIRCROPRO4.1 RELAY WM2 ACB- C&S SYNC KIT':
        '2000A 4P EDO WITH MIRCROPRO4.1 RELAY WM2 ACB-C&S SYNC KIT',
    '400A TP Adj Therm Adj Mag MCCB 25KA': '400A TP Adj Therm Adj Mag MCCB 25KA-KIT',
}
for old, new in name_fix.items():
    if (df.kit == old).any():
        issues.append({'file': df[df.kit == old].file.iloc[0], 'row': df[df.kit == old].row.iloc[0], 'kit': old,
                       'partNumber': '', 'problem': 'kit name typo / inconsistent with sibling kits', 'action': f'renamed to "{new}"'})
        df.loc[df.kit == old, 'kit'] = new
df['kit'] = (df.kit.str.replace(r'\s*-\s*KIT\s*$', '-KIT', regex=True).str.replace(r'\s+KIT$', ' KIT', regex=True)
             .str.replace(r'\s+-', '-', regex=True))   # "5KVAR APFC -FUSE KIT" → "5KVAR APFC-FUSE KIT"

# --- category from the catalogue where the export left it blank or used a supplier label
df['cat'] = [comp_cat.get(p, c) if (c == '' or c in ('MCB C&S', 'MCCB C&S', 'ATS SWITCH', 'SWITCH DISCONNECTOR', 'RCCB'))
             else c for p, c in zip(df.part, df.cat)]
# lines whose part is not in the catalogue at all
for _, r in df[~df.part.isin(comp_cat)].iterrows():
    issues.append({'file': r.file, 'row': r.row, 'kit': r.kit, 'partNumber': r.part,
                   'problem': 'part number not in the component catalogue', 'action': 'kept; see components-issues.csv'})

# --- frame size: keep only the numeric ACB frame values; the APFC/meterboard export put descriptions here
df['frame'] = df.frame.where(df.frame.str.fullmatch(r'\d+'), '')

# --- exact duplicate lines and same-part-twice-in-a-kit
dups = df[df.duplicated(['kit', 'part', 'qty'], keep='first')]
for _, r in dups.iterrows():
    issues.append({'file': r.file, 'row': r.row, 'kit': r.kit, 'partNumber': r.part,
                   'problem': 'identical line repeated', 'action': 'dropped'})
df = df.drop(dups.index)
twice = df[df.duplicated(['kit', 'part'], keep=False)]
for _, r in twice.iterrows():
    issues.append({'file': r.file, 'row': r.row, 'kit': r.kit, 'partNumber': r.part,
                   'problem': f'same part listed twice in one kit with different quantities ({r.qty})',
                   'action': 'both kept - confirm which quantity is right'})

# --- C&S kits must use C&S ACBs (decision, Alpesh 8 Sep 2026): the two 1250 A C&S ATS/sync kits
# were exported with the Siemens 3WJ1112 ACB; replace with the C&S 1250 A 4P EDO.
for i, r in df.iterrows():
    if ('C&S ATS KIT' in r.kit or 'C&S SYNC KIT' in r.kit) and r.part.startswith('3WJ'):
        issues.append({'file': r.file, 'row': r.row, 'kit': r.kit, 'partNumber': r.part,
                       'problem': 'C&S kit used a Siemens ACB part number', 'action': 'replaced with WX12N4PEDOA (S) (decision 8 Sep 2026)'})
        df.at[i, 'part'] = 'WX12N4PEDOA (S)'
        df.at[i, 'cat'] = comp_cat['WX12N4PEDOA (S)']

# --- kits with no busbar/cable line at all (every sibling kit has one)
for kit, g in df.groupby('kit'):
    if not g.cat.isin(CONT).any() and g.group.iloc[0] != 'ACCESSORIES':
        issues.append({'file': g.file.iloc[0], 'row': g.row.iloc[0], 'kit': kit, 'partNumber': g.part.iloc[0],
                       'problem': 'kit has no busbar/cable line (its sibling kits do)', 'action': 'kept - add the missing line'})

# --- quantities numeric; a blank quantity on a main-device line defaults to 1
df['qty'] = pd.to_numeric(df.qty, errors='coerce')
for i, r in df[df.qty.isna()].iterrows():
    issues.append({'file': r.file, 'row': r.row, 'kit': r.kit, 'partNumber': r.part,
                   'problem': 'quantity blank', 'action': 'set to 1 (every sibling kit has 1)'})
    df.at[i, 'qty'] = 1
assert df.qty.notna().all()

out = pd.DataFrame({
    'kitName': df.kit, 'linkedCategory': df.cat, 'frameSize': df.frame, 'laborHours': df.hours, 'laborRate': df.rate,
    'partNumber': df.part, 'quantity': df.qty.map(lambda q: str(int(q)) if float(q).is_integer() else str(q)),
    'kitGroup': df.group, 'sourceFile': df.file,
})
out.to_csv(OUT + 'kits.csv', index=False)
pd.DataFrame(issues).to_csv(OUT + 'kits-issues.csv', index=False)

# --- labour templates (decision 8 Sep 2026: hours are maintained per kit group, any kit may override).
# Group template: one row per kit group (ACB groups split by frame, since 800 A and 4000 A differ).
def labour_group(r):
    if r.kitGroup in ('ACB',) and r.frameSize:
        return f'ACB frame {r.frameSize}'
    return r.kitGroup
main = out[~out.linkedCategory.isin(['BUSBAR', 'CABLE'])].drop_duplicates('kitName')
main = main.assign(labourGroup=main.apply(labour_group, axis=1))
groups = main.groupby('labourGroup', sort=False).agg(kits=('kitName', 'size'), example=('kitName', 'first')).reset_index()
for c in ('hoursPanelAssembly', 'hoursWiring', 'hoursBusbarFabrication'):
    groups[c] = ''
groups.to_csv(OUT + 'kit-group-labour-template.csv', index=False)
# Per-kit override template: leave blank unless a kit differs from its group.
kits = main[['kitGroup', 'labourGroup', 'kitName', 'partNumber']].rename(columns={'partNumber': 'mainPart'})
for c in ('hoursPanelAssembly', 'hoursWiring', 'hoursBusbarFabrication'):
    kits[c] = ''
kits.to_csv(OUT + 'kit-labour-template.csv', index=False)

print(len(out), 'lines;', out.kitName.nunique(), 'kits;', len(issues), 'issues')
print(out.kitGroup.value_counts().to_string())
print('lines per kit:', out.groupby('kitName').size().value_counts().sort_index().to_dict())
print('missing parts:', sorted(set(out.partNumber) - set(comp_cat)))
