import { describe, expect, it } from 'vitest'
import type { CompanyFeature } from '../../lib/database.types'
import { featureSummary, isOn, offMessage, orderFeatures, switchNote } from './features'

const feature = (over: Partial<CompanyFeature> = {}): CompanyFeature => ({
  code: 'costing_grid',
  name: 'The costing grid',
  blurb: 'The whole costing as one grid.',
  changes_costings: false,
  option_key: 'feature.costing_grid',
  sort_order: 100,
  is_on: false,
  ...over,
})

describe('orderFeatures', () => {
  it('reads in register order, then by name', () => {
    const list = orderFeatures([
      feature({ code: 'c', sort_order: 20, name: 'B' }),
      feature({ code: 'a', sort_order: 10 }),
      feature({ code: 'b', sort_order: 20, name: 'A' }),
    ])
    expect(list.map((f) => f.code)).toEqual(['a', 'b', 'c'])
  })

  it('leaves the list it was given alone', () => {
    const given = [feature({ code: 'b', sort_order: 20 }), feature({ code: 'a', sort_order: 10 })]
    orderFeatures(given)
    expect(given.map((f) => f.code)).toEqual(['b', 'a'])
  })
})

describe('featureSummary', () => {
  it('says plainly when nothing is on, which is the starting state', () => {
    expect(featureSummary([feature(), feature({ code: 'x' })]))
      .toBe('Nothing switched on. All 2 are off, which is how every company starts.')
  })

  it('counts what is on', () => {
    expect(featureSummary([feature({ is_on: true }), feature({ code: 'x' })])).toBe('1 of 2 switched on.')
  })

  it('and has something to say about an empty register', () => {
    expect(featureSummary([])).toBe('No features to switch on yet.')
  })
})

describe('switchNote', () => {
  it('warns about the ones that change a costing', () => {
    expect(switchNote(feature({ changes_costings: true }))).toMatch(/changes what an existing costing does/)
  })

  it('and reassures about the rest', () => {
    expect(switchNote(feature())).toMatch(/Nothing already costed changes/)
  })
})

describe('isOn', () => {
  it('answers from the register', () => {
    const list = [feature({ code: 'a', is_on: true }), feature({ code: 'b' })]
    expect(isOn(list, 'a')).toBe(true)
    expect(isOn(list, 'b')).toBe(false)
  })

  it('treats an unknown code and a missing register as off, never as on', () => {
    expect(isOn([feature()], 'nobody')).toBe(false)
    expect(isOn(undefined, 'costing_grid')).toBe(false)
  })
})

describe('offMessage', () => {
  it('names the feature when it can', () => {
    expect(offMessage([feature()], 'costing_grid')).toBe('The costing grid is not switched on for your company.')
  })

  it('and says something sensible when it cannot', () => {
    expect(offMessage(undefined, 'costing_grid')).toMatch(/not switched on for your company/)
  })
})
