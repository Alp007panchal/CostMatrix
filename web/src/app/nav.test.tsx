// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CompanyFeature, UserRole } from '../lib/database.types'
import { LIBRARY_SETUP_TABS, NAV_GROUPS, SETTINGS_TABS, allNavRoutes } from './nav'

/**
 * The one thing the old top bar could not tell you: whether every screen is
 * reachable (house style §6).
 *
 * There were twenty-five links in one bar, and two of them went nowhere. So the
 * navigation is data now, and this walks it against the routes in `App.tsx` —
 * both ways, so a screen added without a link fails as loudly as a link added
 * without a screen.
 */

const roles = vi.hoisted(() => ({ current: [] as UserRole[], master: false }))

vi.mock('../modules/auth/session', () => ({
  useSession: () => ({
    profile: { full_name: 'Alpesh Panchal' },
    company: { id: 'c1', name: 'Nationwide Electrical Industries' },
    roles: roles.current,
    isMasterAdmin: roles.master,
    hasRole: (r: UserRole) => roles.current.includes(r),
    signOut: () => Promise.resolve(),
  }),
}))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../modules/admin/api', () => ({ listFeatures: vi.fn() }))
vi.mock('../modules/dashboard/desk-api', () => ({ listMyDesk: vi.fn() }))
vi.mock('../modules/crm/api', () => ({ listFollowups: vi.fn() }))
vi.mock('../modules/library/library-health-api', () => ({ listLibraryHealth: vi.fn() }))

const { Layout } = await import('./Layout')

/** Every feature switched on, so a hidden item is a role decision and nothing else. */
function everyFeature(): CompanyFeature[] {
  const codes = new Set<string>()
  for (const group of NAV_GROUPS) for (const item of group.items) if (item.feature !== undefined) codes.add(item.feature)
  for (const tab of [...SETTINGS_TABS, ...LIBRARY_SETUP_TABS]) if (tab.feature !== undefined) codes.add(tab.feature)
  return [...codes].map((code) => ({ code, name: code, is_on: true } as CompanyFeature))
}

function renderShell(as: { roles: UserRole[]; master?: boolean }) {
  roles.current = as.roles
  roles.master = as.master ?? false
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(['features'], everyFeature())
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Layout />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const hrefs = (): string[] =>
  screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '')

afterEach(cleanup)

/** The `path="…"` of every route in App.tsx, as the router sees it. */
function appRoutes(): string[] {
  // Read as a file rather than imported: the routes are JSX, and the point is
  // to check the addresses themselves, not whatever the router makes of them.
  const source = readFileSync('src/app/App.tsx', 'utf8')
  const paths = [...source.matchAll(/path="([^"]+)"/g)].map((m) => `/${m[1]}`.replace('//', '/'))
  // The home page is the index route and carries no path of its own.
  return source.includes('<Route index') ? ['/', ...paths] : paths
}

/** Addresses nothing links to on purpose, each for a reason. */
const UNLINKED: Record<string, string> = {
  '/reset-password': 'followed from an email, outside the signed-in app',
  '/terms': 'read before you have an account, so it is linked from Help and the invitation',
  '/*': 'the not-found route',
}

describe('every screen is reachable', () => {
  it('has a way in for every route in App.tsx', () => {
    const reachable = new Set(allNavRoutes())
    const orphans = appRoutes().filter(
      (path) =>
        !reachable.has(path) &&
        !path.includes(':') && // a detail page, opened from its list
        UNLINKED[path] === undefined,
    )
    expect(orphans).toEqual([])
  })

  it('has a route in App.tsx for every way in', () => {
    const routes = new Set(appRoutes())
    expect(allNavRoutes().filter((to) => !routes.has(to))).toEqual([])
  })

  it('lists no destination twice, in the sidebar or across the two tab pages', () => {
    const all = allNavRoutes()
    expect(all.length).toBe(new Set(all).size)
  })
})

describe('what each role is offered', () => {
  it('gives the master administrator everything, Companies included', () => {
    renderShell({ roles: [], master: true })
    for (const group of NAV_GROUPS) {
      for (const item of group.items) expect(hrefs()).toContain(item.to)
    }
  })

  it('gives a company administrator everything but nothing master-only', () => {
    renderShell({ roles: ['company_admin'] })
    expect(hrefs()).toContain('/settings')
    expect(hrefs()).toContain('/library/setup')
    expect(hrefs()).toContain('/admin/people')
    // Companies is a tab, not a sidebar item, and it is the master admin's alone.
    expect(SETTINGS_TABS.find((t) => t.to === '/admin/companies')?.master).toBe(true)
  })

  it('offers a costing engineer the work and none of the administration', () => {
    renderShell({ roles: ['costing_engineer'] })
    const links = hrefs()
    expect(links).toContain('/costings')
    expect(links).toContain('/library/components')
    expect(links).toContain('/help')
    for (const admin of ['/settings', '/admin/people', '/library/setup', '/library/health']) {
      expect(links).not.toContain(admin)
    }
  })

  it('still gives somebody with no roles at all a home, and a way to ask', () => {
    renderShell({ roles: [] })
    expect(hrefs()).toContain('/')
    expect(hrefs()).toContain('/help')
    expect(screen.getByText('No roles yet')).toBeTruthy()
  })
})
