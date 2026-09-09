"""Consolidate the four component-catalog CSVs into one clean seed file.

Inputs (from "KITS AND CATALOGUE.zip", Alpesh, 8 Sep 2026):
  component-catalog-ALL.csv               - Siemens ACB/MCCB/MCB + accessories, APFC, CT, metering,
                                            SPD, LED, controllers, busbar/cable/enclosure (descriptions blank)
  component-catalog-BUSBAR AND CABLES.csv - same busbar/cable/enclosure rows with descriptions
  component-catalog-ACB.csv               - subset of ALL (identical prices), not used
  component-C&S.csv                       - C&S range, not in ALL
  component-catalog-ENCLOSURE.csv         - nine more (1600 mm high) enclosures
  component-catalog-SAMPLE.csv            - the CONTROLS & WIRING lump-sum item
  kits-export-*.xlsx                      - read only to add placeholder rows for parts kits use
                                            that the catalogue lacks (no price)

Outputs: components.csv (same 13 columns as the input template), category-map.csv,
         components-issues.csv (rows dropped or needing a decision).
"""
import re
import sys
import pandas as pd

# Folder holding the four original CSVs (kept outside the repo). Usage: python scripts/build_seed.py <folder>
UP = (sys.argv[1] if len(sys.argv) > 1 else 'data/source').rstrip('/') + '/'
OUT = 'data/seed/'
COLS = ['partNumber', 'description', 'category', 'priceEur', 'purchaseCurrency',
        'listSellingPrice', 'unit', 'brand', 'rating', 'poles', 'breakingCapacity',
        'frameSize', 'notes']


def load(name, source):
    df = pd.read_csv(UP + name, dtype=str, keep_default_na=False)
    df.columns = [c.strip() for c in df.columns]
    for c in df.columns:
        df[c] = df[c].str.replace(r'\s+', ' ', regex=True).str.strip()
    df['source'] = source
    df['srcRow'] = df.index + 2  # spreadsheet row number
    return df


ALL = load('component-catalog-ALL.csv', 'component-catalog-ALL.csv')
BUS = load('component-catalog-BUSBAR AND CABLES.csv', 'component-catalog-BUSBAR AND CABLES.csv')
CS = load('component-C&S.csv', 'component-C&S.csv')

# --- fill busbar/cable/enclosure descriptions in ALL from the BUSBAR file
desc = dict(zip(BUS.partNumber, BUS.description))
mask = (ALL.description == '') & ALL.partNumber.isin(desc)
ALL.loc[mask, 'description'] = ALL.loc[mask, 'partNumber'].map(desc)
ALL.loc[mask, 'brand'] = ALL.loc[mask].apply(
    lambda r: r.brand or dict(zip(BUS.partNumber, BUS.brand)).get(r.partNumber, ''), axis=1)

ENC = load('component-catalog-ENCLOSURE.csv', 'component-catalog-ENCLOSURE.csv')
SMP = load('component-catalog-SAMPLE.csv', 'component-catalog-SAMPLE.csv')
df = pd.concat([ALL, CS, ENC, SMP], ignore_index=True)

issues = []


def issue(row, problem, action):
    issues.append({'partNumber': row.partNumber, 'description': row.description,
                   'source': row.source, 'sourceRow': row.srcRow,
                   'priceEur': row.priceEur, 'problem': problem, 'action': action})


# --- drop blank and section-header rows (no description and no price)
hdr = (df.description == '') | (df.partNumber == '') | ((df.priceEur == '') & (df.category == ''))
df = df[~hdr].copy()

# --- normalise categories
cat_fix = {'busbar-link': 'BUSBAR LINK', 'Switch Disconnector': 'SWITCH DISCONNECTOR'}
df['category'] = df.category.replace(cat_fix).str.upper()


def infer_category(r):
    d = r.description.upper()
    p = r.partNumber.upper()
    if 'CONTROLLER' in d:
        return 'CONTROLLER'
    if 'RCBO' in d:
        return 'RCBO'
    if 'RCCB' in d:
        return 'RCCB'
    if 'CONTACTOR' in d:
        return 'CONTACTOR'
    if 'C/O SWITCH' in d and p.startswith('CSCOS'):
        return 'MCB CHANGEOVER'
    return ''


