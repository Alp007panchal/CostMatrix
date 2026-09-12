import { describe, expect, it } from 'vitest'
import type { KitParameter } from '../../lib/database.types'
import { answerProblem, answerProblems, describeAnswers, startingAnswers } from './kit-parameters'

const param = (over: Partial<KitParameter>): KitParameter =>
  ({
    id: 'p', assembly_id: 'k', name: 'busbar_metres', value_type: 'number', unit: 'm',
    default_value: '6.5', min_value: 1, max_value: 40, sort_order: 0, ...over,
  }) as KitParameter

describe('kit parameters on screen', () => {
  it('starts from the kit’s own defaults', () => {
    expect(startingAnswers([param({}), param({ name: 'steps', default_value: '4', unit: null })]))
      .toEqual({ busbar_metres: '6.5', steps: '4' })
  })

  it('starts blank where the kit offers no default', () => {
    expect(startingAnswers([param({ default_value: null })])).toEqual({ busbar_metres: '' })
  })

  it('asks for an answer before it will add anything', () => {
    expect(answerProblem(param({}), '   ')).toBe('busbar_metres is needed before this kit can be added')
  })

  it('says the same things the database would, in the same words', () => {
    expect(answerProblem(param({}), 'lots')).toBe('busbar_metres must be a number')
    expect(answerProblem(param({}), '0.5')).toBe('busbar_metres must be at least 1')
    expect(answerProblem(param({}), '41')).toBe('busbar_metres must be at most 40')
    expect(answerProblem(param({}), '9')).toBeNull()
  })

  it('gathers every problem at once rather than one at a time', () => {
    const problems = answerProblems(
      [param({}), param({ name: 'steps', min_value: 1, max_value: 12, unit: null })],
      { busbar_metres: '0', steps: '99' },
    )
    expect(problems).toEqual(['busbar_metres must be at least 1', 'steps must be at most 12'])
  })

  it('reads the answers back in words, with the units', () => {
    expect(describeAnswers({ busbar_metres: '9', steps: '6' }, [param({}), param({ name: 'steps', unit: null })]))
      .toBe('busbar metres 9 m, steps 6')
  })
})
