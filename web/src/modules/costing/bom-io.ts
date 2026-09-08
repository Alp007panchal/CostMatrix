import type { BomGroup } from './bom'
import { bomCells, bomFileName, bomToCsv } from './bom'

/** Writing the exports. exceljs loads on demand, as it does for the library. */

function save(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadBomCsv(group: BomGroup, costingNo: string, revisionNo: number): void {
  save(new Blob([bomToCsv(group)], { type: 'text/csv;charset=utf-8' }),
       bomFileName(costingNo, revisionNo, group.category_code, 'csv'))
}

/** One category as its own workbook, or all four as one workbook with a sheet each. */
export async function downloadBomXlsx(
  groups: BomGroup[],
  costingNo: string,
  revisionNo: number,
  currencyLabel: string,
): Promise<void> {
  const mod = await import('exceljs')
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod
  const wb = new ExcelJS.Workbook()

  for (const g of groups) {
    const ws = wb.addWorksheet(g.category_name.slice(0, 31))
    const cells = bomCells(g)
    cells.forEach((row, i) => {
      const r = ws.addRow(row)
      if (i === 0 || i === cells.length - 1) r.font = { bold: true }
    })
    const priceCols = g.hasOptions ? [8, 9] : [7, 8]
    priceCols.forEach((c) => { ws.getColumn(c).numFmt = '#,##0.00' })
    ws.getColumn(g.hasOptions ? 7 : 6).numFmt = '0.###'
    ws.columns.forEach((col, i) => { col.width = i === 1 ? 44 : 16 })
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.addRow([])
    ws.addRow([`Prices in ${currencyLabel}. Quantities are multiplied through assembly and panel quantities.`])
  }

  const buffer = await wb.xlsx.writeBuffer()
  const category = groups.length === 1 ? (groups[0]?.category_code ?? 'bom') : 'all'
  save(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
       bomFileName(costingNo, revisionNo, category, 'xlsx'))
}
