// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { AssistantProposal, Document, Kit } from '../../lib/database.types'
import { AssistantPanel } from './AssistantPanel'
import { ProposalCard } from './ProposalCard'
import { ReviewCard } from './ReviewCard'
import * as api from './api'

/**
 * The panel and the two cards on screen: what an engineer sees when the
 * assistant is off, when a live call fails for want of credit, and when a
 * proposal is waiting — including that Apply sends only the lines accepted
 * (acceptance test 4) and that a Low-confidence line starts rejected.
 */

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./api', () => ({
  listConversations: vi.fn(async () => []),
  listMessages: vi.fn(async () => []),
  listProposals: vi.fn(async () => []),
  getAllowance: vi.fn(async () => ({ enabled: true, monthly_token_budget: 2000000, used_this_month: 0, recent_requests: 0, rate_limit_per_minute: 20 })),
  getUsage: vi.fn(),
  ask: vi.fn(async () => null),
  applyProposal: vi.fn(async () => ({ costing_id: 'c1', created_costing: false, status: 'applied', lines: [] })),
  rejectProposal: vi.fn(async () => undefined),
  getAssistantOptions: vi.fn(),
  setAssistantOption: vi.fn(),
}))
vi.mock('../documents/api', () => ({ listDocuments: vi.fn(async () => DOCUMENTS) }))
vi.mock('../costing/api', () => ({ listKits: vi.fn(async () => KITS) }))
vi.mock('../auth/session', () => ({
  useSession: () => ({ hasRole: (r: string) => r === 'costing_engineer', isMasterAdmin: false }),
}))

const KIT_A = '11111111-2222-4333-8444-555555555555'
const KIT_B = '22222222-2222-4333-8444-555555555555'
const DOCUMENTS: Document[] = [{
  id: 'd1', company_id: 'c2', entity_type: 'costing', entity_id: 'c1', file_name: 'spec.pdf', path: 'p',
  mime_type: 'application/pdf', size_bytes: 1, note: null, extracted_text: 'x', extraction_status: 'done',
  extraction_error: null, extracted_at: null, created_at: '2026-09-11T00:00:00Z', created_by: null,
}]
const KITS = [
  { id: KIT_A, name: '1600A ACB KIT', is_active: true, has_unpriced_part: false },
  { id: KIT_B, name: '630A OUTGOER KIT', is_active: true, has_unpriced_part: false },
] as Kit[]

const DRAFT: AssistantProposal = {
  id: 'p1', conversation_id: 'conv', message_id: 'm1', company_id: 'c2', entity_type: 'costing', entity_id: 'c1',
  type: 'draft_costing', status: 'open', applied_by: null, applied_at: null, result: null,
  created_at: '2026-09-11T00:00:00Z',
  payload: {
    summary: 'One board',
    panels: [{
      name: 'MAIN LV BOARD', qty: 1,
      lines: [
        { section: 'Incomer', kind: 'kit', ref_id: KIT_A, name: '1600A ACB KIT', qty: 1, confidence: 'high', reason: 'exact match', evidence: { document_id: 'd1', page: 2, quote: '1600A FP ACB' } },
        { section: 'Outgoers', kind: 'kit', ref_id: KIT_B, name: '630A OUTGOER KIT', qty: 2, confidence: 'low', reason: 'nearest guess' },
      ],
      unresolved: [{ text: '2 synchro-check relays', suggestion: 'placeholder' }],
    }],
    notes_for_engineer: ['Rear access mentioned; company default is front.'],
  },
}

const REVIEW: AssistantProposal = {
  ...DRAFT, id: 'p2', type: 'review',
  payload: {
    summary: 'Two things',
    findings: [
      { severity: 'note', code: 'ct_count', text: 'Fourteen CTs looks high' },
      { severity: 'blocker', code: 'placeholder_part', text: 'A line has no price', evidence: { document_id: 'd1', page: 3 },
        proposal: { action: 'add', ref: KIT_B, qty: 1, reason: 'the offer lists it' } },
    ],
  },
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('the Assistant panel', () => {
  it('is closed until it is opened, so a screen nobody uses it on costs nothing', async () => {
    wrap(<AssistantPanel entityType="costing" entityId="c1" canApply />)
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
    expect(api.getAllowance).not.toHaveBeenCalled()
  })

  it('says plainly when the assistant is switched off, and offers nothing else', async () => {
    vi.mocked(api.getAllowance).mockResolvedValueOnce({
      enabled: false, monthly_token_budget: 2000000, used_this_month: 0, recent_requests: 0, rate_limit_per_minute: 20,
    })
    wrap(<AssistantPanel entityType="costing" entityId="c1" canApply />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(screen.getByText(/switched off for your company/)).toBeTruthy())
    expect(screen.queryByRole('button', { name: /Review before submission/ })).toBeNull()
  })

  it('offers the suggested actions, and says why drafting is not available with nothing attached', async () => {
    vi.mocked(await import('../documents/api')).listDocuments.mockResolvedValueOnce([])
    wrap(<AssistantPanel entityType="costing" entityId="c1" canApply />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Review before submission/ })).toBeTruthy())
    const draft = screen.getByRole('button', { name: /Draft this costing/ }) as HTMLButtonElement
    expect(draft.disabled).toBe(true)
    expect(screen.getByText(/Attach the specification first/)).toBeTruthy()
  })

  it('shows a failed live call as a reason and what to do, not a generic error', async () => {
    vi.mocked(api.ask).mockResolvedValueOnce({
      code: 'no_credit',
      text: 'The assistant could not answer: the Anthropic account has no credit left.',
      remedy: 'An administrator tops it up at console.anthropic.com → Billing. Nothing in CostMatrix needs changing, and nothing has been lost.',
      retryable: false,
    })
    wrap(<AssistantPanel entityType="costing" entityId="c1" canApply />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /What kits match/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /What kits match/ }))
    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(within(alert).getByText(/no credit left/)).toBeTruthy()
    expect(within(alert).getByText(/console\.anthropic\.com/)).toBeTruthy()
  })

  it('shows what the assistant is doing in the team’s words while it works', async () => {
    vi.mocked(api.ask).mockImplementationOnce(async (_input, onEvent) => {
      onEvent({ type: 'tool_call', name: 'search_kits', input: { q: '630A outgoer' } })
      onEvent({ type: 'text', text: 'Two kits match.' })
      return null
    })
    wrap(<AssistantPanel entityType="costing" entityId="c1" canApply />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /What kits match/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /What kits match/ }))
    await waitFor(() => expect(screen.getByText(/Looking for kits matching “630A outgoer”/)).toBeTruthy())
  })

  it('shows the proposal card when one is open', async () => {
    vi.mocked(api.listProposals).mockResolvedValueOnce([DRAFT])
    wrap(<AssistantPanel entityType="costing" entityId="c1" canApply />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(screen.getByText('Proposed costing')).toBeTruthy())
  })
})

