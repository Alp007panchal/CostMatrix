import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async, Field } from '../../ui/Async'
import { longDate } from '../../lib/format'
import { parseCsv } from '../../lib/csv'
import type { ImportJob } from '../../lib/database.types'
import { listPriceListJobs, startPriceList, uploadPriceListPdf } from './price-list-api'
import { readSheetTables } from './excel-io'
import {
  FIELD_LABELS, guessMapping, missingFields, rowsFromPdfText, toPriceRows,
  type Mapping, type PriceListRow,
} from './price-list-read'
import { PriceListReview } from './PriceListReview'

/**
 * A supplier sends a price list; this screen says what it would change before
 * anything changes (roadmap 2.2). CSV, Excel or PDF: the first two are read
 * here, the PDF's text by the extract-document function. Then the columns are
 * mapped, the database matches each row to a part, and the review shows
 * old → new with the percentage for a person to accept.
 */
export function PriceListsPage() {
  const { company, isMasterAdmin } = useSession()
  const queryClient = useQueryClient()
  const [toMaster, setToMaster] = useState(isMasterAdmin)
  const [openJob, setOpenJob] = useState<string | null>(null)

  const jobs = useQuery({ queryKey: ['price-list-jobs'], queryFn: listPriceListJobs })
  if (!company) return null
  const target = toMaster ? null : company.id

  return (
    <>
      <h1>Supplier price lists</h1>
      <p className="muted">
        Upload the list a supplier sent — CSV, Excel or PDF — say which column is the part number
        and which is the price, and the app shows every row it matched with the price it has now
        beside the price the supplier asks. <strong>Nothing changes until you accept rows.</strong>{' '}
        Accepted prices are dated, carry the supplier's name as their source, and appear in each
        part's price history.
      </p>

      {isMasterAdmin && (
        <label className="row" style={{ gap: '.4rem', marginBottom: '.75rem' }}>
          <input type="checkbox" checked={toMaster} onChange={(e) => { setToMaster(e.target.checked); setOpenJob(null) }} />
          Price the master catalogue (shared with every company)
        </label>
      )}
      {!toMaster && (
        <p className="muted" style={{ fontSize: '.8125rem' }}>
          This prices <strong>{company.name}</strong>'s own parts. Rows naming a master-catalogue
          part come back as "not in this library".
        </p>
      )}

      <Upload
        companyId={company.id}
        target={target}
        onStarted={(job) => { setOpenJob(job); void queryClient.invalidateQueries({ queryKey: ['price-list-jobs'] }) }}
      />

      {openJob && <PriceListReview jobId={openJob} onClose={() => setOpenJob(null)} />}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Earlier uploads</h2>
        <Async query={jobs} empty="No price list has been uploaded yet.">
          {(rows) => (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>File</th><th>Library</th><th>Uploaded</th><th>Rows</th><th>State</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.map((j) => (
                    <tr key={j.id}>
                      <td>{j.file_name ?? '—'}</td>
                      <td className="muted">{j.company_id ? 'company' : 'master'}</td>
                      <td className="muted">{longDate(j.started_at)}</td>
                      <td className="muted">{summaryLine(j)}</td>
                      <td><span className="badge">{stateLabel(j.status)}</span></td>
                      <td className="right">
                        <button style={{ padding: '.1rem .4rem' }} onClick={() => setOpenJob(j.id)}>
                          {j.status === 'preview' ? 'Review' : 'Open'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
    </>
  )
}

/** Choose a file, map its columns, read it into a job for review. */
function Upload({
  companyId,
  target,
  onStarted,
}: {
  companyId: string
  target: string | null
  onStarted: (jobId: string) => void
}) {
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [firstRow, setFirstRow] = useState(2)
  const [pdfRows, setPdfRows] = useState<PriceListRow[] | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Mapping>({})
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setHeaders([]); setRows([]); setPdfRows(null); setDocumentId(null); setMapping({}); setFirstRow(2)
  }

  const read = useMutation({
    mutationFn: async (file: File) => {
      reset()
      setFileName(file.name)
      const name = file.name.toLowerCase()
      if (name.endsWith('.pdf')) {
        const { documentId: id, text } = await uploadPriceListPdf(companyId, file)
        const found = rowsFromPdfText(text)
        if (found.length === 0) {
          throw new Error(
            'No price table could be found in that PDF. Ask the supplier for the list as a spreadsheet, or type the prices on the Components screen.',
          )
        }
        return { kind: 'pdf' as const, documentId: id, rows: found }
      }
      if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
        const tables = await readSheetTables(file)
        const table = tables.find((t) => t.rows.length > 0)
        if (!table) throw new Error('No table could be found in that workbook.')
        return { kind: 'table' as const, headers: table.headers, rows: table.rows, firstRowNumber: table.firstRowNumber }
      }
      const table = parseCsv(await file.text())
      if (table.rows.length === 0) throw new Error('That file has a header but no rows.')
      return { kind: 'table' as const, headers: table.headers, rows: table.rows, firstRowNumber: 2 }
    },
    onSuccess: (result) => {
      setError(null)
      if (result.kind === 'pdf') {
        setPdfRows(result.rows)
        setDocumentId(result.documentId)
      } else {
        setHeaders(result.headers)
        setRows(result.rows)
        setFirstRow(result.firstRowNumber)
        setMapping(guessMapping(result.headers))
      }
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  })

  const built = pdfRows ?? (headers.length > 0 ? toPriceRows(rows, mapping, firstRow) : [])
  const missing = pdfRows ? [] : missingFields(mapping)

  const start = useMutation({
    mutationFn: () => startPriceList({ toCompany: target, fileName, rows: built, mapping, documentId }),
    onSuccess: (job) => { reset(); setFileName(''); onStarted(job) },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  })

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Upload a list</h2>
      <input
        type="file"
        accept=".csv,.xlsx,.xlsm,.pdf,text/csv,application/pdf"
        aria-label="Price list file"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) read.mutate(f) }}
      />
      {read.isPending && <p className="muted">Reading {fileName}…</p>}
      {error && <p className="error">{error}</p>}

      {pdfRows && (
        <p className="ok" style={{ margin: '.6rem 0' }}>
          {pdfRows.length} row{pdfRows.length === 1 ? '' : 's'} found in the PDF's text. Check them in
          the review; a PDF is read line by line, so look for rows it missed.
        </p>
      )}

      {headers.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: '.75rem' }}>
            {rows.length} row{rows.length === 1 ? '' : 's'} in <strong>{fileName}</strong>. Say which
            column is which; the guesses below come from the column names.
          </p>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {FIELD_LABELS.map((f) => (
              <div key={f.field} style={{ flex: 1, minWidth: '11rem' }}>
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
        </>
      )}

      {built.length > 0 && (
        <div className="row end" style={{ marginTop: '.5rem' }}>
          {missing.length > 0 && (
            <span className="muted">
              Still to choose: {missing.map((m) => FIELD_LABELS.find((f) => f.field === m)?.label).join(' and ')}
            </span>
          )}
          <button
            className="primary"
            disabled={missing.length > 0 || start.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending ? 'Reading…' : `See what ${built.length} row${built.length === 1 ? '' : 's'} would change`}
          </button>
        </div>
      )}
    </div>
  )
}

function stateLabel(status: ImportJob['status']): string {
  return status === 'preview' ? 'waiting for you' : status === 'applied' ? 'applied' : status
}

function summaryLine(job: ImportJob): string {
  const s = job.summary as Record<string, number | undefined>
  const parts = (['changed', 'accepted', 'unchanged', 'new', 'warning', 'rejected'] as const)
    .filter((k) => (s[k] ?? 0) > 0)
    .map((k) => `${s[k]} ${k}`)
  return parts.length > 0 ? parts.join(', ') : `${job.rows_total ?? 0} rows`
}