notes = {}
for i, r in df[df.category == ''].iterrows():
    c = infer_category(r)
    if c:
        df.at[i, 'category'] = c
        notes[i] = f'category "{c}" assigned during import clean-up (was blank)'
    else:
        issue(r, 'blank category', 'kept with blank category')

# --- defaults for blank currency / unit / listSellingPrice
for i, r in df.iterrows():
    n = []
    if r.purchaseCurrency == '':
        df.at[i, 'purchaseCurrency'] = 'EUR'; n.append('purchaseCurrency defaulted to EUR')
    if r.unit == '':
        df.at[i, 'unit'] = '1'; n.append('unit defaulted to 1')
    if r.listSellingPrice == '':
        df.at[i, 'listSellingPrice'] = '0'
    if r.priceEur == '':
        issue(r, 'no price', 'kept, price blank - needs a price before use')
        n.append('NO PRICE in source')
    if n:
        notes[i] = '; '.join(filter(None, [notes.get(i, '')] + n))

# --- description fixes
df['description'] = df.description.str.replace('?', ':', regex=False)  # 'Uc?385V' encoding loss

# --- parse rating / poles / breaking capacity from descriptions where unambiguous
POLES = {'SP': '1P', 'DP': '2P', 'TP': '3P', 'FP': '4P', '1P': '1P', '2P': '2P', '3P': '3P', '4P': '4P',
         '1P+N': '1P+N', '3P+N': '3P+N', '3P+NPE': '3P+NPE'}
for i, r in df.iterrows():
    d = r.description.upper()
    if r.category in ('BUSBAR', 'CABLE', 'ENCLOSURE', 'BUSBAR LINK') or 'ACCESSORIES' in r.category:
        continue
    if r.category == 'CT':
        df.at[i, 'rating'] = r.partNumber
        continue
    m = re.search(r'\b(\d+(?:\.\d+)?)\s*(A|KVAR|KA)\b', d)
    if m and m.group(2) == 'A' and r.rating == '':
        df.at[i, 'rating'] = m.group(1) + 'A'
    m = re.search(r'\b(\d+(?:\.\d+)?)\s*KVAR\b', d)
    if m and r.rating == '':
        df.at[i, 'rating'] = m.group(1) + 'kVAr'
    m = re.search(r'\b(SP|DP|TP|FP|1P\+N|3P\+NPE|3P\+N|[1-4]P)\b', d)
    if m and r.poles == '':
        df.at[i, 'poles'] = POLES[m.group(1)]
    m = re.search(r'\b(\d+)\s*KA\b', d)
    if m and r.breakingCapacity == '' and r.category != 'SPD':
        df.at[i, 'breakingCapacity'] = m.group(1) + 'kA'
    m = re.search(r'\b(\d+)AF\b', d)
    if m and r.frameSize == '':
        df.at[i, 'frameSize'] = m.group(1) + 'A'

# --- duplicates: keep first occurrence, log the rest
# Exception: 3VJ1340 is Siemens' 400A frame, so the 200A row carrying that number is the wrong one.
wrong = df[(df.partNumber == '3VJ1340-5DB32-0AA0') & df.description.str.startswith('200A')]
for i, r in wrong.iterrows():
    issue(r, 'part number belongs to the 400A MCCB (3VJ13-40); 200A is probably 3VJ1320-5DB32-0AA0',
          'dropped from seed - confirm the 200A part number and price')
df = df.drop(wrong.index)
dup = df[df.partNumber.duplicated(keep='first')]
for i, r in dup.iterrows():
    first = df[df.partNumber == r.partNumber].iloc[0]
    issue(r, f'duplicate part number (first occurrence kept: "{first.description}" @ {first.priceEur})',
          'dropped from seed - confirm correct price / part number')
    j = first.name
    notes[j] = '; '.join(filter(None, [notes.get(j, ''),
                                       f'DUPLICATE in source: also listed as "{r.description}" @ {r.priceEur} - confirm']))
df = df.drop(dup.index)

