import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Async } from '../../ui/Async'
import { longDate } from '../../lib/format'
import type { Document, DocumentEntityType } from '../../lib/database.types'
import { addDocument, documentUrl, listDocuments, removeDocument, requestExtraction } from './api'

/**
 * The drawing, the specification, the email thread: whatever came with the
 * record, kept with it instead of in somebody's mailbox. One component for an
 * enquiry, a costing, or anything else that keeps files. The files sit in a
 * private bucket and are opened through a link that lasts a few minutes.
 */
export function DocumentFiles({
  entityType,
  entityId,
  companyId,
  canEdit,
  title = 'Files',
}: {
  entityType: DocumentEntityType
  entityId: string
  companyId: string
  canEdit: boolean
  title?: string
}) {
  const queryClient = useQueryClient()
  const key = ['documents', entityType, entityId]
  const files = useQuery({ queryKey: key, queryFn: () => listDocuments(entityType, entityId) })
  const input = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: key })

  const upload = useMutation({
    mutationFn: (file: File) => addDocument(companyId, entityType, entityId, file, note.trim() || null),
    onSuccess: () => { setNote(''); if (input.current) input.current.value = ''; void refresh() },
  })
  const remove = useMutation({
    mutationFn: (row: { id: string; path: string }) => removeDocument(row.id, row.path),
    onSuccess: () => void refresh(),
  })

  const open = (path: string) =>
    documentUrl(path).then((url) => window.open(url, '_blank')).catch((e: unknown) => alert(String(e)))

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {canEdit && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input
            ref={input}
            type="file"
            aria-label="File to attach"
            style={{ flex: 2, minWidth: '14rem' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f) }}
          />
          <input
            placeholder="What it is (optional)"
            value={note}
            style={{ flex: 2, minWidth: '12rem' }}
            onChange={(e) => setNote(e.target.value)}
          />
          <span className="muted" style={{ fontSize: '.75rem', width: '100%' }}>
            Up to 20 MB each. Only your company can open them. Type what it is first, then choose
            the file — the note is saved with it. PDF, Word and Excel files have their text read so
            the assistant can use them later.
          </span>
        </div>
      )}
      {upload.isPending && <p className="muted">Uploading…</p>}
      {upload.error && <p className="error">{String(upload.error)}</p>}
      {remove.error && <p className="error">{String(remove.error)}</p>}

      <div className="table-wrap" style={{ marginTop: '.5rem' }}>
        <Async query={files} empty="Nothing attached yet.">
          {(rows) => (
            <table>
              <thead><tr><th>File</th><th>Size</th><th>Added</th><th>Text</th><th></th></tr></thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <button style={{ padding: '.1rem .4rem' }} onClick={() => open(f.path)}>{f.file_name}</button>
                      {f.note && <div className="muted" style={{ fontSize: '.8125rem' }}>{f.note}</div>}
                    </td>
                    <td className="muted">{size(f.size_bytes)}</td>
                    <td className="muted">{longDate(f.created_at)}</td>
                    <td className="muted" style={{ fontSize: '.8125rem' }}>
                      <Extraction doc={f} canEdit={canEdit} onRetry={() => { requestExtraction(f.id); void refresh() }} />
                    </td>
                    <td className="right">
                      {canEdit && (
                        <button
                          className="danger"
                          onClick={() => { if (confirm(`Remove ${f.file_name}? The file itself is deleted too.`)) remove.mutate({ id: f.id, path: f.path }) }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Async>
      </div>
    </div>
  )
}

/** One word on whether the file's text has been read, and a retry where it has not. */
function Extraction({ doc, canEdit, onRetry }: { doc: Document; canEdit: boolean; onRetry: () => void }) {
  switch (doc.extraction_status) {
    case 'done':
      return <span title={`${(doc.extracted_text ?? '').length.toLocaleString()} characters`}>read</span>
    case 'unsupported':
      return <span title="Only PDF, Word, Excel and plain text are read">not readable</span>
    case 'failed':
      return (
        <span title={doc.extraction_error ?? undefined}>
          could not read{' '}
          {canEdit && <button style={{ padding: '0 .3rem' }} onClick={onRetry}>retry</button>}
        </span>
      )
    default:
      return (
        <span>
          waiting{' '}
          {canEdit && <button style={{ padding: '0 .3rem' }} onClick={onRetry}>read now</button>}
        </span>
      )
  }
}

function size(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
