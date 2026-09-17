// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AssistantPage } from './AssistantPage'
import * as api from './api'
import * as documentsApi from '../documents/api'

/**
 * Asking about the company's own jobs (roadmap 3.7, migration 0135).
 *
 * Two things this screen must get right, and both are about what it is *not*:
 * it opens without asking, because asking is the whole point of it; and it is
 * not about a record, so it never goes looking for files that cannot exist.
 */

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./api', () => ({
  listConversations: vi.fn(async () => []),
  listMessages: vi.fn(async () => []),
  listProposals: vi.fn(async () => []),
  getAllowance: vi.fn(async () => ({ enabled: true, monthly_token_budget: 1000, used_this_month: 0, recent_requests: 0, rate_limit_per_minute: 20 })),
  ask: vi.fn(async () => null),
  applyProposal: vi.fn(),
  rejectProposal: vi.fn(),
}))
vi.mock('../documents/api', () => ({ listDocuments: vi.fn(async () => []) }))
vi.mock('../costing/api', () => ({ listKits: vi.fn(async () => []) }))
vi.mock('../auth/session', () => ({
  useSession: () => ({
    company: { id: 'alpha', name: 'Nationwide Power' },
    hasRole: (r: string) => r === 'costing_engineer',
    isMasterAdmin: false,
  }),
}))

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('asking about the company’s own jobs', () => {
  it('opens ready to ask, and says whose jobs these are', async () => {
    wrap(<AssistantPage />)
    expect(screen.getByText('Ask about your jobs')).toBeTruthy()
    expect(screen.getByText(/Nationwide Power/)).toBeTruthy()
    // Open from the first render: a screen that exists to be asked should not
    // make you press Open first.
    expect(await screen.findByPlaceholderText(/Ask about this costing/)).toBeTruthy()
  })

  it('looks for the company’s conversations, not a record’s files', async () => {
    wrap(<AssistantPage />)
    await waitFor(() => expect(api.listConversations).toHaveBeenCalledWith('company', 'alpha'))
    // Nothing is ever attached to a company, so the files query must not run.
    expect(documentsApi.listDocuments).not.toHaveBeenCalled()
  })

  it('offers the questions somebody would actually walk over to ask', async () => {
    wrap(<AssistantPage />)
    expect(await screen.findByText('What have we quoted this month?')).toBeTruthy()
    expect(screen.getByText('Which jobs are still waiting to be approved?')).toBeTruthy()
    // And not the two that need a record in front of them.
    expect(screen.queryByText(/Draft this costing/)).toBeNull()
    expect(screen.queryByText('Review before submission')).toBeNull()
  })
})
