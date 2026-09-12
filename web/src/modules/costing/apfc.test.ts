import { describe, expect, it } from 'vitest'
import type { ApfcProposal, ApfcStep } from '../../lib/database.types'
import { bankTotal, describeBank, shortfallWords, stepsToApply } from './apfc'

const step = (rating: number, quantity: number): ApfcStep => ({
  assembly_id: `k${rating}`, code: `${rating}KVAR`, name: `${rating}KVAR APFC-FUSE KIT`,
  rating, quantity, kvar: rating * quantity,
})

// The owner's own bank on NPP-192.
const NPP192 = [step(50, 4), step(25, 4), step(12.5, 6), step(5, 5)]
const proposal = (over: Partial<ApfcProposal> = {}): ApfcProposal => ({
  panel_id: 'p', family: 'FUSE', target_kvar: 400, total_kvar: 400, shortfall_kvar: 0,
  steps: NPP192, ...over,
})

describe('the APFC card', () => {
  it('adds the bank up as the engineer has it', () => {
    expect(bankTotal(NPP192)).toBe(400)
  })

  it('follows a quantity the engineer changed', () => {
    const edited = [step(50, 5), step(25, 4), step(12.5, 6), step(5, 5)]
    expect(bankTotal(edited)).toBe(450)
    expect(shortfallWords(proposal(), edited)).toBe('50 kVAr over the 400 asked for.')
  })

  it('reads the bank back in words', () => {
    expect(describeBank(NPP192)).toBe('400 kVAr in 19 steps')
    expect(describeBank([step(50, 1)])).toBe('50 kVAr in 1 step')
    expect(describeBank([step(50, 0)])).toBe('nothing yet')
  })

  it('leaves out a step the engineer took down to zero', () => {
    expect(stepsToApply([step(50, 4), step(25, 0)])).toHaveLength(1)
    expect(bankTotal(stepsToApply([step(50, 4), step(25, 0)]))).toBe(200)
  })

  it('says nothing when the target is met exactly', () => {
    expect(shortfallWords(proposal(), NPP192)).toBeNull()
  })

  it('says how far short the library’s sizes leave it', () => {
    const short = [step(50, 4), step(25, 4), step(12.5, 6), step(5, 5)]
    expect(shortfallWords(proposal({ target_kvar: 401 }), short))
      .toBe('1 kVAr short of the 401 asked for — the sizes in the library cannot reach it exactly.')
  })
})
