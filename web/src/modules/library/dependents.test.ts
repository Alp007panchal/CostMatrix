import { describe, expect, it } from 'vitest'
import type { LibraryDependents } from '../../lib/database.types'
import { dependentWords, dependentsFor } from './dependents'

const row = (over: Partial<LibraryDependents> = {}): LibraryDependents => ({
  kind: 'material_rate', entity_id: 'r1', label: 'copper_busbar', dependents: 11,
  dependents_are: 'part(s) priced by this rate',
  ...over,
})

describe('what rests on a rate', () => {
  it('finds the count for one rate', () => {
    expect(dependentsFor([row()], 'material_rate', 'copper_busbar')).toBe(11)
  })

  it('takes the master figure when a company has its own row beside it', () => {
    // A company's own rate always reads zero — it falls back to the master one,
    // so nothing rests on it. Taking the first row found would show zero.
    const rows = [row({ entity_id: 'own', dependents: 0 }), row({ entity_id: 'master', dependents: 11 })]
    expect(dependentsFor(rows, 'material_rate', 'copper_busbar')).toBe(11)
  })

  it('does not confuse a currency with a rate of the same name', () => {
    const rows = [row({ kind: 'currency_factor', label: 'EUR', dependents: 700 })]
    expect(dependentsFor(rows, 'material_rate', 'EUR')).toBe(0)
    expect(dependentsFor(rows, 'currency_factor', 'EUR')).toBe(700)
  })

  it('answers zero for a rate nothing has been read about', () => {
    expect(dependentsFor([], 'material_rate', 'copper_busbar')).toBe(0)
  })
})

describe('saying it', () => {
  it('counts one in the singular', () => {
    expect(dependentWords(1)).toBe('1 part')
    expect(dependentWords(11)).toBe('11 parts')
  })

  it('groups the thousands', () => {
    expect(dependentWords(1240)).toBe('1,240 parts')
  })

  it('shows a dash rather than "0 parts", which reads as a fault', () => {
    expect(dependentWords(0)).toBe('—')
    expect(dependentWords(-1)).toBe('—')
  })

  it('takes another noun where the thing is not a part', () => {
    expect(dependentWords(3, 'kit')).toBe('3 kits')
  })
})
