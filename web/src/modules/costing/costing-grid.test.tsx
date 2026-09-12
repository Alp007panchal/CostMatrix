// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type {
  ComponentPrice, Costing, CostingAssembly, CostingItem, CostingPanel, CostingTotals, Kit, PanelFit,
  PanelPrice,
} from '../../lib/database.types'
import { CostingGrid, type GridHandlers } from './CostingGrid'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const downloadGridXlsx = vi.fn()
vi.mock('./grid-io', () => ({ downloadGridXlsx: (...a: unknown[]) => downloadGridXlsx(...a) }))

const COSTING = {
  id: 'c', company_id: 'co', enquiry_id: null, costing_no: 'NPP-201', revision_no: 0, family_id: 'f',
  previous_revision_id: null, is_current: true, title: 'Factory', notes: null, status: 'draft',
  currency_code: 'KES', currency_label: 'KSH', exchange_rate: 1, discount_pct: 0,
  material_margin_pct: 10, labour_margin_pct: 20, negotiation_margin_pct: 0,
  price_rounding_step: 100, tax_pct: 16, enclosure_uplift_pct: 0, chosen_option_label: null,
  submitted_at: null, approved_at: null, returned_at: null, return_comment: null,
  created_at: '', updated_at: '',
} satisfies Costing

const panel = (id: string, name: string, over: Partial<CostingPanel> = {}): CostingPanel => ({
  id, costing_id: 'c', company_id: 'co', name, tag: null, option_label: null, uom: 'PC',
  quantity: 1, is_option: false, technical_description: null, enclosure_dimensions: null,
  sort_order: 0, ...over,
})
const PANELS = [panel('p1', 'MDB'), panel('p2', 'DB-1')]

const ASSEMBLIES = [
  { id: 'a1', costing_id: 'c', panel_id: 'p1', kind: 'kit', section: 'Incomer', source_assembly_id: 'src-acb',
    code: 'ACB-1600', name: '1600A ACB KIT', quantity: 1, sort_order: 0 },
  { id: 'a2', costing_id: 'c', panel_id: 'p1', kind: 'kit', section: 'Outgoers', source_assembly_id: 'src-mccb',
    code: 'MCCB-250', name: '250A MCCB KIT', quantity: 3, sort_order: 1 },
  { id: 'a3', costing_id: 'c', panel_id: 'p2', kind: 'kit', section: 'Outgoers', source_assembly_id: 'src-mccb',
    code: 'MCCB-250', name: '250A MCCB KIT', quantity: 4, sort_order: 0 },
] as unknown as CostingAssembly[]

const ITEMS: CostingItem[] = []

const price = (panel_id: string): PanelPrice => ({
  panel_id, material_cost: 1000, labour_cost: 100, hours: 2, material_sell: 1100, labour_sell: 110,
  unit_price: 1300, line_total: 1300, is_option: false, in_chosen_offer: true, counts_in_total: true,
})
const TOTALS: CostingTotals = {
  costing_id: 'c', material_cost: 2000, labour_cost: 200, hours: 4, subtotal: 2600, tax: 416,
  grand_total: 3016, optional_subtotal: 0, optional_tax: 0, optional_total: 0,
  chosen_option_label: null, option_count: 0,
}
const KITS = [
  { code: 'ACB-1600', group_name: 'ACB frame 1', rating: 1600, has_unpriced_part: false, is_active: true },
  { code: 'MCCB-250', group_name: 'MCCB', rating: 250, has_unpriced_part: true, is_active: true },
] as unknown as Kit[]

const handlers = (): GridHandlers => ({
  onAddKit: vi.fn().mockResolvedValue(undefined),
  onAddComponent: vi.fn().mockResolvedValue(undefined),
  onKitQuantity: vi.fn(),
  onItemQuantity: vi.fn(),
  onRemoveKit: vi.fn(),
  onRemoveItem: vi.fn(),
  onAddPanel: vi.fn(),
  onCopyPanel: vi.fn(),
})

function show(over: { editable?: boolean; fits?: Record<string, PanelFit | undefined> } = {}) {
  const h = handlers()
  render(
    <CostingGrid
      costing={COSTING}
      panels={PANELS}
      assemblies={ASSEMBLIES}
      items={ITEMS}
      panelPrices={[price('p1'), price('p2')]}
      totals={TOTALS}
      kits={KITS}
      components={[] as ComponentPrice[]}
      categoryNames={{}}
      fits={over.fits ?? {}}
      editable={over.editable ?? true}
      handlers={h}
    />,
  )
  return h
}

