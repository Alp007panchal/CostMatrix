import { describe, expect, it } from 'vitest'
import { parseSse, reasonFor, suggestedActions } from './events'

/**
 * The two things the owner asked to be sure of before testing live: that a
 * failure reads as a reason and a remedy, and that the stream is read as it
 * arrives rather than all at once.
 */

describe('what the panel says when a call fails', () => {
  it('names no credit and where to top it up, with nothing about CostMatrix to change', () => {
    const f = reasonFor('no_credit')
    expect(f.text).toMatch(/no credit left/)
    expect(f.remedy).toMatch(/console\.anthropic\.com/)
    expect(f.remedy).toMatch(/Nothing in CostMatrix needs changing/)
    expect(f.retryable).toBe(false)
  })

  it('names a refused key and the setting to check', () => {
    const f = reasonFor('bad_key')
    expect(f.text).toMatch(/refused the key/)
    expect(f.remedy).toMatch(/ANTHROPIC_API_KEY/)
  })

  it('names an unknown model and the setting to check', () => {
    const f = reasonFor('unknown_model')
    expect(f.text).toMatch(/does not exist/)
    expect(f.remedy).toMatch(/AI_MODEL/)
  })

  it('prefers the server’s own sentence when it sent one, and still adds the remedy', () => {
    const f = reasonFor('no_credit', 'Your credit balance is too low to access the Anthropic API.')
    expect(f.text).toBe('Your credit balance is too low to access the Anthropic API.')
    expect(f.remedy).toMatch(/Billing/)
  })

  it('says who can switch the assistant on, and who can raise a spent budget', () => {
    expect(reasonFor('switched_off', 'The assistant is switched off for your company.').remedy)
      .toMatch(/master administrator/)
    expect(reasonFor('budget_spent', 'Budget gone.').remedy).toMatch(/raise it/)
  })

  it('marks the three waiting failures as worth trying again', () => {
    expect(reasonFor('rate_limit').retryable).toBe(true)
    expect(reasonFor('unreachable').retryable).toBe(true)
    expect(reasonFor('offline').retryable).toBe(true)
  })

  it('never leaves a person with nothing: an unknown failure still says something', () => {
    const f = reasonFor(undefined)
    expect(f.code).toBe('unknown')
    expect(f.text).toMatch(/could not answer/)
    const nonsense = reasonFor('made_up' as never, '   ')
    expect(nonsense.code).toBe('unknown')
    expect(nonsense.text).toMatch(/could not answer/)
  })
})

describe('reading the stream', () => {
  it('returns whole events and keeps the half-written one for the next chunk', () => {
    const first = parseSse('data: {"type":"text","text":"Hello"}\n\ndata: {"type":"text","te')
    expect(first.events).toEqual([{ type: 'text', text: 'Hello' }])
    const second = parseSse(`${first.rest}xt":" world"}\n\n`)
    expect(second.events).toEqual([{ type: 'text', text: ' world' }])
    expect(second.rest).toBe('')
  })

  it('ignores a line that is not an event rather than losing the rest of the answer', () => {
    const { events } = parseSse(': keep-alive\n\ndata: not json\n\ndata: {"type":"proposal","proposal_id":"p1"}\n\n')
    expect(events).toEqual([{ type: 'proposal', proposal_id: 'p1' }])
  })

  it('reads several events out of one chunk, in order', () => {
    const { events } = parseSse(
      'data: {"type":"tool_call","name":"search_kits","input":{}}\n\n' +
      'data: {"type":"tool_result","name":"search_kits","is_error":false,"chars":12}\n\n',
    )
    expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result'])
  })
})

describe('the suggested actions', () => {
  it('offers drafting and a question on an enquiry, and a review too on a costing', () => {
    expect(suggestedActions('enquiry', { hasDocuments: true, hasLines: false }).map((a) => a.task))
      .toEqual(['draft', 'question'])
    expect(suggestedActions('costing', { hasDocuments: true, hasLines: true }).map((a) => a.task))
      .toEqual(['draft', 'review', 'question'])
  })

  it('says why drafting is not offered when nothing is attached', () => {
    const [draft] = suggestedActions('enquiry', { hasDocuments: false, hasLines: false })
    expect(draft?.hint).toMatch(/Attach the specification first/)
  })

  it('says why reviewing is not offered when nothing is costed', () => {
    const review = suggestedActions('costing', { hasDocuments: true, hasLines: false })[1]
    expect(review?.hint).toMatch(/nothing costed to review/)
  })
})
