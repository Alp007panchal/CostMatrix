import { describe, expect, it } from 'vitest'
import { validateProposal } from './proposals.ts'

const kit = '11111111-2222-4333-8444-555555555555'
const line = {
  kind: 'kit', ref_id: kit, name: '630A,TP,MCCB, Adjustable, 36kA-OUTGOER-KIT', qty: 1,
  confidence: 'high', reason: 'rating, poles and operation match', evidence: { document_id: kit, page: 3, quote: '1 × 630A TP MCCB' },
}

describe('a draft_costing proposal', () => {
  it('is accepted in the shape of spec §6.3', () => {
    const r = validateProposal('draft_costing', {
      summary: 'One board', panels: [{ name: 'MAIN LV BOARD', qty: 1, parameters: { incomer_a: 1600 }, lines: [line],
        unresolved: [{ text: '2 × synchro-check relays', suggestion: 'placeholder' }] }],
      notes_for_engineer: ['Form 3B assumed'],
    })
    expect(r.ok).toBe(true)
  })

  it('refuses a line that names no kit id from a search result', () => {
    const r = validateProposal('draft_costing', { summary: 's', panels: [{ name: 'P', lines: [{ ...line, ref_id: 'the 630 A kit' }] }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join()).toMatch(/ref_id must be a kit or component id/)
  })

  it('refuses a line without evidence: every proposed line cites the document', () => {
    const { evidence: _e, ...bare } = line
    const r = validateProposal('draft_costing', { summary: 's', panels: [{ name: 'P', lines: [bare] }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join()).toMatch(/cite the document and page/)
  })

  it('refuses an unknown confidence, a zero quantity and an empty panel list', () => {
    expect(validateProposal('draft_costing', { summary: 's', panels: [] }).ok).toBe(false)
    expect(validateProposal('draft_costing', { summary: 's', panels: [{ name: 'P', lines: [{ ...line, qty: 0 }] }] }).ok).toBe(false)
    expect(validateProposal('draft_costing', { summary: 's', panels: [{ name: 'P', lines: [{ ...line, confidence: 'sure' }] }] }).ok).toBe(false)
  })

  it('refuses anything that is not an object, in words', () => {
    const r = validateProposal('draft_costing', 'a string')
    expect(r).toEqual({ ok: false, errors: ['payload must be an object'] })
  })
})

describe('a review proposal', () => {
  it('is accepted with findings of known severity and an inline line change', () => {
    const r = validateProposal('review', {
      summary: 'Two problems', findings: [
        { severity: 'blocker', code: 'placeholder_part', text: 'SYNCHRO CHECK RELAY has no price', evidence: { quote: 'line 4' } },
        { severity: 'warning', code: 'missing_outgoer', text: 'The document asks for a 630 A outgoer', evidence: { page: 2 },
          proposal: { action: 'add', ref: kit, qty: 1, reason: 'the document calls for it' } },
      ],
    })
    expect(r.ok).toBe(true)
  })

  it('refuses an unknown severity and a change with no action', () => {
    const bad = validateProposal('review', { summary: 's', findings: [{ severity: 'fatal', code: 'x', text: 't' }] })
    expect(bad.ok).toBe(false)
    const noAction = validateProposal('review', { summary: 's', findings: [{ severity: 'note', code: 'x', text: 't', proposal: { reason: 'r' } }] })
    expect(noAction.ok).toBe(false)
    if (!noAction.ok) expect(noAction.errors.join()).toMatch(/findings\[0\]\.proposal\.action/)
  })
})

describe('a line_change proposal', () => {
  it('needs the line to change unless it adds one', () => {
    expect(validateProposal('line_change', { action: 'remove', panel_line_item_id: kit, reason: 'duplicate' }).ok).toBe(true)
    expect(validateProposal('line_change', { action: 'remove', reason: 'duplicate' }).ok).toBe(false)
    expect(validateProposal('line_change', { action: 'add', ref: kit, qty: 2, reason: 'called for' }).ok).toBe(true)
    expect(validateProposal('line_change', { action: 'add', qty: 2, reason: 'called for' }).ok).toBe(false)
  })

  it('needs a quantity to change one, and a parameter name to set one', () => {
    expect(validateProposal('line_change', { action: 'change_qty', panel_line_item_id: kit, reason: 'r' }).ok).toBe(false)
    expect(validateProposal('line_change', { action: 'change_qty', panel_line_item_id: kit, qty: 3, reason: 'r' }).ok).toBe(true)
    expect(validateProposal('line_change', { action: 'set_parameter', panel_line_item_id: kit, reason: 'r' }).ok).toBe(false)
    expect(validateProposal('line_change', { action: 'set_parameter', panel_line_item_id: kit, parameter: 'form', value: '4B', reason: 'r' }).ok).toBe(true)
  })
})
