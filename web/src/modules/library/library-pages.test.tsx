// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ErrorBoundary } from '../../app/ErrorBoundary'
import { seedFixtures } from './seed-fixtures'
import { ComponentsPage } from './ComponentsPage'
import { AssembliesPage } from './AssembliesPage'
import { AssemblyEditor } from './AssemblyEditor'

// The screens never reach the network here: the query cache is filled with the
// seed as the database would return it, and the session is a master admin.
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../auth/session', () => ({
  useSession: () => ({
    session: null,
    profile: { id: 'u1', company_id: 'co1', full_name: 'Owner', email: null, is_master_admin: true, is_active: true, created_at: '' },
    company: {
      id: 'co1', name: 'N-Power', kind: 'in_house', currency_code: 'KES', currency_label: 'KES', exchange_rate: 1,
      discount_pct: 0, material_margin_pct: 0, labour_margin_pct: 0, tax_pct: 16, price_rounding_step: 100,
      enclosure_uplift_pct: 0, quotation_prefix: 'NPP', quotation_no_includes_year: false, address: null,
      tax_pin: null, logo_path: null, is_active: true, created_at: '', updated_at: '',
    },
    roles: ['company_admin'],
    loading: false,
    isMasterAdmin: true,
    hasRole: (role: string) => role === 'company_admin',
    refresh: async () => {},
    signOut: async () => {},
  }),
}))

const seed = seedFixtures()

function renderWithSeed(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(['components'], seed.components)
  client.setQueryData(['categories'], seed.categories)
  client.setQueryData(['material-rates-effective'], [])
  client.setQueryData(['currency-factors-effective'], [])
  client.setQueryData(['assemblies'], seed.assemblies)
  client.setQueryData(['kit-groups'], seed.groups)
  client.setQueryData(['labour-rates'], [])
  for (const a of seed.assemblies) {
    client.setQueryData(['assembly-components', a.id], seed.linesFor(a.id))
    client.setQueryData(['assembly-hours', a.id], [])
  }
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(cleanup)

describe('the seed as the screens see it', () => {
  it('is the owner\'s counts', () => {
    expect(seed.components).toHaveLength(735)
    expect(seed.components.filter((c) => c.unit_price == null)).toHaveLength(8)
    expect(seed.components.filter((c) => c.pricing_mode === 'weight_rate')).toHaveLength(10)
    expect(seed.assemblies).toHaveLength(296)
    expect(seed.groups).toHaveLength(17)
  })
})

describe('Components page with the imported seed', () => {
  it('renders every part, marking the eight without a price', () => {
    renderWithSeed(<ComponentsPage />)
    expect(screen.getAllByRole('row')).toHaveLength(735 + 1)
    expect(screen.getAllByText('no price')).toHaveLength(8)
    expect(screen.getAllByText('by weight')).toHaveLength(10)
    // 30 x 10 mm busbar: 42 EUR ÷ 15 = 2.8 kg/m × 3,000 KES/kg.
    const busbarRow = screen.getAllByText('30X10MM')[0]!.closest('tr')!
    expect(within(busbarRow).getByText('KES 8,400.00')).toBeTruthy()
    expect(within(busbarRow).getByText('2.8 kg per m')).toBeTruthy()
  })
})

describe('Kits page with the imported seed', () => {
  it('renders every kit with its group and rating', () => {
    renderWithSeed(<AssembliesPage />)
    expect(screen.getAllByRole('row')).toHaveLength(296 + 1)
    expect(screen.getAllByText('ACB frame 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('250 A, 3P').length).toBeGreaterThan(0)
  })

  it('opens a kit built on an unpriced part without crashing', () => {
    renderWithSeed(<AssemblyEditor assembly={seed.placeholderKit} onBack={() => {}} />)
    expect(screen.getAllByText('no price').length).toBeGreaterThan(0)
  })
})

describe('ErrorBoundary', () => {
  it('shows the error instead of a blank page', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Broken(): ReactNode {
      throw new Error('kaboom')
    }
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/kaboom/)).toBeTruthy()
    quiet.mockRestore()
  })
})
