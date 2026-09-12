import { describe, expect, it } from 'vitest'
import {
  BOM_FIELDS, choiceKey, choicesFor, guessBomMapping, missingBomFields, readQty, toBomRows,
} from './bom-import-read'

describe('guessing the columns of somebody else’s schedule', () => {
  it('finds the usual consultant headings', () => {
    expect(guessBomMapping(['Item', 'Cat. No', 'Description', 'Qty', 'Make'])).toMatchObject({
      key: 'Cat. No', description: 'Description', qty: 'Qty', maker: 'Make',
    })
  })

  it('reads an EPLAN export', () => {
    expect(guessBomMapping(['Part number', 'Designation', 'Quantity', 'Manufacturer'])).toEqual({
      key: 'Part number', description: 'Designation', qty: 'Quantity', maker: 'Manufacturer',
    })
  })

  it('finds a Siemens ordering number column', () => {
    expect(guessBomMapping(['MLFB', 'Bezeichnung', 'Anzahl'])).toMatchObject({ key: 'MLFB', qty: 'Anzahl' })
  })

  it('needs only the part number, because a missing quantity means one', () => {
    expect(missingBomFields({})).toEqual(['key'])
    expect(missingBomFields({ key: 'Cat. No' })).toEqual([])
    expect(BOM_FIELDS.filter((f) => f.needed).map((f) => f.field)).toEqual(['key'])
  })
})

describe('reading a quantity as a schedule writes it', () => {
  it('reads plain numbers and numbers with a unit stuck on', () => {
    expect(readQty('3')).toBe('3')
    expect(readQty('3 nos')).toBe('3')
    expect(readQty('2 sets')).toBe('2')
    expect(readQty('12.5 m')).toBe('12.5')
    expect(readQty('1,200')).toBe('1200')
  })

  it('says nothing for a cell with no number, so the row is refused rather than read as one', () => {
    expect(readQty('as required')).toBe('')
    expect(readQty('—')).toBe('')
    expect(readQty('')).toBe('')
    expect(readQty(undefined)).toBe('')
  })
})

describe('building the rows the database matches', () => {
  const mapping = { key: 'Part No', qty: 'Qty', description: 'Desc', maker: 'Make', unit: 'Unit' }

  it('numbers rows from the line after the header and keeps what it was given', () => {
    expect(
      toBomRows(
        [
          { 'Part No': '3VJ1216', Qty: '3 nos', Desc: '160A MCCB', Make: 'Siemens', Unit: 'pcs' },
          { 'Part No': 'LOGO', Qty: '' },
        ],
        mapping,
      ),
    ).toEqual([
      { row: 2, key: '3VJ1216', qty: '3', description: '160A MCCB', maker: 'Siemens', unit: 'pcs' },
      { row: 3, key: 'LOGO', qty: '' },
    ])
  })

  it('skips a sheet’s own sub-headings, which have a description but no part number', () => {
    const rows = toBomRows([{ 'Part No': '', Desc: 'OUTGOING FEEDERS' }, { 'Part No': 'A1', Qty: '1' }], mapping)
    expect(rows.map((r) => r.key)).toEqual(['A1'])
  })

  it('keeps a row whose quantity will be refused, so the person sees why', () => {
    expect(toBomRows([{ 'Part No': 'A1', Qty: 'as required' }], mapping)).toEqual([
      { row: 2, key: 'A1', qty: '' },
    ])
  })
})

describe('the choices offered for a matched row', () => {
  const base = {
    component_id: 'c1', component_code: 'MCCB-160', component_name: '160A TP MCCB',
  }

  it('offers the kit first when the part is a kit’s main device, and defaults to it', () => {
    const { choices, defaultKey } = choicesFor({
      ...base,
      kits: [{ kit_id: 'k1', name: '160A OUTGOER KIT' }],
      proposal: { kind: 'kit', ref_id: 'k1' },
    })
    expect(choices[0]).toMatchObject({ kind: 'kit', ref_id: 'k1' })
    expect(choices[0]?.label).toMatch(/Kit: 160A OUTGOER KIT/)
    expect(defaultKey).toBe('kit:k1')
  })

  it('warns on a kit that cannot be costed yet', () => {
    const { choices } = choicesFor({
      ...base,
      kits: [{ kit_id: 'k1', name: 'A KIT', has_unpriced_part: true }],
    })
    expect(choices[0]?.label).toMatch(/has an unpriced part/)
  })

  it('offers every kit that uses the device, then the part on its own', () => {
    const { choices } = choicesFor({
      ...base,
      kits: [{ kit_id: 'k1', name: 'FIRST KIT' }, { kit_id: 'k2', name: 'SECOND KIT' }],
      proposal: { kind: 'component', ref_id: 'c1' },
    })
    expect(choices.map((c) => c.kind)).toEqual(['kit', 'kit', 'component', 'placeholder', 'skip'])
    expect(choices[2]?.label).toMatch(/MCCB-160 160A TP MCCB/)
  })

  it('offers a placeholder and nothing else for a row that matched nothing', () => {
    const { choices, defaultKey } = choicesFor({})
    expect(choices.map((c) => c.kind)).toEqual(['placeholder', 'skip'])
    expect(defaultKey).toBe('skip:')
  })

  it('keys a choice so the screen can tell two kits apart', () => {
    expect(choiceKey({ kind: 'kit', ref_id: 'k1', label: '' })).toBe('kit:k1')
    expect(choiceKey({ kind: 'skip', label: '' })).toBe('skip:')
  })
})
