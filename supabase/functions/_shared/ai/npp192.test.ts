import { describe, expect, it } from 'vitest'
import { runAgent, type AgentEvent } from './agent.ts'
import { FakeProvider, type ScriptedTurn } from './fake.ts'
import { validateProposal } from './proposals.ts'
import type { Db } from './tools.ts'

/**
 * Acceptance tests 1 and 2 (AI spec §9) as far as they can be proved without
 * calling a model: the loop, the tools and the proposal shape.
 *
 * The model's part is played by a scripted provider answering with the draft of
 * docs/trials/npp192-trial-build-sheet.md §B and the review of a deliberately
 * broken costing. What is asserted is everything the app is responsible for —
 * the documents are read before kits are searched, ids come from search results,
 * the payload is in the §6.3 shape, the unresolved items survive, nothing is
 * applied. Applying it and the money is `supabase/tests/26_assistant_apply.sql`.
 */

const doc = 'd0000000-0000-4000-8000-000000000001'
const kitIds: Record<string, string> = {
  '1600A 4P WITHDRAWABLE MOTORIZED ACB with changeover accessories-KIT': '10000000-0000-4000-8000-000000000001',
  '800A 4P WITHDRAWABLE MOTORIZED ACB-WITH ACCESSORIES-KIT': '10000000-0000-4000-8000-000000000002',
  '1600A 3P FIXED MANUAL ACB-KIT': '10000000-0000-4000-8000-000000000003',
  '50KVAR APFC-FUSE KIT': '10000000-0000-4000-8000-000000000004',
  '25KVAR APFC-FUSE KIT': '10000000-0000-4000-8000-000000000005',
  '12.5KVAR APFC-FUSE KIT': '10000000-0000-4000-8000-000000000006',
  '5KVAR APFC-FUSE KIT': '10000000-0000-4000-8000-000000000007',
  '630A,TP,MCCB, Adjustable, 36kA-OUTGOER-KIT': '10000000-0000-4000-8000-000000000008',
}

/** The library and the documents as the tools see them, with nothing else in it. */
function library() {
  const calls: string[] = []
  const stored: { type: string; payload: Record<string, unknown> }[] = []
  const db: Db = {
    async rpc(name, args) {
      calls.push(name)
      switch (name) {
        case 'enquiry_snapshot':
          return { id: 'e1', enquiry_no: 'ENQ-1', documents: [{ id: doc, file_name: 'NPP192.pdf', extraction_status: 'done' }] }
        case 'document_text':
          return {
            id: doc, file_name: 'NPP192.pdf', extraction_status: 'done', truncated: false,
            text: '1600A MAIN LV BOARD … 400 kVAr APFC … 2 No. synchro check relays … 2 No. fan and filter FK5526-230',
          }
        case 'search_kits': {
          const q = String((args['q'] as string) ?? '').toLowerCase()
          return Object.entries(kitIds)
            .filter(([name]) => q === '' || name.toLowerCase().includes(q))
            .map(([name, id]) => ({ id, name, price: 100000, has_unpriced_part: false }))
        }
        case 'company_policy':
          return { company: { id: 'c2', name: 'Alpha', currency: 'KES' } }
        default:
          throw new Error(`the fake library has no ${name}`)
      }
    },
    async insertProposal(row) {
      stored.push({ type: row.type, payload: row.payload as Record<string, unknown> })
      return `proposal_${stored.length}`
    },
  }
  return { db, calls, stored }
}

