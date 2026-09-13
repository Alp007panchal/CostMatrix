import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { PdfTechnicalRow } from '../quotation/pdf/types'
import { buildWordDocument, splitDrawings } from '../quotation/word'
import { downloadWordDocument } from '../quotation/word-io'
import { eplanGaps } from './eplan'
import { downloadEplanCsv, downloadEplanXlsx } from './eplan-io'
import { eplanParts, setEplanMetadata } from './eplan-api'
import { EplanImport } from './EplanImport'

/**
 * The drawing office's corner of the costing (roadmap 4.3): which EPLAN project
 * and drawings this board belongs to, the technical offer as an editable Word
 * document, and the parts list for them to import.
 *
 * None of it changes a price. The device tags on the parts list are the panel
 * layout's own, so a part here and a device on the GA drawing are the same thing.
 */
export function EplanCard({
  costingId,
  costingNo,
  revisionNo,
  title,
  customerName,
  companyName,
  eplanProject,
  drawingNumbers,
  technical,
  editable,
  onSaved,
}: {
  costingId: string
  costingNo: string
  revisionNo: number
  title: string
  customerName: string | null
  companyName: string
  eplanProject: string | null
  drawingNumbers: string | null
  technical: PdfTechnicalRow[]
  editable: boolean
  onSaved: () => Promise<void> | void
}) {
  const [project, setProject] = useState(eplanProject ?? '')
  const [drawings, setDrawings] = useState(drawingNumbers ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  const parts = useQuery({ queryKey: ['eplan-parts', costingId], queryFn: () => eplanParts(costingId) })
  const rows = parts.data ?? []
  const gaps = eplanGaps(rows)

  const job = {
    costingNo, revisionNo, title,
    eplanProject: project.trim() === '' ? null : project.trim(),
    drawingNumbers: drawings.trim() === '' ? null : drawings.trim(),
  }

  const run = async (what: string, task: () => Promise<void> | void) => {
    setBusy(what); setError(null); setSaid(null)
    try { await task() } catch (e: unknown) { setError(String(e)) } finally { setBusy(null) }
  }

  const save = () =>
    run('save', async () => {
      await setEplanMetadata(costingId, project, drawings)
      await onSaved()
      setSaid('Saved. No price moved: a drawing number is a reference, not a cost.')
    })

  const word = () =>
    run('word', async () => {
      await downloadWordDocument(buildWordDocument(technical, {
        companyName, costingNo, revisionNo, title, customerName,
        dateLong: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        eplanProject: job.eplanProject,
        drawingNumbers: splitDrawings(job.drawingNumbers),
      }))
      setSaid('The technical offer is on your machine as a Word document. Edit it freely — it is a copy.')
    })

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>The drawing office</h2>
      <p className="muted">
        Which EPLAN project this board is drawn in, the technical offer as an editable Word
        document, and the parts list for the drawing office to import. None of it changes a price.
      </p>

      <div className="row" style={{ gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: '.8125rem' }}>
          EPLAN project
          <input
            aria-label="EPLAN project"
            value={project}
            disabled={!editable}
            placeholder="as the drawing office names it"
            style={{ width: '16rem' }}
            onChange={(e) => setProject(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: '.8125rem' }}>
          Drawing numbers
          <textarea
            aria-label="Drawing numbers"
            value={drawings}
            disabled={!editable}
            rows={2}
            placeholder={'one per line\nE-201-01'}
            style={{ width: '16rem' }}
            onChange={(e) => setDrawings(e.target.value)}
          />
        </label>
        <button disabled={!editable || busy !== null} onClick={save} style={{ marginTop: '1.2rem' }}>
          {busy === 'save' ? 'Saving…' : 'Save project details'}
        </button>
      </div>

      {editable && <EplanImport costingId={costingId} onApplied={async () => {
        await onSaved()
        setSaid('Read from what you pasted and saved.')
      }} />}

      <div className="row" style={{ gap: '.5rem', marginTop: '.75rem', flexWrap: 'wrap' }}>
        <button disabled={busy !== null} onClick={word}>
          {busy === 'word' ? 'Writing…' : 'Technical offer as Word'}
        </button>
        <button
          disabled={busy !== null || rows.length === 0}
          onClick={() => run('csv', () => downloadEplanCsv(rows, job))}
        >
          Parts list (CSV)
        </button>
        <button
          disabled={busy !== null || rows.length === 0}
          onClick={() => run('xlsx', () => downloadEplanXlsx(rows, job))}
        >
          Parts list (Excel)
        </button>
        <span className="muted" style={{ fontSize: '.75rem', alignSelf: 'center' }}>
          {rows.length} part line(s)
        </span>
      </div>

      {gaps.map((gap) => (
        <p key={gap} className="warn" style={{ fontSize: '.8125rem', marginBottom: 0 }}>{gap}</p>
      ))}
      {error !== null && <p className="error" style={{ fontSize: '.8125rem' }}>{error}</p>}
      {said !== null && <p className="ok" style={{ fontSize: '.8125rem' }}>{said}</p>}
    </div>
  )
}