# --- parts referenced by kits but absent from the catalogue: add placeholder rows (no price)
import glob, openpyxl
kit_parts = {}
for f in sorted(glob.glob(UP + 'kits-export*.xlsx')):
    ws = openpyxl.load_workbook(f, data_only=True).worksheets[0]
    for r in ws.iter_rows(min_row=2, values_only=True):
        kit, cat, frame, _h, _r, part, _q = (list(r) + [None] * 7)[:7]
        if part is None or str(part).strip() == '':
            continue
        part = re.sub(r'\s+', ' ', str(part)).strip()
        kit_parts.setdefault(part, (re.sub(r'\s+', ' ', str(kit)).strip(), str(cat or '').strip(), str(frame or '').strip()))
placeholders = []
for part, (kit, cat, frame) in kit_parts.items():
    if part in set(df.partNumber):
        continue
    brand = 'SIEMENS' if re.match(r'^5[ST]', part) else ('C&S' if part.startswith('CS') else '')
    category = {'MCB-C&S': 'MCB', 'MCCB-C&S': 'MCCB', 'ISOLATOR': 'ISOLATOR', 'INTERLOCK': 'CONTACTOR ACCESSORIES',
                'MCB': 'MCB'}.get(cat, cat.upper())
    placeholders.append({'partNumber': part, 'description': frame if not frame.isdigit() else part, 'category': category,
                         'priceEur': '', 'purchaseCurrency': 'EUR', 'listSellingPrice': '0', 'unit': '1', 'brand': brand,
                         'rating': '', 'poles': '', 'breakingCapacity': '', 'frameSize': '',
                         'notes': f'PLACEHOLDER: used by kit "{kit}" but not in the catalogue - price needed',
                         'source': 'kits-export', 'srcRow': ''})
    issues.append({'partNumber': part, 'description': frame, 'source': 'kits-export', 'sourceRow': '', 'priceEur': '',
                   'problem': f'used by kit "{kit}" but not in the component catalogue',
                   'action': 'placeholder row added to components.csv with no price - add price or map to an existing part'})
if placeholders:
    df = pd.concat([df, pd.DataFrame(placeholders)], ignore_index=True)

# --- hardware hiding inside the APFC category
for i, r in df.iterrows():
    if r.category == 'APFC' and re.search(r'FUSE|BUSBAR SUPPORT', r.description.upper()):
        notes[i] = '; '.join(filter(None, [notes.get(i, ''), 'BOM category: accessories & hardware (not switchgear)']))

for i, n in notes.items():
    if i in df.index:
        df.at[i, 'notes'] = '; '.join(filter(None, [df.at[i, 'notes'], n]))

df = df[COLS]
df.to_csv(OUT + 'components.csv', index=False)
pd.DataFrame(issues).to_csv(OUT + 'components-issues.csv', index=False)

BOM = {
    'SWITCHGEAR': ['ACB', 'MCCB', 'MCB', 'ONLOAD CHANGEOVER', 'SWITCH DISCONNECTOR', 'BYPASS SWITCH',
                   'ATS SWITCH', 'ISOLATOR', 'CONTACTOR', 'RCCB', 'RCBO', 'MCB CHANGEOVER', 'CONTROLLER',
                   'METERING', 'CT', 'SPD', 'APFC'],
    'ACCESSORIES & HARDWARE': ['MCCB ACCESSORIES', 'SINOVA MCCB ACCESSORIES', 'ACB SINOVA ACCESSORIES',
                               'CONTACTOR ACCESSORIES', 'LED', 'CABLE', 'CONTROLS'],
    'BUSBAR': ['BUSBAR', 'BUSBAR LINK'],
    'FABRICATED ENCLOSURE PARTS': ['ENCLOSURE'],
}
rows = [{'category': c, 'bomCategory': b, 'count': int((df.category == c).sum())} for b, cs in BOM.items() for c in cs]
cm = pd.DataFrame(rows)
missing = set(df.category.unique()) - set(cm.category)
assert not missing, missing
cm.to_csv(OUT + 'category-map.csv', index=False)

print(len(df), 'components;', len(issues), 'issues')
print(df.category.value_counts().to_string())
print(df.brand.value_counts().to_string())
print('rating filled', (df.rating != '').sum(), 'poles', (df.poles != '').sum(), 'kA', (df.breakingCapacity != '').sum(), 'frame', (df.frameSize != '').sum())