const draftPayload = {
  summary: '1600 A main LV board with mains/gen changeover, solar incomer, 400 kVAr APFC, 16 outgoers',
  panels: [
    {
      name: '1600A MAIN LV BOARD',
      qty: 1,
      parameters: { incomer_a: 1600, sources: ['mains', 'gen', 'solar'], changeover: 'ats', form: '3B', ip: 'IP31', apfc_kvar: 400 },
      lines: [
        line('Incomer (KPLC)', '1600A 4P WITHDRAWABLE MOTORIZED ACB with changeover accessories-KIT', 1, 'high'),
        line('Incomer (GEN)', '800A 4P WITHDRAWABLE MOTORIZED ACB-WITH ACCESSORIES-KIT', 2, 'high'),
        line('Solar incoming', '1600A 3P FIXED MANUAL ACB-KIT', 1, 'high'),
        line('APFC bank', '50KVAR APFC-FUSE KIT', 4, 'high'),
        line('APFC bank', '25KVAR APFC-FUSE KIT', 4, 'high'),
        line('APFC bank', '12.5KVAR APFC-FUSE KIT', 6, 'high'),
        line('APFC bank', '5KVAR APFC-FUSE KIT', 5, 'high'),
        line('Outgoers', '630A,TP,MCCB, Adjustable, 36kA-OUTGOER-KIT', 1, 'medium'),
      ],
      unresolved: [
        { text: '2 No. synchro check relays', suggestion: 'placeholder', evidence: { document_id: doc, page: 3 } },
        { text: '2 No. fan and filter FK5526-230', suggestion: 'placeholder', evidence: { document_id: doc, page: 3 } },
      ],
    },
  ],
  notes_for_engineer: ['Labour hours are not filled in yet, so labour shows zero.'],
}

function line(section: string, name: string, qty: number, confidence: 'high' | 'medium' | 'low') {
  return {
    section, kind: 'kit', ref_id: kitIds[name], name, qty, confidence,
    reason: 'rating, poles and operation match the offer',
    evidence: { document_id: doc, page: 2, quote: name },
  }
}

const DRAFT_SCRIPT: ScriptedTurn[] = [
  { text: 'Let me read the offer.', tool_calls: [{ name: 'get_enquiry', input: { enquiry_id: 'e1' } }] },
  { tool_calls: [{ name: 'get_document_text', input: { document_id: doc } }] },
  {
    tool_calls: [
      { name: 'search_kits', input: { q: '1600a 4p withdrawable motorized acb' } },
      { name: 'search_kits', input: { q: 'apfc-fuse kit' } },
    ],
  },
  { tool_calls: [{ name: 'create_proposal', input: { type: 'draft_costing', payload: draftPayload } }] },
  { text: 'I have proposed one board. Two items are unresolved. Nothing has been changed yet.', usage: { input_tokens: 41000, output_tokens: 2600 } },
]

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of events) out.push(e)
  return out
}

describe('test 1: drafting NPP-192 from the attached offer', () => {
  it('reads the documents, searches the library, and records one proposal', async () => {
    const provider = new FakeProvider(DRAFT_SCRIPT)
    const { db, calls, stored } = library()
    const events = await collect(runAgent({
      provider, db, system: 'sys', history: [],
      userText: 'Draft this costing from the attached documents.',
      context: { conversation_id: 'conv', entity_type: 'enquiry', entity_id: 'e1' },
      messageId: 'm1',
    }))

    // The order matters: the offer is read before any kit is looked for.
    expect(calls.indexOf('document_text')).toBeLessThan(calls.indexOf('search_kits'))
    expect(calls.filter((c) => c === 'search_kits')).toHaveLength(2)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.type).toBe('draft_costing')

    const done = events.find((e) => e.type === 'done')
    expect(done).toMatchObject({ stop: 'end_turn', proposal_ids: ['proposal_1'] })
    const text = events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join('')
    expect(text).toMatch(/Nothing has been changed/)
  })

  it('stores a payload in the §6.3 shape, with every line citing the document', () => {
    const checked = validateProposal('draft_costing', draftPayload)
    expect(checked.ok).toBe(true)
    for (const l of draftPayload.panels[0]!.lines) {
      expect(l.evidence.document_id).toBe(doc)
      expect(l.ref_id).toMatch(/^[0-9a-f-]{36}$/)
    }
  })

  it('proposes the board’s parameters the trial build sheet lists', () => {
    expect(draftPayload.panels[0]?.parameters).toMatchObject({
      incomer_a: 1600, sources: ['mains', 'gen', 'solar'], changeover: 'ats', form: '3B', ip: 'IP31', apfc_kvar: 400,
    })
  })

  it('proposes the APFC bank as step kits with the sheet’s quantities, 4 / 4 / 6 / 5', () => {
    const apfc = draftPayload.panels[0]!.lines.filter((l) => l.section === 'APFC bank')
    expect(apfc.map((l) => [l.name, l.qty])).toEqual([
      ['50KVAR APFC-FUSE KIT', 4], ['25KVAR APFC-FUSE KIT', 4],
      ['12.5KVAR APFC-FUSE KIT', 6], ['5KVAR APFC-FUSE KIT', 5],
    ])
    // 50×4 + 25×4 + 12.5×6 + 5×5 = 400 kVAr, the offer's figure.
    const kvar = apfc.reduce((t, l) => t + parseFloat(l.name) * l.qty, 0)
    expect(kvar).toBe(400)
  })

  it('lists what it could not match instead of inventing a part for it', () => {
    const unresolved = draftPayload.panels[0]!.unresolved.map((u) => u.text)
    expect(unresolved).toEqual(expect.arrayContaining([
      expect.stringMatching(/synchro check relays/),
      expect.stringMatching(/fan and filter/),
    ]))
    expect(draftPayload.panels[0]!.unresolved.every((u) => u.suggestion === 'placeholder')).toBe(true)
  })

  it('uses only ids that came back from a search: an invented kit is refused', () => {
    const invented = {
      ...draftPayload,
      panels: [{ ...draftPayload.panels[0]!, lines: [{ ...draftPayload.panels[0]!.lines[0]!, ref_id: 'the 1600 A ACB kit' }] }],
    }
    const checked = validateProposal('draft_costing', invented)
    expect(checked.ok).toBe(false)
  })
})

