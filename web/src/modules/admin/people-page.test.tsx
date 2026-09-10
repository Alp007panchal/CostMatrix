// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { PersonWithRoles } from '../../lib/database.types'
import { PeoplePage } from './PeoplePage'

const COMPANIES = [
  { id: 'co1', name: 'Nationwide Power Systems' },
  { id: 'co2', name: 'Test company' },
]

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./api', () => ({
  listPeople: vi.fn(),
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
  setPersonActive: vi.fn(),
  movePerson: vi.fn(),
  removePerson: vi.fn(),
  invitePerson: vi.fn(),
}))
vi.mock('../auth/session', () => ({
  useSession: () => ({
    session: null,
    profile: null,
    company: { id: 'co1', name: 'Nationwide Power Systems' },
    companies: COMPANIES,
    companyName: (id: string) => COMPANIES.find((c) => c.id === id)?.name ?? '—',
    roles: ['company_admin'],
    loading: false,
    isMasterAdmin: true,
    hasRole: () => true,
    refresh: async () => {},
    signOut: async () => {},
  }),
}))

const person = (over: Partial<PersonWithRoles>): PersonWithRoles => ({
  id: 'p1',
  company_id: 'co1',
  full_name: 'Somebody',
  email: 'somebody@example.test',
  is_master_admin: false,
  is_active: true,
  created_at: '',
  roles: ['costing_engineer'],
  records: 0,
  ...over,
})

const PEOPLE: PersonWithRoles[] = [
  person({ id: 'p1', full_name: 'Fresh Invitation', records: 0 }),
  person({ id: 'p2', full_name: 'Busy Engineer', records: 7 }),
  person({ id: 'p3', full_name: 'The Owner', is_master_admin: true, records: 0 }),
]

function renderPeople(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(['people'], PEOPLE)
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
}

const rowFor = (name: string) => screen.getByText(name).closest('tr')!

afterEach(cleanup)

describe('People screen, undoing an invitation', () => {
  it('offers Move and Remove only to somebody with no records', () => {
    renderPeople(<PeoplePage />)
    const fresh = within(rowFor('Fresh Invitation'))
    expect(fresh.getByRole('button', { name: 'Move…' })).toBeTruthy()
    expect(fresh.getByRole('button', { name: 'Remove' })).toBeTruthy()
    expect(fresh.getByRole('button', { name: 'Deactivate' })).toBeTruthy()
  })

  it('offers neither to somebody who has already done work', () => {
    renderPeople(<PeoplePage />)
    const busy = within(rowFor('Busy Engineer'))
    expect(busy.queryByRole('button', { name: 'Move…' })).toBeNull()
    expect(busy.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(busy.getByText(/has records/)).toBeTruthy()
    expect(busy.getByRole('button', { name: 'Deactivate' })).toBeTruthy()
  })

  it('never offers to remove the master administrator', () => {
    renderPeople(<PeoplePage />)
    const owner = within(rowFor('The Owner'))
    expect(owner.queryByRole('button', { name: 'Remove' })).toBeNull()
    expect(owner.queryByRole('button', { name: 'Move…' })).toBeNull()
  })
})
