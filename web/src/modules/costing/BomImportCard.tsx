import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Field } from '../../ui/Async'
import { parseCsv } from '../../lib/csv'
import { readSheetTables } from '../library/excel-io'
import {
  BOM_FIELDS, guessBomMapping, missingBomFields, toBomRows,
  type BomMapping, type BomRow,
} from './bom-import-read'
import { startBomImport } from './bom-import-api'
import { BomImportReview } from './BomImportReview'

/**
 * A parts list from a consultant, a customer or EPLAN, brought onto this costing
 * (roadmap 2.3). Upload, say which column is the part number, and the app shows
 * what each row matched — proposing the kit where the row named a kit's main
 * device, because that is what a costing is built from. Nothing reaches the
 * costing until the lines are chosen and brought in.
 */
export function BomImportCard({ costingId, editable }: { costingId: string; editable: boolean }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [job, setJob] = useState<string | null>(null)

  if (!editable) return null

  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ marginTop: 0 }}>Import a parts list</h2>
        {!open && <button onClick={() => setOpen(true)}>Import a file…</button>}
      </div>

      {!open && !job && (
        <p className="muted" style={{ margin: 0 }}>
          A schedule from a consultant, a customer's list, an EPLAN export: CSV or Excel. Each row is
          matched to a part, and where the part is a kit's main device the kit is proposed instead.
          Nothing is added until you choose.
        </p>
      )}

      {open && !job && (
        <Upload
          costingId={costingId}
          onStarted={(id) => {
            setJob(id)
            setOpen(false)
            void queryClient.invalidateQueries({ queryKey: ['bom-jobs', costingId] })
          }}
          onCancel={() => setOpen(false)}
        />
      )}

      {job && (
        <BomImportReview
          jobId={job}
          costingId={costingId}
          onClose={() => setJob(null)}
        />
      )}
    </div>
  )
}

function Upload({
  costingId,
  onStarted,
  onCancel,
}: {
  costingId: string
  onStarted: (jobId: string) => void
  onCancel: () => void
}) {
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [firstRow, setFirstRow] = useState(2)
  const [mapping, setMapping] = useState<BomMapping>({})
  const [error, setError] = useState<string | null>(null)

  const read = useMutation({
    mutationFn: async (file: File) => {
      setFileName(file.name)
      const name = file.name.toLowerCase()
      if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
        const tables = await readSheetTables(file)
        const table = tables.find((t) => t.rows.length > 0)
        if (!table) throw new Error('No table could be found in that workbook.')
        return { headers: table.headers, rows: table.rows, firstRowNumber: table.firstRowNumber }
      }
      const table = parseCsv(await file.text())
      if (table.rows.length === 0) throw new Error('That file has a header but no rows.')
      return { headers: table.headers, rows: table.rows, firstRowNumber: 2 }
    },
    onSuccess: (result) => {
      setError(null)
      setHeaders(result.headers)
      setRows(result.rows)
      setFirstRow(result.firstRowNumber)
      setMapping(guessBomMapping(result.headers))
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  })

  const built: BomRow[] = headers.length > 0 ? toBomRows(rows, mapping, firstRow) : []
  const missing = missingBomFields(mapping)

  const start = useMutation({
    mutationFn: () => startBomImport({ costingId, fileName, rows: built, mapping, documentId: null }),
    onSuccess: onStarted,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  })

  return (
    <>
      <div className="row">
        <input
          type="file"
          accept=".csv,.xlsx,.xlsm,text/csv"
          aria-label="Parts list file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) read.mutate(f) }}
        />
        <button onClick={onCancel}>Cancel</button>
      </div>
      {read.isPending && <p className="muted">Reading {fileName}…</p>}
      {error && <p className="error">{error}</p>}

      {headers.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: '.75rem' }}>
            {rows.length} row{rows.length === 1 ? '' : 's'} in <strong>{fileName}</strong>. Say which
            column is which; a blank quantity column means one of each.
          </p>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {BOM_FIELDS.map((f) => (
              <div key={f.field} style={{ flex: 1, minWidth: '10rem' }}>
                <Field label={f.needed ? `${f.label} *` : f.label} hint={f.hint}>
                  <select
                    value={mapping[f.field] ?? ''}
                    onChange={(e) => setMapping({ ...mapping, [f.field]: e.target.value || undefined })}
                  >
                    <option value="">—</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </Field>
              </div>
            ))}
          </div>
          <div className="row end">
            {missing.length > 0 && <span className="muted">Still to choose: the part number column</span>}
            <button
              className="primary"
              disabled={missing.length > 0 || built.length === 0 || start.isPending}
              onClick={() => start.mutate()}
            >
              {start.isPending ? 'Matching…' : `Match ${built.length} row${built.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </>
  )
}
