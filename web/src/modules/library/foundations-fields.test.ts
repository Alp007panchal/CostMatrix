import { describe, expect, it } from 'vitest'
import { parseAttributes, parseTags } from './library-fields'

/**
 * The two free-text boxes migration 0100 added to the library forms. Both are
 * checked in the browser so a typo is one sentence, rather than Postgres
 * refusing the whole save with a message about JSON syntax or array literals.
 */

describe('the attributes box on a component', () => {
  it('treats an empty box as no attributes rather than an error', () => {
    expect(parseAttributes('')).toEqual({ value: {} })
    expect(parseAttributes('   ')).toEqual({ value: {} })
  })

  it('accepts a list of name and value pairs', () => {
    expect(parseAttributes('{"mounting": "withdrawable", "ip": "IP31"}')).toEqual({
      value: { mounting: 'withdrawable', ip: 'IP31' },
    })
  })

  it('keeps numbers and booleans as they were typed', () => {
    expect(parseAttributes('{"kvar": 50, "motorised": true}')).toEqual({
      value: { kvar: 50, motorised: true },
    })
  })

  it('explains a mistyped bracket instead of passing it to the database', () => {
    const result = parseAttributes('{"ip": "IP31"')
    expect('error' in result && result.error).toContain('brackets and quotes')
  })

  it('refuses a single value or a list, which the database would store but nothing could read', () => {
    expect('error' in parseAttributes('"IP31"')).toBe(true)
    expect('error' in parseAttributes('[1, 2, 3]')).toBe(true)
    expect('error' in parseAttributes('null')).toBe(true)
  })
})

describe('the labels box on a kit', () => {
  it('splits on commas and trims the spaces', () => {
    expect(parseTags('incomer, outgoer ,apfc')).toEqual(['incomer', 'outgoer', 'apfc'])
  })

  it('folds case down, so Incomer and incomer are one label', () => {
    expect(parseTags('Incomer, INCOMER, incomer')).toEqual(['incomer'])
  })

  it('drops the blanks a trailing comma leaves behind', () => {
    expect(parseTags('incomer, , apfc,')).toEqual(['incomer', 'apfc'])
    expect(parseTags('')).toEqual([])
    expect(parseTags(' , ')).toEqual([])
  })
})
