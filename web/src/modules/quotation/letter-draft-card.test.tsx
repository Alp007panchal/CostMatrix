// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { AssistantProposal } from '../../lib/database.types'
import { LetterDraft } from './LetterDraft'
import type { LetterFields } from './letter-draft'
import * as api from '../assistant/api'

/**
 * The card on the Release page: absent when the assistant is off, what it asks
 * for, and — the rule that matters — that it shows the approver which of their
 * own lines a draft would replace before they press the button.
 */

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../assistant/api', () => ({
  getAllowance: vi.fn(async () => ({ enabled: true, monthly_token_budget: 1, used_this_month: 0, recent_requests: 0, rate_limit_per_minute: 20 })),
  listProposals: vi.fn(async () => [] as AssistantProposal[]),
  ask: vi.fn(async () => null),
  useQuotationWording: vi.fn(async () => undefined),
  rejectProposal: vi.fn(async () => undefined),
}))

const EMPTY = { subject: '', intro_text: '', closing_text: '', notes_on_offer: '' }

const WORDING: AssistantProposal = {
  id: 'w1', conversation_id: 'conv', message_id: 'm1', company_id: 'c2',
  entity_type: 'costing', entity_id: 'c1', type: 'quotation_wording', status: 'open',
  applied_by: null, applied_at: null, result: null, created_at: '2026-09-16T00:00:00Z',
  payload: {
    subject: 'QUOTATION FOR ONE MAIN LV BOARD',
    opening: 'Thank you for your enquiry.',
    closing: 'We look forward to your instructions.',
    notes: 'Form 3B, IP31, Siemens switchgear.',
  },
} as AssistantProposal

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('drafting the letter on the Release page', () => {
  it('is not there at all when the assistant is switched off', async () => {
    vi.mocked(api.getAllowance).mockResolvedValueOnce({ enabled: false } as never)
    wrap(<LetterDraft costingId="c1" form={EMPTY} onUse={() => {}} />)
    await waitFor(() => expect(api.getAllowance).toHaveBeenCalled())
    expect(screen.queryByText('Draft the wording')).toBeNull()
  })

  it('asks for the letter task, not an ordinary question', async () => {
    wrap(<LetterDraft costingId="c1" form={EMPTY} onUse={() => {}} />)
    fireEvent.click(await screen.findByText('Draft the wording'))
    await waitFor(() => expect(api.ask).toHaveBeenCalled())
    expect(vi.mocked(api.ask).mock.calls[0]?.[0]).toMatchObject({
      entityType: 'costing', entityId: 'c1', task: 'letter',
    })
  })

  it('offers the four pieces, and says which of your own words would go', async () => {
    vi.mocked(api.listProposals).mockResolvedValue([WORDING])
    wrap(<LetterDraft costingId="c1" form={{ ...EMPTY, subject: 'MY OWN SUBJECT' }} onUse={() => {}} />)
    expect(await screen.findByText('Subject line')).toBeTruthy()
    expect(screen.getByText('Notes on offer')).toBeTruthy()
    expect(screen.getByText('replaces what you wrote')).toBeTruthy()
    expect(screen.getByText(/replaces 1 line you had already written/)).toBeTruthy()
  })

  it('hands the four boxes back and records that a person chose them', async () => {
    vi.mocked(api.listProposals).mockResolvedValue([WORDING])
    const used: LetterFields[] = []
    wrap(<LetterDraft costingId="c1" form={EMPTY} onUse={(next) => used.push(next)} />)
    fireEvent.click(await screen.findByText('Use this wording'))
    await waitFor(() => expect(api.useQuotationWording).toHaveBeenCalledWith('w1'))
    expect(used[0]).toEqual({
      subject: 'QUOTATION FOR ONE MAIN LV BOARD',
      intro_text: 'Thank you for your enquiry.',
      closing_text: 'We look forward to your instructions.',
      notes_on_offer: 'Form 3B, IP31, Siemens switchgear.',
    })
  })

  it('discarding rejects the proposal and writes nothing into the form', async () => {
    vi.mocked(api.listProposals).mockResolvedValue([WORDING])
    const used: LetterFields[] = []
    wrap(<LetterDraft costingId="c1" form={EMPTY} onUse={(next) => used.push(next)} />)
    fireEvent.click(await screen.findByText('Discard'))
    await waitFor(() => expect(api.rejectProposal).toHaveBeenCalled())
    expect(used).toEqual([])
  })
})
