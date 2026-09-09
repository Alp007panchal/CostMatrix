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
  second,
  run,
  onApplied,
}: {
  step: number
  title: string
  blurb: string
  required: string[]
  /** An optional companion file (category map; kit template) with its own required columns. */
  second?: { label: string; hint: string; required: string[]; optional?: boolean }
  run: (rows: Rows, secondRows: Rows, apply: boolean, fileName: string) => Promise<ImportReport>
  onApplied: () => void
}) {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<Rows | null>(null)
  const [secondRows, setSecondRows] = useState<Rows | null>(null)
  const [secondName, setSecondName] = useState('')
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

  async function pickSecond(file: File) {
    setError(null)
    setReport(null)
    try {
      const table = parseCsv(await file.text())
      const absent = (second?.required ?? []).filter((h) => !table.headers.includes(h))
      if (absent.length > 0) {
        setError(`${file.name} is missing the column${absent.length > 1 ? 's' : ''} ${absent.join(', ')}.`)
        setSecondRows(null)
        return
      }
      setSecondRows(table.rows)
      setSecondName(file.name)
    } catch (e) {
      setError(String(e))
    }
  }

  const ready = rows !== null && (!second || second.optional || secondRows !== null)
  const preview = useMutation({
    mutationFn: () => run(rows ?? [], secondRows ?? [], false, fileName),
    onSuccess: setReport,
  })
  const apply = useMutation({
    mutationFn: () => run(rows ?? [], secondRows ?? [], true, fileName),
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
      {second && (
        <label className="field">
          <span>
            {second.label} <em className="hint">— {second.hint}; columns: {second.required.join(', ')}</em>
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void pickSecond(f)
            }}
          />
        </label>
      )}
      {rows && !report && (
        <div className="row">
          <span className="muted">
            {fileName}: {rows.length} rows read{secondRows ? `; ${secondName}: ${secondRows.length} rows` : ''}.
            {second && !second.optional && !secondRows ? ` Add ${second.label.toLowerCase()} to continue.` : ' Nothing is saved until you apply.'}
          </span>
          <button className="primary" disabled={busy || !ready} onClick={() => preview.mutate()}>
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
            , <strong>{report.skipped_blank}</strong> blank cell{report.skipped_blank === 1 ? '' : 's'} skipped
          </>
        )}
        {report.busbar_kg_derived != null && report.busbar_kg_derived > 0 && (
          <>
            , <strong>{report.busbar_kg_derived}</strong> busbar size{report.busbar_kg_derived === 1 ? '' : 's'} priced by weight (kg/m = price ÷ copper rate)
          </>
        )}
        {report.overrides != null && report.overrides > 0 && (
          <>
            , <strong>{report.overrides}</strong> kit{report.overrides === 1 ? '' : 's'} with their own hours
          </>
        )}
        .{!report.applied && ' Nothing has been saved yet.'}
      </p>
      {report.warnings && report.warnings.length > 0 && (
        <details open={report.warnings.length <= 15}>
          <summary style={{ cursor: 'pointer' }}>Warnings ({report.warnings.length})</summary>
          <ul>
            {report.warnings.map((w, i) => (
              <li key={i}>{w.row != null ? `Row ${w.row}: ` : ''}{w.key}: {w.reason}</li>
            ))}
          </ul>
        </details>
      )}
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
