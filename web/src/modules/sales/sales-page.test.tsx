// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type {
  MarginAchieved, SalesGroupOutcome, SalesOutcome, SalesPipelineRow,
} from '../../lib/database.types'
import { SalesPage } from './SalesPage'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../auth/session', () => ({
  useSession: () => ({ company: { currency_label: 'KSH' }, hasRole: () => true, isMasterAdmin: false }),
}))
const listSalesOutcomes = vi.fn()
const listGroupOutcomes = vi.fn()
const listMarginAchieved = vi.fn()
const listPipeline = vi.fn()
vi.mock('./api', () => ({
  listSalesOutcomes: () => listSalesOutcomes(),
  listGroupOutcomes: () => listGroupOutcomes(),
  listMarginAchieved: () => listMarginAchieved(),
  listPipeline: () => listPipeline(),
}))

const out = (over: Partial<SalesOutcome>): SalesOutcome => ({
  company_id: 'co', enquiry_id: 'e1', enquiry_no: 'ENQ-1', title: 'A board', customer_id: 'c1',
  customer_name: 'Triclover', received_on: '2026-09-01', status: 'won',
  decided_at: '2026-09-08T00:00:00Z', lost_reason: null, won_quotation_id: 'q1', days_to_decide: 7,
  quotations_released: 1, costing_id: 'k1', costing_no: 'NPP-1', value_ex_vat: 1000000,
  value_band: '500 K to 2 M', ...over,
})

const OUTCOMES = [
  out({ enquiry_id: 'w', status: 'won', value_ex_vat: 3000000 }),
  out({ enquiry_id: 'l', status: 'lost', value_ex_vat: 1000000, lost_reason: 'price, 12 % above the Chinese offer', customer_name: 'Bidco', days_to_decide: 21 }),
  out({ enquiry_id: 'o', status: 'open', value_ex_vat: 500000, decided_at: null, days_to_decide: null, customer_name: 'Kenafric' }),
]

const GROUPS: SalesGroupOutcome[] = [
  { enquiry_id: 'w', status: 'won', value_ex_vat: 3000000, kit_group_name: 'ACB frame 1', lines: 2, material: 900000, labour: 40000, hours: 30 },
  { enquiry_id: 'l', status: 'lost', value_ex_vat: 1000000, kit_group_name: 'ACB frame 1', lines: 1, material: 300000, labour: 20000, hours: 10 },
]

const MARGINS: MarginAchieved[] = [
  { costing_id: 'k1', costing_no: 'NPP-1', revision_no: 0, price_ex_vat: 3000000, material_cost: 2000000,
    labour_quoted: 300000, labour_achieved: 450000, hours_quoted: 100, hours_achieved: 150,
    margin_quoted_pct: 23.3, margin_achieved_pct: 18.3, labour_measured_pct: 100 },
  { costing_id: 'k2', costing_no: 'NPP-2', revision_no: 1, price_ex_vat: 900000, material_cost: 500000,
    labour_quoted: 100000, labour_achieved: 100000, hours_quoted: 40, hours_achieved: 40,
    margin_quoted_pct: 33.3, margin_achieved_pct: 33.3, labour_measured_pct: 0 },
]

const PIPELINE: SalesPipelineRow[] = [
  { enquiry_id: 'o', enquiry_no: 'ENQ-9', title: 'Open job', customer_name: 'Kenafric', status: 'quoted',
    received_on: '2026-08-01', age_days: 42, value_ex_vat: 500000, value_band: 'under 500 K',
    quotations_released: 1, latest_quotation: 'NPP-9', quotation_status: 'sent',
    sent_at: '2026-08-10T00:00:00Z', days_left: -3, has_run_out: true },
]

function show() {
  listSalesOutcomes.mockResolvedValue(OUTCOMES)
  listGroupOutcomes.mockResolvedValue(GROUPS)
  listMarginAchieved.mockResolvedValue(MARGINS)
  listPipeline.mockResolvedValue(PIPELINE)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><SalesPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('the sales screen', () => {
  it('leads with the hit rate and what it rests on', async () => {
    show()
    // The figure repeats in the breakdowns; the hero is the first of them.
    await waitFor(() => expect(screen.getAllByText('50 %').length).toBeGreaterThan(0))
    expect(screen.getAllByText('1 of 2 decided').length).toBeGreaterThan(0)
  })

  it('shows won and lost value, the share by value and the average days', async () => {
    show()
    await waitFor(() => expect(screen.getAllByText('KSH 3,000,000.00').length).toBeGreaterThan(0))
    expect(screen.getAllByText('KSH 1,000,000.00').length).toBeGreaterThan(0)
    expect(screen.getByText('75 %')).toBeTruthy()   // 3 M won of 4 M decided
    expect(screen.getByText('14')).toBeTruthy()      // (7 + 21) / 2 days
    expect(screen.getByText('Share by value')).toBeTruthy()
  })

  it('lists what is still out there, and marks an offer that has run out', async () => {
    show()
    await waitFor(() => expect(screen.getByText('ENQ-9')).toBeTruthy())
    expect(screen.getByText('42 d')).toBeTruthy()
    expect(screen.getByText('ran out')).toBeTruthy()
  })

  it('breaks the hit rate down by customer, by value, by month and by product group', async () => {
    show()
    await waitFor(() => expect(screen.getByText('By customer')).toBeTruthy())
    expect(screen.getByText('By value')).toBeTruthy()
    expect(screen.getByText('By month')).toBeTruthy()
    expect(screen.getByText('By product group')).toBeTruthy()
    expect(screen.getAllByText('ACB frame 1').length).toBeGreaterThan(0)
  })

  it('names why jobs were lost, in the words they were heard in', async () => {
    show()
    await waitFor(() => expect(screen.getByText('price, 12 % above the Chinese offer')).toBeTruthy())
  })

  it('shows the margin achieved only where hours have been recorded, with how much is measured', async () => {
    show()
    await waitFor(() => expect(screen.getByText('Margin quoted, margin achieved')).toBeTruthy())
    const row = screen.getByText('NPP-1').closest('tr')!
    expect(within(row).getByText('23.3 %')).toBeTruthy()
    expect(within(row).getByText('18.3 %')).toBeTruthy()
    expect(within(row).getByText('100 %')).toBeTruthy()
    // NPP-2 has no recorded hours, so it is not offered as an achieved figure at all.
    expect(screen.queryByText('NPP-2')).toBeNull()
  })
})
