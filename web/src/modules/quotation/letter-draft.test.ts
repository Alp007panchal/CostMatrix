import { describe, expect, it } from 'vitest'
import type { AssistantProposal } from '../../lib/database.types'
import { draftedLines, latestWording, replacedCount, useWording } from './letter-draft'

const empty = { subject: '', intro_text: '', closing_text: '', notes_on_offer: '' }

const wording = {
  subject: 'QUOTATION FOR ONE MAIN LV BOARD',
  opening: 'Thank you for your enquiry.',
  closing: 'We look forward to your instructions.',
  notes: 'Form 3B, IP31, Siemens switchgear.',
}

const proposal = (over: Partial<AssistantProposal>): AssistantProposal =>
  ({
    id: 'p1', conversation_id: 'c1', message_id: null, company_id: 'co1',
    entity_type: 'costing', entity_id: 'x1', type: 'quotation_wording', status: 'open',
    payload: wording, applied_by: null, applied_at: null, result: null,
    created_at: '2026-09-16T00:00:00Z', ...over,
  }) as AssistantProposal

describe('finding the drafted letter', () => {
  it('takes the newest wording proposal and ignores the other kinds', () => {
    const found = latestWording([
      proposal({ id: 'r', type: 'review' }),
      proposal({ id: 'w' }),
      proposal({ id: 'older' }),
    ])
    expect(found?.id).toBe('w')
  })

  it('says there is none when the assistant has only reviewed', () => {
    expect(latestWording([proposal({ type: 'review' })])).toBeNull()
  })
})

describe('what the draft offers', () => {
  it('offers all four pieces against an empty form', () => {
    const lines = draftedLines(wording, empty)
    expect(lines.map((l) => l.key)).toEqual(['subject', 'intro_text', 'closing_text', 'notes_on_offer'])
    expect(lines.every((l) => l.replaces)).toBe(false)
  })

  it('leaves out a piece the assistant did not write, rather than offering a blank', () => {
    const lines = draftedLines({ ...wording, notes: '' }, empty)
    expect(lines.map((l) => l.key)).not.toContain('notes_on_offer')
  })

  // The rule that matters: somebody may have typed their own subject before
  // asking for a draft, and they should see what they are about to lose.
  it('marks a piece that would replace the approver’s own words', () => {
    const lines = draftedLines(wording, { ...empty, subject: 'MY OWN SUBJECT' })
    expect(lines.find((l) => l.key === 'subject')?.replaces).toBe(true)
    expect(lines.find((l) => l.key === 'intro_text')?.replaces).toBe(false)
    expect(replacedCount(wording, { ...empty, subject: 'MY OWN SUBJECT' })).toBe(1)
  })

  it('does not call it a replacement when the words are already identical', () => {
    expect(replacedCount(wording, { ...empty, subject: wording.subject })).toBe(0)
  })
})

describe('using the wording', () => {
  it('fills the form with what was drafted', () => {
    expect(useWording(wording, empty)).toEqual({
      subject: 'QUOTATION FOR ONE MAIN LV BOARD',
      intro_text: 'Thank you for your enquiry.',
      closing_text: 'We look forward to your instructions.',
      notes_on_offer: 'Form 3B, IP31, Siemens switchgear.',
    })
  })

  it('keeps a field the assistant left alone', () => {
    const form = { ...empty, notes_on_offer: 'my own note' }
    expect(useWording({ ...wording, notes: '' }, form).notes_on_offer).toBe('my own note')
  })

  it('changes nothing else on the form', () => {
    const before = { ...empty, subject: 'MINE' }
    const after = useWording({ subject: 'THEIRS' }, before)
    expect(after.intro_text).toBe('')
    expect(after.subject).toBe('THEIRS')
  })
})
