import { describe, expect, it } from 'vitest'
import type { BoardAnswers, BoardLine, BoardProposal } from '../../lib/database.types'
import {
  answersProblem, bySection, describeBoard, emptyAnswers, gapsSentence, keptFeeders, linesToApply,
  notExact, toQuestionPayload,
} from './board'

const answers = (over: Partial<BoardAnswers> = {}): BoardAnswers => ({
  ...emptyAnswers(),
  incomer_rating_a: 1250,
  feeders: [{ rating_a: 100, quantity: 12, type: 'mccb' }],
  ...over,
})

const line = (over: Partial<BoardLine> = {}): BoardLine => ({
  assembly_id: 'k1', code: 'ACB-1250', name: '1250A ACB KIT', rating: 1250, group_name: 'ACB frame 1',
  role: 'incomer', section: 'Incomer', quantity: 1, why: '1250 A asked for', exact: true, ...over,
})

describe('what still has to be answered', () => {
  it('needs an incomer rating before anything can be worked out', () => {
    expect(answersProblem(answers({ incomer_rating_a: null }))).toMatch(/rated at, in amps/)
    expect(answersProblem(answers())).toBeNull()
  })
  it('will not put a changeover on a board with one supply', () => {
    expect(answersProblem(answers({ changeover: 'ats' }))).toMatch(/two supplies/)
    expect(answersProblem(answers({ changeover: 'ats', sources: ['grid', 'generator'] }))).toBeNull()
  })
  it('needs something to go out, to correct or to meter', () => {
    expect(answersProblem(answers({ feeders: [] }))).toMatch(/at least one outgoing way/)
    expect(answersProblem(answers({ feeders: [], metering: true }))).toBeNull()
    expect(answersProblem(answers({ feeders: [], apfc_kvar: 400 }))).toBeNull()
  })
  it('wants a rating on every way somebody filled in', () => {
    expect(answersProblem(answers({ feeders: [{ rating_a: 0, quantity: 4, type: 'mccb' }] })))
      .toMatch(/at least one outgoing way/)
  })
  it('ignores the blank feeder row the form starts with', () => {
    expect(keptFeeders(answers({
      feeders: [{ rating_a: 0, quantity: 0, type: 'mccb' }, { rating_a: 63, quantity: 6, type: 'mcb' }],
    }))).toEqual([{ rating_a: 63, quantity: 6, type: 'mcb' }])
  })
})

describe('the answers as the database wants them', () => {
  it('sends numbers as numbers and blanks as null', () => {
    expect(toQuestionPayload(answers({ form: '  4B ', ip: '', incomer_type: '', apfc_kvar: 0 })))
      .toEqual({
        sources: ['grid'],
        incomer_rating_a: 1250,
        incomer_type: null,
        changeover: null,
        feeders: [{ rating_a: 100, quantity: 12, type: 'mccb' }],
        apfc_kvar: null,
        metering: false,
        form: '4B',
        ip: null,
        access: null,
        cable_entry: null,
      })
  })
})

describe('the proposal on screen', () => {
  const lines = [
    line(),
    line({ assembly_id: 'k2', section: 'Outgoers', name: '100A MCCB KIT', quantity: 12, role: 'outgoer' }),
    line({ assembly_id: 'k3', section: 'APFC bank', name: '50KVAR STEP', quantity: 4, role: 'apfc' }),
    line({ assembly_id: 'k4', section: 'ATS', name: '1250A ATS KIT', quantity: 1, role: 'changeover' }),
  ]

  it('reads in the order a board is read', () => {
    expect(bySection(lines).map((g) => g.section)).toEqual(['Incomer', 'ATS', 'Outgoers', 'APFC bank'])
  })
  it('counts what applying would put on the panel', () => {
    expect(describeBoard(lines)).toBe('18 kits in 4 sections')
    expect(describeBoard([])).toBe('nothing yet')
  })
  it('drops the lines the engineer zeroed', () => {
    const edited = [...lines.slice(0, 2), line({ assembly_id: 'k3', section: 'APFC bank', quantity: 0 })]
    expect(linesToApply(edited).map((l) => l.assembly_id)).toEqual(['k1', 'k2'])
    expect(describeBoard(edited)).toBe('13 kits in 2 sections')
  })
  it('names the kits bigger than what was asked for', () => {
    const over = [...lines, line({ assembly_id: 'k5', exact: false, note: 'nothing above 4000 A' })]
    expect(notExact(over)).toHaveLength(1)
    expect(notExact(over.map((l) => ({ ...l, quantity: 0 })))).toHaveLength(0)
  })
})

describe('what the library cannot answer', () => {
  const proposal = (missing: BoardProposal['missing']): BoardProposal => ({
    panel_id: 'p1', panel: 'MDB', lines: [], missing, parameters: {},
  })
  it('says nothing when everything was answered', () => {
    expect(gapsSentence(proposal([]))).toBeNull()
  })
  it('names the first gap, and counts the rest', () => {
    expect(gapsSentence(proposal([{ what: 'a 4000 A incomer', why: 'no kit of that kind' }])))
      .toBe('a 4000 A incomer: no kit of that kind.')
    expect(gapsSentence(proposal([
      { what: 'a 4000 A incomer', why: 'no kit of that kind' },
      { what: '12 × 800 A outgoer', why: 'every kit of that kind is unpriced' },
    ]))).toMatch(/And 1 more/)
  })
})
