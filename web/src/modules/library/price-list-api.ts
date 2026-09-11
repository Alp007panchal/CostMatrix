import { supabase } from '../../lib/supabase'
import type { ImportJob, ImportRow } from '../../lib/database.types'
import { fail } from './api'
import type { Mapping, PriceListRow } from './price-list-read'

/**
 * Supplier price lists (migration 0105). The file is read in the browser, the
 * matching and the writing happen in the database: `start_price_list` previews,
 * `accept_price_rows` applies the rows a person chose, and until that call
 * nothing in the catalogue has moved.
 */

export async function listPriceListJobs(): Promise<ImportJob[]> {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('type', 'price_list')
    .order('started_at', { ascending: false })
    .limit(25)
  fail('Could not load the price lists', error)
  return (data ?? []) as ImportJob[]
}

export async function listJobRows(jobId: string): Promise<ImportRow[]> {
  const { data, error } = await supabase
    .from('import_rows')
    .select('*')
    .eq('job_id', jobId)
    .order('row_number')
  fail('Could not load the rows', error)
  return (data ?? []) as ImportRow[]
}

/** Reads the file into a job for review. Writes nothing else. */
export async function startPriceList(input: {
  toCompany: string | null
  fileName: string
  rows: PriceListRow[]
  mapping: Mapping
  documentId: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('start_price_list', {
    to_company: input.toCompany,
    file_name: input.fileName,
    rows: input.rows,
    mapping: input.mapping,
    document: input.documentId,
  })
  fail('Could not read the price list', error)
  return data as string
}

export interface AcceptOutcome {
  applied: number
  skipped: number
  remaining: number
  status: string
}

/** `rowIds` null accepts every row the preview marked as a price change. */
export async function acceptPriceRows(jobId: string, rowIds: string[] | null): Promise<AcceptOutcome> {
  const { data, error } = await supabase.rpc('accept_price_rows', { job: jobId, row_ids: rowIds })
  fail('Could not accept the prices', error)
  return data as AcceptOutcome
}

export async function discardImportJob(jobId: string, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('discard_import_job', { job: jobId, reason })
  fail('Could not discard the upload', error)
}

/**
 * A PDF price list: the file goes into the private bucket as a document of its
 * own, the extract-document function reads its text, and the text comes back
 * here to be cut into rows. The document record stays, so there is a copy of
 * what the supplier actually sent beside the prices it changed.
 */
export async function uploadPriceListPdf(companyId: string, file: File): Promise<{ documentId: string; text: string }> {
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '-')
  const path = `${companyId}/supplier_price_list/${Date.now()}-${safeName}`
  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(path, file, { contentType: file.type || 'application/pdf', upsert: false })
  fail('Could not upload the file', uploadError)

  const { data, error } = await supabase
    .from('documents')
    .insert({
      company_id: companyId,
      entity_type: 'supplier_price_list',
      entity_id: null,
      file_name: file.name,
      path,
      mime_type: file.type || 'application/pdf',
      size_bytes: file.size,
      note: 'Supplier price list',
    })
    .select('id')
    .single()
  if (error) {
    await supabase.storage.from('attachments').remove([path])
    fail('Could not record the file', error)
  }
  const documentId = (data as { id: string }).id

  const { error: readError } = await supabase.functions.invoke('extract-document', {
    body: { document_id: documentId },
  })
  if (readError) {
    throw new Error(
      'The file was uploaded but its text could not be read. Try the list as CSV or Excel instead.',
    )
  }

  const { data: row, error: textError } = await supabase
    .from('documents')
    .select('extracted_text, extraction_status, extraction_error')
    .eq('id', documentId)
    .single()
  fail('Could not read the text back', textError)
  const doc = row as { extracted_text: string | null; extraction_status: string; extraction_error: string | null }
  if (doc.extraction_status !== 'done' || !doc.extracted_text) {
    throw new Error(
      doc.extraction_error
        ? `The text could not be read: ${doc.extraction_error}`
        : 'The text could not be read from that file. Try the list as CSV or Excel instead.',
    )
  }
  return { documentId, text: doc.extracted_text }
}
