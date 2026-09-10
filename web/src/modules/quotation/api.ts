import { supabase } from '../../lib/supabase'
import type { Quotation, QuotationRow, QuotationStatus, ReleaseTexts } from '../../lib/database.types'

/**
 * Quotations. Releasing goes through a database function that checks the
 * role and the costing status, issues the reference and freezes the wording.
 * The PDF is uploaded first; if that fails, nothing is released.
 */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

/**
 * Every quotation with the costing behind it, so the list can show one job as
 * one job: its enquiry, its family and which revision this is.
 */
export async function listQuotations(): Promise<QuotationRow[]> {
  const { data, error } = await supabase
    .from('quotations')
    .select('*, costing:costings(family_id, revision_no, costing_no, enquiry_id, title)')
    .order('released_at', { ascending: false })
  fail('Could not load quotations', error)
  return (data ?? []) as QuotationRow[]
}

export async function getQuotationForCosting(costingId: string): Promise<Quotation | null> {
  const { data, error } = await supabase
    .from('quotations')
    .select('*')
    .eq('costing_id', costingId)
    .maybeSingle()
  fail('Could not load the quotation', error)
  return (data as Quotation | null) ?? null
}

/** Puts the PDF where only this company can read it. Returns the storage path. */
export async function uploadQuotationPdf(
  companyId: string,
  costingId: string,
  blob: Blob,
): Promise<string> {
  const path = `${companyId}/${costingId}-${Date.now()}.pdf`
  const { error } = await supabase.storage
    .from('quotations')
    .upload(path, blob, { contentType: 'application/pdf', upsert: false })
  fail('Could not store the PDF', error)
  return path
}

export async function releaseQuotation(
  costingId: string,
  pdfPath: string,
  texts: ReleaseTexts,
): Promise<Quotation> {
  const { data, error } = await supabase.rpc('release_quotation', {
    target_costing: costingId,
    pdf_path: pdfPath,
    texts,
  })
  fail('Could not release the quotation', error)
  return data as Quotation
}

export async function setQuotationStatus(
  id: string,
  status: QuotationStatus,
  reason: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('set_quotation_status', {
    target: id,
    new_status: status,
    reason,
  })
  fail('Could not change the status', error)
}

/** A link that works for a few minutes, long enough to open or save the file. */
export async function pdfDownloadUrl(pdfPath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('quotations').createSignedUrl(pdfPath, 300)
  fail('Could not open the PDF', error)
  if (!data) throw new Error('Could not open the PDF: no link was returned')
  return data.signedUrl
}

/** A logo from the private bucket as a data URL, so the PDF can embed it. */
export async function logoAsDataUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from('logos').download(path)
  if (error || !data) return null
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(data)
  })
}
