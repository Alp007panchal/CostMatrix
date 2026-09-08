import { pdf } from '@react-pdf/renderer'
import type { QuotationPdfData } from './types'
import { QuotationDocument } from './Document'

/**
 * Renders the document to a Blob in the browser. This module is the only one
 * that imports @react-pdf/renderer, and it is loaded on demand (see render.ts),
 * so the renderer's weight is only fetched at release time.
 */
export async function buildPdfBlob(data: QuotationPdfData): Promise<Blob> {
  return pdf(<QuotationDocument data={data} />).toBlob()
}
