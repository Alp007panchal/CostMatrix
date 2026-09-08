import type { QuotationPdfData } from './types'

/** Loads the renderer only when somebody actually releases a quotation. */
export async function renderQuotationPdf(data: QuotationPdfData): Promise<Blob> {
  const { buildPdfBlob } = await import('./build')
  return buildPdfBlob(data)
}
