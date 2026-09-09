import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { parseCsv } from '../../lib/csv'
import type { ImportReport } from '../../lib/database.types'

type Rows = Record<string, string>[]

/**
 * One CSV import: choose the file, see what would happen, then apply. The
 * database does the checking; this card only parses the file, names any
 * missing columns, and shows the report.
 */
export function ImportCard({
  step,
  title,
  blurb,
  required,
  run,
  onApplied,
}: {
  step: number
  title: string
  blurb: string
  required: string[]
  run: (rows: Rows, apply: boolean, fileName: string) => Promise<ImportReport>
  onApplied: () => void
}) {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<Rows | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pickFile(file: File) {
    setError(null)
    setReport(null)
    try {
      const table = parseCsv(await file.text())
      const absent = required.filter((h) => !table.headers.includes(h))
      setMissing(absent)
      setRows(absent.length === 0 ? table.rows : null)
      setFileName(file.name)
    } catch (e) {
      setError(String(e))
    }
  }

  const preview = useMutation({
    mutationFn: () => run(rows ?? [], false, fileName),
    onSuccess: setReport,
  })
  const apply = useMutation({
    mutationFn: () => run(rows ?? [], true, fileName),
    onSuccess: (r) => {
      setReport(r)
      setRows(null)
      onApplied()
    },
  })
  const busy = preview.isPending || apply.isPending
  const err = error ?? (preview.error ? String(preview.error) : apply.error ? String(apply.error) : null)
  const todo = report ? report.new + report.changed + (report.groups_new ?? 0) : 0

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>
        {step}. {title}
      </h2>
      <p className="muted">{blurb}</p>
      <label className="field">
        <span>
          CSV file <em className="hint">— columns: {required.join(', ')}</em>
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void pickFile(f)
          }}
        />
      </label>
      {missing.length > 0 && (
        <p className="error">
          {fileName} is missing the column{missing.length > 1 ? 's' : ''} {missing.join(', ')}.
        </p>
      )}
      {rows && !report && (
        <div className="row">
          <span className="muted">
            {fileName}: {rows.length} rows read. Nothing is saved until you apply.
          </span>
          <button className="primary" disabled={busy} onClick={() => preview.mutate()}>
            {preview.isPending ? 'Checking…' : 'Preview'}
          </button>
        </div>
      )}
      {err && <p className="error">{err}</p>}
      {report && <Report report={report} />}
      {report && !report.applied && rows && (
        <div className="row end" style={{ marginTop: '.75rem' }}>
          <button onClick={() => setReport(null)}>Cancel</button>
          <button className="primary" disabled={busy || todo === 0} onClick={() => apply.mutate()}>
            {apply.isPending ? 'Saving…' : `Apply ${todo} change${todo === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  )
}

function Report({ report }: { report: ImportReport }) {
  return (
    <>
      <p>
        {report.applied ? <strong className="ok">Done. </strong> : null}
        <strong>{report.new}</strong> new, <strong>{report.changed}</strong> changed,{' '}
        <strong>{report.unchanged}</strong> unchanged, <strong>{report.rejected.length}</strong> rejected
        {report.groups_new != null && (
          <>
            , <strong>{report.groups_new}</strong> new kit group{report.groups_new === 1 ? '' : 's'}
          </>
        )}
        {report.skipped_blank != null && report.skipped_blank > 0 && (
          <>
            , <strong>{report.skipped_blank}</strong> blank row{report.skipped_blank === 1 ? '' : 's'} skipped
          </>
        )}
        .{!report.applied && ' Nothing has been saved yet.'}
      </p>
      {report.changes.length > 0 && (
        <details open={report.changes.length <= 10}>
          <summary style={{ cursor: 'pointer' }}>
            Changes ({report.changes.length}
            {report.changed > report.changes.length ? ` of ${report.changed}` : ''})
          </summary>
          <div className="table-wrap">
            <table>
              <tbody>
                {report.changes.map((c) => (
                  <tr key={c.key}>
                    <td>{c.key}</td>
                    <td>
                      {c.changes.map((d) => (
                        <div key={d.field}>
                          {d.field}: {String(d.from ?? '—')} → <strong>{String(d.to ?? '—')}</strong>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      {report.warnings && report.warnings.length > 0 && (
        <details open>
          <summary style={{ cursor: 'pointer' }}>Worth a look ({report.warnings.length})</summary>
          <ul>
            {report.warnings.map((w) => (
              <li key={`${w.row}-${w.key}`}>
                Row {w.row}: {w.reason} <span className="muted">— {w.key}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {report.rejected.length > 0 && (
        <details open>
          <summary style={{ cursor: 'pointer' }} className="error">
            Rejected ({report.rejected.length})
          </summary>
          <ul>
            {report.rejected.map((r) => (
              <li key={`${r.row}-${r.key}`}>
                Row {r.row}: {r.reason} <span className="muted">— {r.key}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
