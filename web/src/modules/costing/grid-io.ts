import type { GridModel } from './grid'
import { gridCells, gridFileName, panelCells } from './grid-export'

/** Writing the grid out. exceljs loads on demand, as the BOM exports do. */
export async function downloadGridXlsx(
  model: GridModel,
  costingNo: string,
  revisionNo: number,
  currencyLabel: string,
): Promise<void> {
  const mod = await import('exceljs')
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod
  const wb = new ExcelJS.Workbook()

  const grid = wb.addWorksheet('Panels at a glance')
  const cells = gridCells(model)
  const totalsFrom = cells.length - model.totals.length
  cells.forEach((row, i) => {
    const r = grid.addRow(row)
    if (i === 0 || i >= totalsFrom) r.font = { bold: true }
    // A section heading is one cell on its own row.
    if (row.length === 1) r.font = { bold: true }
  })
  grid.columns.forEach((col, i) => { col.width = i === 0 ? 52 : i === 1 ? 18 : 14 })
  grid.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }]
  for (let c = 3; c <= model.columns.length + 3; c += 1) grid.getColumn(c).numFmt = '#,##0.###'
  grid.addRow([])
  grid.addRow([`Quantities per panel. The all-panels column multiplies each panel's quantity through; money in ${currencyLabel}.`])

  const panels = wb.addWorksheet('Per panel')
  panelCells(model).forEach((row, i) => {
    const r = panels.addRow(row)
    if (i === 0) r.font = { bold: true }
  })
  panels.columns.forEach((col, i) => { col.width = i === 0 ? 28 : i === 1 ? 34 : 16 })
  for (let c = 5; c <= 10; c += 1) panels.getColumn(c).numFmt = '#,##0.00'
  panels.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = gridFileName(costingNo, revisionNo)
  a.click()
  URL.revokeObjectURL(url)
}
