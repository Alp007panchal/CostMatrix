// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Company } from '../../lib/database.types'
import { AssistantSettingsPage } from './AssistantSettingsPage'
import * as api from './api'
import * as adminApi from '../admin/api'

/**
 * Whose assistant the settings screen is about (roadmap 3.7, migration 0134).
 *
 * The master administrator is the only person allowed to switch it on, so until
 * they could pick a company they could only ever switch it on for their own —
 * and an external company could never have it at all. These are the two things
 * that must hold: the picker is theirs alone, and choosing a company moves
 * every reading on the page, not just the switch.
 */

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./api', () => ({
  getAssistantOptions: vi.fn(async () => ({ ai_enabled: false, ai_monthly_token_budget: 500000 })),
  setAssistantOption: vi.fn(async () => undefined),
  getUsage: vi.fn(async () => ({
    company_id: 'alpha', months: [], cost_usd_this_month: 0, by_user_this_month: [], proposals: {},
    allowance: { enabled: false, monthly_token_budget: 500000, used_this_month: 0, recent_requests: 0, rate_limit_per_minute: 20 },
  })),
}))
vi.mock('../admin/api', () => ({ listCompanies: vi.fn(async () => COMPANIES) }))

const COMPANIES = [
  { id: 'alpha', name: 'Nationwide Power', is_active: true },
  { id: 'beta', name: 'Beta Switchgear', is_active: true },
] as Company[]

let master = true
vi.mock('../auth/session', () => ({
  useSession: () => ({
    company: { id: 'alpha', name: 'Nationwide Power' },
    isMasterAdmin: master,
    hasRole: () => true,
  }),
}))

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

afterEach(() => { cleanup(); vi.clearAllMocks(); master = true })

describe('whose assistant these settings are', () => {
  it('has no picker for a company administrator, and asks about no company', async () => {
    master = false
    wrap(<AssistantSettingsPage />)
    await waitFor(() => expect(api.getUsage).toHaveBeenCalled())
    expect(screen.queryByText('Whose assistant')).toBeNull()
    // No company id sent: the database answers about the caller's own.
    expect(vi.mocked(api.getUsage).mock.calls[0]?.[0]).toBeUndefined()
    expect(adminApi.listCompanies).not.toHaveBeenCalled()
  })

  it('lets the master administrator choose another company', async () => {
    wrap(<AssistantSettingsPage />)
    const picker = await screen.findByLabelText(/Whose assistant/)
    fireEvent.change(picker, { target: { value: 'beta' } })

    // The settings and the usage both follow the choice; a page that moved only
    // the switch would show one company's spending beside another's button.
    await waitFor(() => expect(api.getAssistantOptions).toHaveBeenCalledWith('beta'))
    await waitFor(() => expect(api.getUsage).toHaveBeenCalledWith('beta'))
    // The warning names the company, so nobody switches the wrong one on.
    expect(await screen.findByText(/not yours/)).toBeTruthy()
    expect(screen.getByText('Beta Switchgear', { selector: 'strong' })).toBeTruthy()
  })

  it('says nothing about another company while you are on your own', async () => {
    wrap(<AssistantSettingsPage />)
    await screen.findByLabelText(/Whose assistant/)
    expect(screen.queryByText(/not yours/)).toBeNull()
  })
})
