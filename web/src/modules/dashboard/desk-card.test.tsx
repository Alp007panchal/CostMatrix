// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CompanyFeature, DeskItem } from '../../lib/database.types'
import { DeskCard } from './DeskCard'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('./desk-api', () => ({ listMyDesk: vi.fn() }))
vi.mock('../admin/api', () => ({ listFeatures: vi.fn() }))

const feature = (is_on: boolean): CompanyFeature => ({
  code: 'my_desk', name: 'What is on your desk', blurb: '', changes_costings: false,
  option_key: 'feature.my_desk', sort_order: 210, is_on,
} as CompanyFeature)

const item = (over: Partial<DeskItem> = {}): DeskItem => ({
  kind: 'returned_to_you', sort_order: 10, entity: 'costing', entity_id: 'c1',
  reference: 'CM-2026-0001', title: 'MCC for Triclover', since: '2026-09-04T09:00:00Z',
  days: 9, detail: 'The 400 A feeder is priced twice',
  ...over,
})

function renderCard(items: DeskItem[], on = true) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  client.setQueryData(['features'], [feature(on)])
  client.setQueryData(['my-desk'], items)
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DeskCard />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('the card on the home page', () => {
  it('lists what is waiting, with the comment it came back with', () => {
    renderCard([item()])
    expect(screen.getByText('On your desk')).toBeTruthy()
    expect(screen.getByText('CM-2026-0001')).toBeTruthy()
    // Read off the line itself: the age also appears in the sentence above it.
    const line = screen.getByRole('listitem').textContent ?? ''
    expect(line).toContain('The 400 A feeder is priced twice')
    expect(line).toContain('9 days ago')
  })

  it('links each line to the thing itself, because that is how it is cleared', () => {
    renderCard([item()])
    expect(screen.getByRole('link', { name: 'CM-2026-0001' }).getAttribute('href'))
      .toBe('/costings/c1')
  })

  it('groups the kinds, each under what it is', () => {
    renderCard([
      item(),
      item({ kind: 'released_not_sent', entity: 'quotation', entity_id: 'q1', reference: 'NPP-193', title: 'TRICLOVER LIMITED', days: 2 }),
    ])
    expect(screen.getByText('Sent back to you')).toBeTruthy()
    expect(screen.getByText('Released, never sent')).toBeTruthy()
  })

  it('names the oldest thing at the top, so you know which to open', () => {
    renderCard([item({ days: 1 }), item({ entity_id: 'c2', reference: 'CM-2', days: 30 })])
    expect(screen.getByText(/the oldest since 4 weeks ago/)).toBeTruthy()
  })

  it('shows nothing at all when the desk is clear, rather than an empty card', () => {
    const { container } = renderCard([])
    expect(container.textContent).toBe('')
  })

  it('shows nothing when the feature is switched off, even with work waiting', () => {
    const { container } = renderCard([item()], false)
    expect(container.textContent).toBe('')
  })
})
