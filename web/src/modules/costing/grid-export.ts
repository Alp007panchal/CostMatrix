import type { GridModel } from './grid'

/**
 * The grid as spreadsheet cells — the same sections, columns and totals that are
 * on screen, plus a second sheet of what each panel costs (spec §3, Excel). Pure,
 * so the shape is unit-tested; writing the file is grid-io.ts.
 */

export function gridCells(model: GridModel): (string | number)[][] {
  const header: (string | number)[] = [
    'Kit / component', 'Group',
    ...model.columns.map((c) => columnTitle(c)),
    'All panels',
  ]
  const rows: (string | number)[][] = [header]

  for (const section of model.sections) {
    rows.push([section.heading.toUpperCase()])
    for (const row of section.rows) {
      rows.push([
        row.kind === 'kit' ? row.name : `${row.name} (${row.kind})`,
        row.group,
        // A blank cell means the panel does not use it — blank, not a zero, so a
        // reader of the spreadsheet sees what they see on screen.
        ...model.columns.map((c) => {
          const quantity = row.cells[c.panel.id]?.quantity ?? 0
          return quantity === 0 ? '' : quantity
        }),
        row.total,
      ])
    }
  }

  for (const total of model.totals) {
    rows.push([
      total.note ? `${total.label} (${total.note})` : total.label,
      '',
      ...total.values.map((v) => (v === null ? '' : round2(v))),
      total.total === null ? '' : round2(total.total),
    ])
  }
  return rows
}

/** Sheet two: one row per panel, what it costs and what it sells for. */
export function panelCells(model: GridModel): (string | number)[][] {
  const header = [
    'Panel', 'Description', 'Quantity', 'Optional extra',
    'Material, each', 'Labour, each', 'Hours, each', 'Selling ex-VAT, each', 'Price each, rounded', 'Line total',
  ]
  const body = model.columns.map((c) => [
    c.panel.name,
    c.panel.tag ?? '',
    Number(c.panel.quantity),
    c.isOption ? 'yes' : '',
    c.price ? round2(Number(c.price.material_cost)) : '',
    c.price ? round2(Number(c.price.labour_cost)) : '',
    c.price ? Number(c.price.hours) : '',
    c.price ? round2(Number(c.price.material_sell) + Number(c.price.labour_sell)) : '',
    c.price ? round2(Number(c.price.unit_price)) : '',
    c.price ? round2(Number(c.price.line_total)) : '',
  ])
  return [header, ...body]
}

export function gridFileName(costingNo: string, revisionNo: number): string {
  const rev = revisionNo > 0 ? `-rev${revisionNo}` : ''
  return `${costingNo}${rev}-panels-at-a-glance.xlsx`.replace(/[^A-Za-z0-9._-]/g, '_')
}

function columnTitle(column: GridModel['columns'][number]): string {
  const parts = [column.panel.name]
  if (Number(column.panel.quantity) !== 1) parts.push(`qty ${Number(column.panel.quantity)}`)
  if (column.isOption) parts.push('option')
  return parts.join(' · ')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
