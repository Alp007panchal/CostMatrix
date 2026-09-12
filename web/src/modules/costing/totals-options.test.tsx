// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Costing, CostingTotals, OptionTotals } from '../../lib/database.types'
import { TotalsPanel } from './TotalsPanel'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))

const COSTING = {
  id: 'c', company_id: 'co', enquiry_id: null, costing_no: 'CM-2026-0001', revision_no: 0, family_id: 'f',
  previous_revision_id: null, is_current: true, title: 'MCC', notes: null, status: 'draft',
  currency_code: 'KES', currency_label: 'KSH', exchange_rate: 1, discount_pct: 0,
  material_margin_pct: 10, labour_margin_pct: 20, negotiation_margin_pct: 0,
  price_rounding_step: 100, tax_pct: 16, enclosure_uplift_pct: 0, chosen_option_label: null,
  submitted_at: null, approved_at: null, returned_at: null, return_comment: null,
  created_at: '', updated_at: '',
} satisfies Costing

const totals = (over: Partial<CostingTotals> = {}): CostingTotals => ({
  costing_id: 'c', material_cost: 100, labour_cost: 10, hours: 2,
  subtotal: 1000, tax: 160, grand_total: 1160,
  optional_subtotal: 0, optional_tax: 0, optional_total: 0,
  chosen_option_label: null, option_count: 0, ...over,
})

const option = (option_label: string, grand_total: number, over: Partial<OptionTotals> = {}): OptionTotals => ({
  option_label, subtotal: grand_total, tax: 0, grand_total,
  optional_subtotal: 0, optional_tax: 0, optional_total: 0, is_chosen: false, ...over,
})

function show(props: {
  totals: CostingTotals
  optionTotals: OptionTotals[]
  costing?: Costing
  editable?: boolean
  onChooseOption?: (label: string | null) => void
}) {
  render(
    <TotalsPanel
      costing={props.costing ?? COSTING}
      totals={props.totals}
      optionTotals={props.optionTotals}
      bom={[]}
      categoryNames={{}}
      editable={props.editable ?? true}
      onChooseOption={props.onChooseOption ?? (() => {})}
    />,
  )
}

afterEach(cleanup)

describe('the totals panel and a job offered more than one way', () => {
  it('says nothing about options on an ordinary job', () => {
    show({ totals: totals(), optionTotals: [option('', 1160)] })
    expect(screen.queryByText('Per option')).toBeNull()
    expect(screen.queryByLabelText(/Offered as/)).toBeNull()
  })

  it('warns that the grand total adds both offers together until one is chosen', () => {
    show({
      totals: totals({ option_count: 2 }),
      optionTotals: [option('Option 1', 600), option('Option 2', 900)],
    })
    expect(screen.getByText(/sum of 2 offers rather than the price of the job/)).toBeTruthy()
  })

  it('marks the chosen option and drops the warning', () => {
    show({
      totals: totals({ option_count: 2, chosen_option_label: 'Option 2' }),
      optionTotals: [option('Option 1', 600), option('Option 2', 900, { is_chosen: true })],
    })
    expect(screen.getByText('Option 2 — the offer')).toBeTruthy()
    expect(screen.queryByText(/sum of 2 offers/)).toBeNull()
  })

  it('sends the choice on, and null for "no choice yet"', () => {
    const chose = vi.fn()
    show({
      totals: totals({ option_count: 2 }),
      optionTotals: [option('Option 1', 600), option('Option 2', 900)],
      onChooseOption: chose,
    })
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'Option 1' } })
    expect(chose).toHaveBeenLastCalledWith('Option 1')
    fireEvent.change(select, { target: { value: '' } })
    expect(chose).toHaveBeenLastCalledWith(null)
  })

  it('cannot be changed on a costing that is no longer a draft', () => {
    show({
      totals: totals({ option_count: 2 }),
      optionTotals: [option('Option 1', 600)],
      editable: false,
    })
    expect(screen.getByRole('combobox')).toHaveProperty('disabled', true)
  })

  it('reports the optional extras beside the total, not inside it', () => {
    show({
      totals: totals({ optional_subtotal: 100, optional_tax: 16, optional_total: 116 }),
      optionTotals: [option('', 1160)],
    })
    expect(screen.getByText('Optional extras, if the customer takes them')).toBeTruthy()
    expect(screen.getByText(/not in the total above/)).toBeTruthy()
  })
})
