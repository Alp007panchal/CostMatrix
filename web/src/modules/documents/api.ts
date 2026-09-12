import { supabase } from '../../lib/supabase'
import type { Document, DocumentEntityType } from '../../lib/database.types'

/**
 * Files kept with a record — an enquiry, a costing, later a quotation or a
 * component — in the one `documents` table migration 0101 introduced. The files
 * themselves sit in the private `attachments` bucket under the company's own
 * folder, which is what the storage policy checks.
 *
 * This replaces the enquiry-only functions that used to live in crm/api.ts.
 */

// Same shape as the helper each api module keeps: a Supabase error becomes one
// sentence that says what was being attempted.
function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

export async function listDocuments(entityType: DocumentEntityType, entityId: string): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
  fail('Could not load the files', error)
  return (data ?? []) as Document[]
}

/**
 * The file goes into the private bucket first, under the company's own folder;
 * only then is the record written. If the upload fails nothing is recorded, and
 * if the record fails the file is taken back out, so the two never disagree.
 * Once both are in place the text extraction is asked for; it runs in the
 * background and the row says when it is done.
 */
export async function addDocument(
  companyId: string,
  entityType: DocumentEntityType,
  entityId: string,
  file: File,
  note: string | null,
): Promise<void> {
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '-')
  const path = `${companyId}/${entityType}/${entityId}/${Date.now()}-${safeName}`
  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  fail('Could not upload the file', uploadError)

  const { data, error } = await supabase
    .from('documents')
    .insert({
      company_id: companyId,
      entity_type: entityType,
      entity_id: entityId,
      file_name: file.name,
      path,
      mime_type: file.type || null,
      size_bytes: file.size,
      note,
    })
    .select('id')
    .single()
  if (error) {
    await supabase.storage.from('attachments').remove([path])
    fail('Could not record the file', error)
  }
  if (data) requestExtraction(data.id)
}

/**
 * Asks the extract-document function to read the file's text. Fire and forget:
 * a failure here leaves the row at `pending`, which a later sweep can pick up,
 * and must never make the upload look as if it failed.
 */
export function requestExtraction(documentId: string): void {
  void supabase.functions
    .invoke('extract-document', { body: { document_id: documentId } })
    .catch(() => undefined)
}

/** A link that works for a few minutes, long enough to open or save the file. */
export async function documentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 300)
  fail('Could not open the file', error)
  if (!data) throw new Error('Could not open the file: no link was returned')
  return data.signedUrl
}

/** Removes the record and the file itself; the record goes first. */
export async function removeDocument(id: string, path: string): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', id)
  fail('Could not remove the file', error)
  await supabase.storage.from('attachments').remove([path])
}