/** The cell for one row and one column, by the row's visible name. */
function cellsOf(rowName: string): HTMLElement[] {
  const row = screen.getByText(rowName).closest('tr')!
  return within(row).getAllByRole('cell')
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('the costing grid', () => {
  it('shows a column per panel and a row per kit, with the roll-up', () => {
    show()
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent?.slice(0, 4)))
      .toEqual(['Kit ', 'Grou', 'MDBq', 'DB-1', 'All '])
    expect(screen.getByText('Incomer')).toBeTruthy()
    const mccb = cellsOf('250A MCCB KIT')
    // kit / group / MDB / DB-1 / all panels
    expect(mccb).toHaveLength(5)
    expect(mccb[4]?.textContent).toBe('7')
  })

  it('changes the quantity of the line that is there', async () => {
    const h = show()
    const input = within(cellsOf('250A MCCB KIT')[2]!).getByRole('textbox')
    fireEvent.change(input, { target: { value: '6' } })
    fireEvent.blur(input)
    await waitFor(() => expect(h.onKitQuantity).toHaveBeenCalledWith('a2', 6))
  })

  it('adds the kit to a panel that did not have it', async () => {
    const h = show()
    const input = within(cellsOf('1600A ACB KIT')[3]!).getByRole('textbox')
    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.blur(input)
    await waitFor(() => expect(h.onAddKit).toHaveBeenCalledWith('p2', 'src-acb', 2))
  })

  it('removes the line when the cell is cleared', async () => {
    const h = show()
    const input = within(cellsOf('250A MCCB KIT')[2]!).getByRole('textbox')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    await waitFor(() => expect(h.onRemoveKit).toHaveBeenCalledWith('a2'))
  })

  it('is read-only on a costing that is not an open draft', () => {
    const h = show({ editable: false })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText('Add panel')).toBeNull()
    expect(cellsOf('250A MCCB KIT')[2]?.textContent).toBe('3')
    expect(h.onKitQuantity).not.toHaveBeenCalled()
  })

  it('marks the rows that differ when two columns are compared', () => {
    show()
    fireEvent.change(screen.getByLabelText('Compare this panel'), { target: { value: 'p1' } })
    fireEvent.change(screen.getByLabelText('Compare with this panel'), { target: { value: 'p2' } })
    expect(screen.getByText(/2 rows differ/)).toBeTruthy()
    expect(screen.getByText('250A MCCB KIT').closest('tr')?.className).toBe('row-differs')
  })

  it('says which row has a part the library no longer prices', () => {
    show()
    const row = screen.getByText('250A MCCB KIT').closest('tr')!
    expect(within(row).getByText('unpriced part')).toBeTruthy()
  })

  it('warns on the column when the space check says the panel is tight', () => {
    show({
      fits: {
        p1: { verdict: 'tight', used_pct: 92, safety_factor: 1.3, kits_measured: 3, kits_unmeasured: 0,
              unmeasured: [], cubicles: [], kit_area_mm2: 1, required_area_mm2: 1, usable_area_mm2: 1 },
      },
    })
    expect(screen.getByText('space 92 % · check')).toBeTruthy()
  })

  it('copies a panel and adds one through the same functions as the editor', () => {
    const h = show()
    fireEvent.change(screen.getByLabelText('Copy a panel'), { target: { value: 'p1' } })
    expect(h.onCopyPanel).toHaveBeenCalledWith('p1')
    fireEvent.click(screen.getByText('Add panel'))
    expect(h.onAddPanel).toHaveBeenCalled()
  })

  it('exports what is on screen to Excel', () => {
    show()
    fireEvent.click(screen.getByText('Excel'))
    expect(downloadGridXlsx).toHaveBeenCalledWith(expect.anything(), 'NPP-201', 0, 'KSH')
  })

  it('opens a kit row to show the lines inside it, without leaving the grid', () => {
    show()
    fireEvent.click(screen.getByText('250A MCCB KIT'))
    expect(screen.getByText('This kit has no lines on this costing.')).toBeTruthy()
  })
})
