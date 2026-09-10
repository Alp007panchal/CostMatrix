import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Async } from '../../ui/Async'
import { longDate } from '../../lib/format'
import { addEnquiryAttachment, attachmentUrl, listEnquiryAttachments, removeEnquiryAttachment } from './api'

/**
 * The drawing, the specification, the email thread: whatever came with the
 * enquiry, kept with it instead of in somebody's mailbox. The files sit in a
 * private bucket and are opened through a link that lasts a few minutes.
 */
export function EnquiryFiles({
  enquiryId,
  companyId,
  canEdit,
}: {
  enquiryId: string
  companyId: string
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const files = useQuery({ queryKey: ['enquiry-files', enquiryId], queryFn: () => listEnquiryAttachments(enquiryId) })
  const input = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['enquiry-files', enquiryId] })

  const upload = useMutation({
    mutationFn: (file: File) => addEnquiryAttachment(companyId, enquiryId, file, note.trim() || null),
    onSuccess: () => { setNote(''); if (input.current) input.current.value = ''; void refresh() },
  })
  const remove = useMutation({
    mutationFn: (row: { id: string; path: string }) => removeEnquiryAttachment(row.id, row.path),
    onSuccess: () => void refresh(),
  })

  const open = (path: string) =>
    attachmentUrl(path).then((url) => window.open(url, '_blank')).catch((e: unknown) => alert(String(e)))

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Files</h2>
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
            the file — the note is saved with it.
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
              <thead><tr><th>File</th><th>Size</th><th>Added</th><th></th></tr></thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <button style={{ padding: '.1rem .4rem' }} onClick={() => open(f.path)}>{f.file_name}</button>
                      {f.note && <div className="muted" style={{ fontSize: '.8125rem' }}>{f.note}</div>}
                    </td>
                    <td className="muted">{size(f.size_bytes)}</td>
                    <td className="muted">{longDate(f.created_at)}</td>
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

function size(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
