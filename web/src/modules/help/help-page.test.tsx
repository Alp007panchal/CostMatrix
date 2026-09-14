// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { UserRole } from '../../lib/database.types'

let currentRoles: UserRole[] = []
let master = false
vi.mock('../auth/session', () => ({
  useSession: () => ({ roles: currentRoles, isMasterAdmin: master }),
}))

import { HelpPage } from './HelpPage'
import { GUIDES } from './guides'

afterEach(cleanup)

function show(roles: UserRole[], isMaster = false) {
  currentRoles = roles
  master = isMaster
  render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  )
}

function headings(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '')
}

describe('the help screen', () => {
  it('puts your own guide first and marks it', () => {
    show(['approver'])
    expect(headings()[0]).toContain('Approving and quoting')
    expect(headings()[0]).toContain('yours')
  })

  it('still shows the others, because people do a bit of everything', () => {
    show(['approver'])
    expect(headings()).toHaveLength(GUIDES.length)
  })

  it('shows an administrator their own guide, master or not', () => {
    show([], true)
    expect(headings()[0]).toContain('Running the company')
  })

  it('does not leave somebody with no roles on an empty page', () => {
    // An invited person before anybody has given them a role.
    show([])
    expect(headings()).toHaveLength(GUIDES.length)
    expect(screen.getByText(/Nobody has given you a role yet/)).toBeTruthy()
    expect(headings().join(' ')).not.toContain('yours')
  })

  it('links each step to the screen it names', () => {
    show(['costing_engineer'])
    const first = screen.getAllByRole('heading', { level: 2 })[0]?.parentElement
    expect(first).toBeTruthy()
    const links = within(first as HTMLElement).getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(3)
    for (const link of links) expect(link.getAttribute('href')).toMatch(/^\//)
  })

  it('points at the terms page, which answers what it does not', () => {
    show(['costing_engineer'])
    expect(screen.getByRole('link', { name: /terms page/i }).getAttribute('href')).toBe('/terms')
  })
})
