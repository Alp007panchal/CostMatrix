import { type EplanJob, type EplanPart, eplanCells, eplanFileName, eplanToCsv } from './eplan'

/** Writing the parts list. exceljs loads on demand, as it does for the BOMs. */

function save(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadEplanCsv(parts: EplanPart[], job: EplanJob): void {
  // A leading BOM, because EPLAN and Excel both read CSV as the system code page
  // otherwise and a part description with a degree sign comes out wrong.
  save(new Blob(['﻿', eplanToCsv(parts, job)], { type: 'text/csv;charset=utf-8' }),
       eplanFileName(job, 'csv'))
}

export async function downloadEplanXlsx(parts: EplanPart[], job: EplanJob): Promise<void> {
  const mod = await import('exceljs')
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Parts')

  const cells = eplanCells(parts, job)
  cells.forEach((row, i) => {
    const r = ws.addRow(row)
    if (i === 0) r.font = { bold: true }
  })
  ws.columns.forEach((col, i) => { col.width = i === 3 ? 48 : 16 })
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  const buffer = await wb.xlsx.writeBuffer()
  save(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
       eplanFileName(job, 'xlsx'))
}
