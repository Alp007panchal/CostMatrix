import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import type { ComponentCategory, ComponentPrice } from '../../lib/database.types'
import { createImportBatch, insertComponents, updateComponentFromImport } from './api'
import { buildPreview, type Preview } from './excel-match'
import { downloadComponents, readWorkbook, type ParsedSheet } from './excel-io'

/**
 * Download the library as a spreadsheet; upload one back.
 *
 * Nothing is saved until the person has seen exactly what would happen: how
 * many rows are new, which existing ones would change and from what to what,
 * and which rows were refused and why. Uploads never delete anything.
 */
export function ExcelPanel({
  components,
  categories,
  onClose,
  onApplied,
}: {
  components: ComponentPrice[]
  categories: ComponentCategory[]
  onClose: () => void
  onApplied: () => void
}) {
  const { company, isMasterAdmin } = useSession()
  const [toMaster, setToMaster] = useState(isMasterAdmin)
  const [sheets, setSheets] = useState<ParsedSheet[] | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [fileName, setFileName] = useState('')
  const [defaultCategory, setDefaultCategory] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const scope = toMaster ? components.filter((c) => c.company_id === null) : components.filter((c) => c.company_id === company?.id)
  const validCategories = categories.map((c) => c.code)

  async function pickFile(file: File) {
    setReading(true); setError(null); setPreview(null); setDone(null)
    try {
      const parsed = await readWorkbook(file)
      if (parsed.length === 0) throw new Error('No sheet in that file has a table with a name/code column and a price column.')
      setSheets(parsed)
      setFileName(file.name)
      const first = parsed[0]
      if (first) setSheetName(first.name)
    } catch (e) {
      setError(String(e))
    } finally {
      setReading(false)
    }
  }

  function makePreview() {
    const sheet = sheets?.find((s) => s.name === sheetName)
    if (!sheet) return
    setPreview(buildPreview(sheet.rows, scope, validCategories, defaultCategory || null))
  }

  const apply = useMutation({
    mutationFn: async () => {
      if (!preview) return
      const companyId = toMaster ? null : (company?.id ?? null)
      const batchId = await createImportBatch({
        company_id: companyId,
        target: 'components',
        file_name: fileName,
        rows_new: preview.toCreate.length,
        rows_changed: preview.toUpdate.length,
        rows_unchanged: preview.unchanged.length,
        rows_rejected: preview.rejected.length,
        details: { rejected: preview.rejected.map((r) => ({ row: r.row.rowNumber, reason: r.reason })) },
      })
      await insertComponents(preview.toCreate.map((c) => ({ ...c.parsed, company_id: companyId, import_batch_id: batchId })))
      for (const u of preview.toUpdate) {
        await updateComponentFromImport(u.existing.id, { ...u.parsed, company_id: companyId }, batchId)
      }
    },
    onSuccess: () => {
      setDone(`Done: ${preview?.toCreate.length ?? 0} added, ${preview?.toUpdate.length ?? 0} changed.`)
      setPreview(null); setSheets(null)
      onApplied()
    },
  })

  const currentSheet = sheets?.find((s) => s.name === sheetName)

  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ marginTop: 0 }}>Excel</h2>
        <button onClick={onClose}>Close</button>
      </div>

      {isMasterAdmin && (
        <label className="row" style={{ gap: '.4rem', marginBottom: '.75rem' }}>
          <input type="checkbox" checked={toMaster} onChange={(e) => { setToMaster(e.target.checked); setPreview(null) }} />
          Work on the master library (shared with every company)
        </label>
      )}

      <div className="row" style={{ marginBottom: '1rem' }}>
        <button onClick={() => downloadComponents(scope, `costmatrix-components-${new Date().toISOString().slice(0, 10)}.xlsx`).catch((e: unknown) => setError(String(e)))}>
          Download {scope.length} component{scope.length === 1 ? '' : 's'} as .xlsx
        </button>
        <span className="muted">Edit it, or send it to a supplier, then upload it back. The download is also the template.</span>
      </div>

      <label className="field">
        <span>Upload a spreadsheet <em className="hint">— .xlsx or .xlsm; the old costing sheets work too</em></span>
        <input type="file" accept=".xlsx,.xlsm" disabled={reading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f) }} />
      </label>

      {reading && <p className="muted">Reading…</p>}
      {error && <p className="error">{error}</p>}
      {done && <p className="ok">{done}</p>}

      {sheets && (
        <div className="row" style={{ marginBottom: '.75rem' }}>
          {sheets.length > 1 && (
            <select value={sheetName} onChange={(e) => { setSheetName(e.target.value); setPreview(null) }}>
              {sheets.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.rows.length} rows)</option>)}
            </select>
          )}
          <select value={defaultCategory} onChange={(e) => { setDefaultCategory(e.target.value); setPreview(null) }}>
            <option value="">Category from the sheet's own column</option>
            {categories.map((c) => <option key={c.code} value={c.code}>All rows are: {c.name}</option>)}
          </select>
          <button className="primary" onClick={makePreview}>Preview</button>
          {currentSheet && currentSheet.unknownHeaders.length > 0 && (
            <span className="muted">Ignoring columns: {currentSheet.unknownHeaders.join(', ')}</span>
          )}
        </div>
      )}

      {preview && (
        <>
          <p>
            <strong>{preview.toCreate.length}</strong> new, <strong>{preview.toUpdate.length}</strong> changed,{' '}
            <strong>{preview.unchanged.length}</strong> unchanged, <strong>{preview.rejected.length}</strong> rejected.
            Nothing has been saved yet.
          </p>

          {preview.toUpdate.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Row</th><th>Component</th><th>Change</th></tr></thead>
                <tbody>
                  {preview.toUpdate.map((u) => (
                    <tr key={u.row.rowNumber}>
                      <td className="muted">{u.row.rowNumber}</td>
                      <td>{u.existing.code} — {u.existing.name}</td>
                      <td>{u.changes.map((c) => <div key={c.field}>{c.field}: {c.from} → <strong>{c.to}</strong></div>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.toCreate.length > 0 && (
            <details style={{ marginTop: '.75rem' }}>
              <summary style={{ cursor: 'pointer' }}>New components ({preview.toCreate.length})</summary>
              <ul>{preview.toCreate.map((c) => <li key={c.row.rowNumber}>{c.parsed.code} — {c.parsed.name} {c.parsed.manufacturer && <span className="muted">({c.parsed.manufacturer})</span>}</li>)}</ul>
            </details>
          )}

          {preview.rejected.length > 0 && (
            <details style={{ marginTop: '.75rem' }} open>
              <summary style={{ cursor: 'pointer' }} className="error">Rejected rows ({preview.rejected.length})</summary>
              <ul>{preview.rejected.map((r) => <li key={r.row.rowNumber}>Row {r.row.rowNumber}: {r.reason} {r.row.name && <span className="muted">— {r.row.name}</span>}</li>)}</ul>
            </details>
          )}

          {apply.error && <p className="error">{String(apply.error)}</p>}

          <div className="row end" style={{ marginTop: '1rem' }}>
            <button onClick={() => setPreview(null)}>Cancel</button>
            <button className="primary" disabled={apply.isPending || (preview.toCreate.length + preview.toUpdate.length === 0)} onClick={() => apply.mutate()}>
              {apply.isPending ? 'Saving…' : `Save ${preview.toCreate.length + preview.toUpdate.length} change${preview.toCreate.length + preview.toUpdate.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
