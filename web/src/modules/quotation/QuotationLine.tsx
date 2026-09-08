import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getQuotationForCosting, pdfDownloadUrl } from './api'

/**
 * On an approved costing: either the quotation already released from it, with
 * a download, or the button to release one. Only an approver sees the button.
 */
export function QuotationLine({ costingId, canRelease }: { costingId: string; canRelease: boolean }) {
  const navigate = useNavigate()
  const quotation = useQuery({
    queryKey: ['quotation-for', costingId],
    queryFn: () => getQuotationForCosting(costingId),
  })

  if (quotation.isPending) return null

  if (quotation.data) {
    const q = quotation.data
    return (
      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>Quotation {q.reference_no}</strong>
          <span className="badge" style={{ marginLeft: '.5rem' }}>{q.status}</span>
          <div className="muted">To {q.customer_name}, released {new Date(q.released_at).toLocaleDateString('en-GB')}</div>
        </div>
        <div className="row">
          <button onClick={() => pdfDownloadUrl(q.pdf_path).then((url) => window.open(url, '_blank'))}>
            Open PDF
          </button>
          <button onClick={() => navigate('/quotations')}>All quotations</button>
        </div>
      </div>
    )
  }

  if (!canRelease) return null

  return (
    <div className="card row" style={{ justifyContent: 'space-between' }}>
      <span>Approved and not yet quoted.</span>
      <button className="primary" onClick={() => navigate(`/costings/${costingId}/release`)}>
        Release quotation
      </button>
    </div>
  )
}