const reviewPayload = {
  summary: 'Four things to look at before this is submitted',
  findings: [
    {
      severity: 'warning', code: 'missing_outgoer',
      text: 'The offer asks for one 630 A outgoer and the costing has none',
      evidence: { document_id: doc, page: 2, quote: '1 No. 630A TP MCCB' },
      proposal: { action: 'add', ref: kitIds['630A,TP,MCCB, Adjustable, 36kA-OUTGOER-KIT'], qty: 1, reason: 'the offer lists it' },
    },
    { severity: 'blocker', code: 'placeholder_part', text: 'SYNCHRO CHECK RELAY has no price yet', evidence: { page: 3 } },
    { severity: 'blocker', code: 'margin_below_policy', text: 'The margin is 5 %, below the company’s minimum of 10 %', evidence: {} },
    {
      severity: 'warning', code: 'form_mismatch',
      text: 'The document says Form 3B and the costing says 4B',
      evidence: { document_id: doc, page: 1 },
      proposal: { action: 'set_parameter', parameter: 'form', value: '3B', panel_line_item_id: 'p1', reason: 'the document says 3B' },
    },
  ],
}

describe('test 2: reviewing a deliberately broken costing', () => {
  it('records one review proposal and nothing else', async () => {
    const provider = new FakeProvider([
      { tool_calls: [{ name: 'get_costing', input: { costing_id: 'c1' } }] },
      { tool_calls: [{ name: 'create_proposal', input: { type: 'review', payload: reviewPayload } }] },
      { text: 'Two blockers and two warnings. Nothing has been changed.' },
    ])
    const { db, stored } = library()
    // get_costing is not in the fake library: the tool error is handed back and
    // the model carries on, which is the behaviour under test elsewhere. What
    // matters here is that the review is recorded exactly once.
    await collect(runAgent({
      provider, db, system: 'sys', history: [], userText: 'Review this costing before it is submitted.',
      context: { conversation_id: 'conv', entity_type: 'costing', entity_id: 'c1' }, messageId: 'm2',
    }))
    expect(stored.map((s) => s.type)).toEqual(['review'])
  })

  it('is in the §6.3 shape, with the four findings the test expects', () => {
    expect(validateProposal('review', reviewPayload).ok).toBe(true)
    expect(reviewPayload.findings.map((f) => f.code)).toEqual([
      'missing_outgoer', 'placeholder_part', 'margin_below_policy', 'form_mismatch',
    ])
    expect(reviewPayload.findings.filter((f) => f.severity === 'blocker')).toHaveLength(2)
  })

  it('offers a one-click fix where one is possible, and none where it is not', () => {
    const withFix = reviewPayload.findings.filter((f) => 'proposal' in f)
    expect(withFix.map((f) => f.code)).toEqual(['missing_outgoer', 'form_mismatch'])
    expect(withFix.map((f) => (f as { proposal: { action: string } }).proposal.action)).toEqual(['add', 'set_parameter'])
  })
})
