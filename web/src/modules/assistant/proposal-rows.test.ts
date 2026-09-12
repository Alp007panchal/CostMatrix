import { describe, expect, it } from 'vitest'
import type { AssistantProposal, ProposalPayload } from '../../lib/database.types'
import {
  acceptedCount, appliedFindings, decisionsFor, defaultChoices, draftRows, evidenceText,
  findingsOf, isOpen, rowKey, summaryOf, unresolvedOf,
} from './proposal-rows'

/**
 * Acceptance test 4, the half that is a rule rather than a database: nothing is
 * applied that a person did not accept, and a Low-confidence line is not
 * accepted for them (AI spec §3.2).
 */

const kit = '11111111-2222-4333-8444-555555555555'
const other = '99999999-2222-4333-8444-555555555555'

const draft: ProposalPayload = {
  summary: 'One board',
  panels: [
    {
      name: 'MAIN LV BOARD',
      qty: 1,
      lines: [
        { section: 'Incomer', kind: 'kit', ref_id: kit, name: '1600A ACB KIT', qty: 1, confidence: 'high', reason: 'exact', evidence: { document_id: 'd1', page: 2, quote: '1600A FP ACB' } },
        { section: 'Outgoers', kind: 'kit', ref_id: other, name: '630A OUTGOER KIT', qty: 3, confidence: 'medium', reason: 'rating found' },
        { section: 'Accessories', kind: 'component', ref_id: kit, name: 'LOGO', qty: 1, confidence: 'low', reason: 'nearest guess' },
      ],
      unresolved: [{ text: '2 synchro-check relays', suggestion: 'placeholder' }],
    },
  ],
}

describe('reading a drafted costing', () => {
  it('flattens the panels into rows that remember where each line came from', () => {
    const rows = draftRows(draft)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ panel: 0, line: 0, panelName: 'MAIN LV BOARD', section: 'Incomer', kind: 'kit', qty: 1 })
    expect(rows[2]).toMatchObject({ line: 2, kind: 'component', confidence: 'low' })
    expect(summaryOf(draft)).toBe('One board')
    expect(unresolvedOf(draft)).toHaveLength(1)
  })

  it('treats an unknown confidence as low rather than letting it through as high', () => {
    const odd = { panels: [{ name: 'P', lines: [{ kind: 'kit', ref_id: kit, name: 'X', qty: 1, confidence: 'certain' }] }] } as ProposalPayload
    expect(draftRows(odd)[0]?.confidence).toBe('low')
  })
})

describe('test 4: nothing is applied that nobody accepted', () => {
  it('starts with High and Medium accepted and Low rejected', () => {
    const rows = draftRows(draft)
    const choices = defaultChoices(rows)
    expect(choices[rowKey(rows[0]!)]?.choice).toBe('accept')
    expect(choices[rowKey(rows[1]!)]?.choice).toBe('accept')
    expect(choices[rowKey(rows[2]!)]?.choice).toBe('reject')
    expect(acceptedCount(rows, choices)).toBe(2)
  })

  it('sends only the accepted lines, with their place in the proposal', () => {
    const rows = draftRows(draft)
    const decisions = decisionsFor(rows, defaultChoices(rows))
    expect(decisions.lines).toEqual([
      { panel: 0, line: 0, kind: 'kit', ref_id: kit, qty: 1, section: 'Incomer' },
      { panel: 0, line: 1, kind: 'kit', ref_id: other, qty: 3, section: 'Outgoers' },
    ])
  })

  it('sends nothing at all when every line was rejected', () => {
    const rows = draftRows(draft)
    const none = Object.fromEntries(rows.map((r) => [rowKey(r), { choice: 'reject' as const }]))
    expect(decisionsFor(rows, none).lines).toEqual([])
    expect(acceptedCount(rows, none)).toBe(0)
  })

  it('carries a changed kit and a changed quantity instead of the model’s', () => {
    const rows = draftRows(draft)
    const choices = { ...defaultChoices(rows), [rowKey(rows[0]!)]: { choice: 'accept' as const, refId: other, qty: 4 } }
    expect(decisionsFor(rows, choices).lines?.[0]).toMatchObject({ ref_id: other, qty: 4 })
  })

  it('includes a Low line only once somebody accepted it on purpose', () => {
    const rows = draftRows(draft)
    const choices = { ...defaultChoices(rows), [rowKey(rows[2]!)]: { choice: 'accept' as const } }
    expect(decisionsFor(rows, choices).lines).toHaveLength(3)
  })

  it('passes a title through for a costing created from an enquiry', () => {
    const rows = draftRows(draft)
    expect(decisionsFor(rows, defaultChoices(rows), { title: 'NPP-193' }).title).toBe('NPP-193')
    expect(decisionsFor(rows, defaultChoices(rows)).title).toBeUndefined()
  })
})

describe('reading a review', () => {
  const review: ProposalPayload = {
    summary: 'Three things',
    findings: [
      { severity: 'note', code: 'c1', text: 'A note' },
      { severity: 'blocker', code: 'c2', text: 'A blocker' },
      { severity: 'warning', code: 'c3', text: 'A warning' },
    ],
  }

  it('puts the most serious first and keeps each finding’s own number', () => {
    expect(findingsOf(review).map((f) => [f.severity, f.index])).toEqual([
      ['blocker', 1], ['warning', 2], ['note', 0],
    ])
  })

  it('knows which findings have already been applied, so they are not offered twice', () => {
    const proposal = { status: 'partially_applied', result: { findings_applied: [1] } } as AssistantProposal
    expect(appliedFindings(proposal)).toEqual([1])
    expect(isOpen(proposal)).toBe(true)
    expect(isOpen({ status: 'applied' } as AssistantProposal)).toBe(false)
    expect(appliedFindings({ status: 'open', result: null } as AssistantProposal)).toEqual([])
  })
})

describe('the evidence column', () => {
  it('reads as the file, the page and the sentence', () => {
    expect(evidenceText({ document_id: 'd1', page: 2, quote: '1600A FP ACB' }, 'spec.pdf'))
      .toBe('spec.pdf p.2 — “1600A FP ACB”')
  })

  it('shows what it has when the document is gone or the page unknown', () => {
    expect(evidenceText({ quote: 'only the words' }, null)).toBe('“only the words”')
    expect(evidenceText({ page: 4 }, 'spec.pdf')).toBe('spec.pdf p.4')
    expect(evidenceText(null)).toBe('')
  })
})