describe('the Proposal card', () => {
  it('lists every proposed line with its evidence and confidence', () => {
    wrap(<ProposalCard proposal={DRAFT} documents={DOCUMENTS} kits={KITS} canApply onApplied={() => {}} />)
    expect(screen.getByText('1600A ACB KIT')).toBeTruthy()
    expect(screen.getByText(/spec.pdf p.2 — “1600A FP ACB”/)).toBeTruthy()
    expect(screen.getByText(/2 synchro-check relays/)).toBeTruthy()
    expect(screen.getByText(/Rear access mentioned/)).toBeTruthy()
    expect(screen.getByText(/Nothing has been changed/)).toBeTruthy()
  })

  it('starts with the Low-confidence line rejected, so Apply offers one line of two', () => {
    wrap(<ProposalCard proposal={DRAFT} documents={DOCUMENTS} kits={KITS} canApply onApplied={() => {}} />)
    expect(screen.getByRole('button', { name: 'Apply 1 accepted line' })).toBeTruthy()
  })

  it('applies only the accepted lines (test 4)', async () => {
    wrap(<ProposalCard proposal={DRAFT} documents={DOCUMENTS} kits={KITS} canApply onApplied={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply 1 accepted line' }))
    await waitFor(() => expect(api.applyProposal).toHaveBeenCalled())
    expect(vi.mocked(api.applyProposal).mock.calls[0]?.[1]).toEqual({
      lines: [{ panel: 0, line: 0, kind: 'kit', ref_id: KIT_A, qty: 1, section: 'Incomer' }],
    })
  })

  it('applies the Low line too once it is accepted on purpose', async () => {
    wrap(<ProposalCard proposal={DRAFT} documents={DOCUMENTS} kits={KITS} canApply onApplied={() => {}} />)
    const row = screen.getByText('630A OUTGOER KIT').closest('tr') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Accept' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply 2 accepted lines' }))
    await waitFor(() => expect(api.applyProposal).toHaveBeenCalled())
    expect(vi.mocked(api.applyProposal).mock.calls[0]?.[1].lines).toHaveLength(2)
  })

  it('sends the quantity the engineer changed, not the model’s', async () => {
    wrap(<ProposalCard proposal={DRAFT} documents={DOCUMENTS} kits={KITS} canApply onApplied={() => {}} />)
    fireEvent.change(screen.getByLabelText('Quantity for 1600A ACB KIT'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply 1 accepted line' }))
    await waitFor(() => expect(api.applyProposal).toHaveBeenCalled())
    expect(vi.mocked(api.applyProposal).mock.calls[0]?.[1].lines?.[0]?.qty).toBe(3)
  })

  it('offers no Apply button at all on a costing that is not an open draft', () => {
    wrap(<ProposalCard proposal={DRAFT} documents={DOCUMENTS} kits={KITS} canApply={false} onApplied={() => {}} />)
    expect(screen.queryByRole('button', { name: /^Apply/ })).toBeNull()
    expect(screen.getByText(/Only a costing engineer or approver can apply this/)).toBeTruthy()
  })
})

describe('the Review card', () => {
  it('puts the blocker first and applies one finding’s fix', async () => {
    wrap(<ReviewCard proposal={REVIEW} documents={DOCUMENTS} panels={[]} canApply onApplied={() => {}} />)
    const items = screen.getAllByRole('listitem')
    expect(within(items[0] as HTMLElement).getByText('blocker')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apply this fix' }))
    await waitFor(() => expect(api.applyProposal).toHaveBeenCalledWith('p2', { finding: 1 }))
  })

  it('offers no fix for a finding that has none', () => {
    wrap(<ReviewCard proposal={REVIEW} documents={DOCUMENTS} panels={[]} canApply onApplied={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'Apply this fix' })).toHaveLength(1)
  })

  it('marks a finding already applied instead of offering it twice', () => {
    const partly = { ...REVIEW, status: 'partially_applied' as const, result: { findings_applied: [1] } }
    wrap(<ReviewCard proposal={partly} documents={DOCUMENTS} panels={[]} canApply onApplied={() => {}} />)
    expect(screen.getByText('applied')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Apply this fix' })).toBeNull()
  })
})
