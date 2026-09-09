import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('reads headers and rows, trimming cells', () => {
    const t = parseCsv('a,b\n1, 2 \n3,4\n')
    expect(t.headers).toEqual(['a', 'b'])
    expect(t.rows).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }])
  })
  it('keeps commas and doubled quotes inside quoted fields', () => {
    const t = parseCsv('part_number,name\n3VJ9,"Auxiliary switch block 2NO+2NC, S6/S5"\nX,"say ""hi"""\n')
    expect(t.rows[0]?.name).toBe('Auxiliary switch block 2NO+2NC, S6/S5')
    expect(t.rows[1]?.name).toBe('say "hi"')
  })
  it('accepts CRLF, a byte-order mark, and a missing trailing column', () => {
    const t = parseCsv('﻿a,b,c\r\n1,2\r\n\r\n4,5,6')
    expect(t.headers).toEqual(['a', 'b', 'c'])
    expect(t.rows).toEqual([{ a: '1', b: '2', c: '' }, { a: '4', b: '5', c: '6' }])
  })
  it('keeps a line break inside quotes', () => {
    const t = parseCsv('a,b\n"line1\nline2",x\n')
    expect(t.rows[0]?.a).toBe('line1\nline2')
  })
})
