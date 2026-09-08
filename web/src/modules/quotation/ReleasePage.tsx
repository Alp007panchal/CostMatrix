import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Field } from '../../ui/Async'
import type { QuotationTerms, ReleaseTexts } from '../../lib/database.types'
import { getCompanySettings, listFooterLogos } from '../admin/api'
import { getEnquiry, listContacts, listCustomers } from '../crm/api'
import { getCostingDetail } from '../costing/api'
import { logoAsDataUrl, releaseQuotation, uploadQuotationPdf } from './api'
import { prepareQuotationPdf } from './pdf/prepare'
import { renderQuotationPdf } from './pdf/render'

/**
 * Release a quotation from an approved costing. The approver checks the
 * wording, previews the PDF, and releases: render, store, then record. If the
 * PDF cannot be stored, nothing is recorded.
 */
export function ReleasePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { company } = useSession()

  const detail = useQuery({ queryKey: ['costing', id], queryFn: () => getCostingDetail(id), enabled: Boolean(id) })
  const settings = useQuery({
    queryKey: ['company-settings', company?.id],
    queryFn: () => getCompanySettings(company?.id ?? ''),
    enabled: Boolean(company),
  })
  const footerLogos = useQuery({
    queryKey: ['footer-logos', company?.id],
    queryFn: () => listFooterLogos(company?.id ?? ''),
    enabled: Boolean(company),
  })

  const customers = useQuery({ queryKey: ['customers'], queryFn: listCustomers })
  const [customerId, setCustomerId] = useState('')
  const [contactId, setContactId] = useState('')
  const contacts = useQuery({ queryKey: ['contacts', customerId], queryFn: () => listContacts(customerId), enabled: Boolean(customerId) })

  const [form, setForm] = useState<Required<Omit<ReleaseTexts, 'terms' | 'customer_id' | 'contact_id'>> & { terms: QuotationTerms }>({
    customer_name: '', customer_address: '', subject: '', salutation: '', intro_text: '',
    closing_text: '', notes_on_offer: '', signatory_name: '', signatory_email: '',
    terms: { scope_of_supply: '', validity: '', payment: '', delivery_terms: '', delivery_timelines: '' },
  })
  const [seeded, setSeeded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill from the company defaults once they arrive.
  useEffect(() => {
    if (seeded || !settings.data || !detail.data) return
    const s = settings.data
    setForm((f) => ({
      ...f,
      subject: `QUOTATION FOR ${detail.data.costing.title.toUpperCase()}`,
      salutation: s.salutation, intro_text: s.intro_text, closing_text: s.closing_text,
      notes_on_offer: s.default_notes_on_offer ?? '',
      signatory_name: s.signatory_name ?? '', signatory_email: s.signatory_email ?? '',
      terms: {
        scope_of_supply: s.scope_of_supply ?? '',
        validity: `This offer is open for acceptance for ${s.validity_days} days from the date hereof; thereafter subject to confirmation.`,
        payment: s.payment_terms ?? '', delivery_terms: s.delivery_terms ?? '', delivery_timelines: s.delivery_timelines ?? '',
      },
    }))
    setSeeded(true)
    // If the costing came from an enquiry, its customer is the default addressee.
    const enquiryId = detail.data.costing.enquiry_id
    if (enquiryId) void getEnquiry(enquiryId).then((en) => { if (en) { setCustomerId(en.customer_id); setContactId(en.contact_id ?? '') } })
  }, [settings.data, detail.data, seeded])

  // Choosing a customer fills the printed name and address; they stay editable.
  useEffect(() => {
    const c = customers.data?.find((x) => x.id === customerId)
    if (!c) return
    setForm((f) => ({ ...f, customer_name: c.name, customer_address: [c.address, c.city, c.country].filter(Boolean).join('\n') }))
  }, [customerId, customers.data])

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const setTerm = (key: keyof QuotationTerms, value: string) => setForm((f) => ({ ...f, terms: { ...f.terms, [key]: value } }))

  async function buildPdf(referenceNo: string): Promise<Blob> {
    if (!detail.data || !company || !settings.data) throw new Error('Still loading')
    const s = settings.data
    const [logo, footers] = await Promise.all([
      logoAsDataUrl(company.logo_path),
      Promise.all((footerLogos.data ?? []).map((l) => logoAsDataUrl(l.image_path))),
    ])
    const data = prepareQuotationPdf({
      detail: detail.data,
      letterhead: {
        company_name: company.name, po_box: s.po_box, street_address: s.street_address,
        phones: s.phones, email: s.email, tax_pin: company.tax_pin, logo_path: company.logo_path,
        currency_label: company.currency_label,
      },
      logoDataUrl: logo,
      footerLogoDataUrls: footers.filter((f): f is string => Boolean(f)),
      referenceNo,
      releasedAt: new Date(),
      customerName: form.customer_name, customerAddress: form.customer_address || null,
      subject: form.subject, salutation: form.salutation, introText: form.intro_text, closingText: form.closing_text,
      notesOnOffer: form.notes_on_offer || null, terms: form.terms,
      signatoryName: form.signatory_name || null, signatoryEmail: form.signatory_email || null,
    })
    return renderQuotationPdf(data)
  }

  const preview = useMutation({
    mutationFn: async () => {
      const blob = await buildPdf(`${company?.quotation_prefix ?? 'QT'}-PREVIEW`)
      window.open(URL.createObjectURL(blob), '_blank')
    },
    onError: (e) => setError(String(e)),
  })

  const release = useMutation({
    mutationFn: async () => {
      if (!detail.data || !company) throw new Error('Still loading')
      if (!form.customer_name.trim()) throw new Error('Enter the customer name')
      // The reference is issued by the database at release; the PDF is rendered
      // with the number it will get, then stored, then the release is recorded.
      // If storing fails, nothing is recorded, so there is never a quotation
      // without its document.
      const expectedRef = await predictReference()
      const blob = await buildPdf(expectedRef)
      const path = await uploadQuotationPdf(company.id, detail.data.costing.id, blob)
      return releaseQuotation(detail.data.costing.id, path, {
        ...form,
        customer_id: customerId || undefined,
        contact_id: contactId || undefined,
        customer_address: form.customer_address || undefined,
        notes_on_offer: form.notes_on_offer || undefined,
      } as ReleaseTexts)
    },
    onSuccess: (q) => navigate(`/costings/${q.costing_id}`),
    onError: (e) => setError(String(e)),
  })

  // The number the database will issue: the family's existing sequence, or the
  // next one. Shown on the preview and rendered into the PDF.
  async function predictReference(): Promise<string> {
    const c = detail.data?.costing
    if (!c || !company) return 'QT-0000'
    const { supabase } = await import('../../lib/supabase')
    const { data: family } = await supabase.from('costings').select('quotation_seq, quotation_seq_year').eq('family_id', c.family_id).not('quotation_seq', 'is', null).limit(1).maybeSingle()
    let seq = family?.quotation_seq as number | null
    let year = family?.quotation_seq_year as number | null
    if (seq == null) {
      const yr = company.quotation_no_includes_year ? new Date().getFullYear() : 0
      const { data: counter } = await supabase.from('company_counters').select('last_no').eq('kind', 'quotation').eq('year', yr).maybeSingle()
      seq = ((counter?.last_no as number | undefined) ?? 0) + 1
      year = yr
    }
    return `${company.quotation_prefix}${year ? `-${year}` : ''}-${String(seq).padStart(4, '0')}-REV${c.revision_no}`
  }

  if (detail.isPending || settings.isPending) return <p className="empty">Loading…</p>
  if (detail.error) return <p className="error">{String(detail.error)}</p>
  if (!detail.data || !company) return null

  const costing = detail.data.costing
  if (costing.status !== 'approved' || !costing.is_current) {
    return <div className="card"><h1>Not ready</h1><p>Only the current, approved revision can be quoted.</p><button onClick={() => navigate(`/costings/${id}`)}>Back</button></div>
  }

  const busy = preview.isPending || release.isPending

  return (
    <>
      <button onClick={() => navigate(`/costings/${id}`)}>← Back to {costing.costing_no}</button>
      <h1 style={{ marginTop: '.75rem' }}>Release quotation</h1>
      <p className="muted">
        Check the wording, preview the PDF, then release. Once released nothing on it changes; a
        change means a new revision of the costing.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Addressed to</h2>
        <div className="row">
          <div style={{ flex: 2 }}>
            <Field label="Customer record" hint="from your customer list; fills the name and address below">
              <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setContactId('') }}>
                <option value="">— type the name below instead —</option>
                {(customers.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Contact" hint="optional">
              <select value={contactId} disabled={!customerId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">—</option>
                {(contacts.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <Field label="Printed as" hint="as it should appear after “To:”">
          <input value={form.customer_name} required onChange={(e) => set('customer_name', e.target.value)} />
        </Field>
        <Field label="Address" hint="optional">
          <textarea value={form.customer_address} onChange={(e) => set('customer_address', e.target.value)} />
        </Field>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Cover letter</h2>
        <Field label="Subject line"><input value={form.subject} onChange={(e) => set('subject', e.target.value)} /></Field>
        <Field label="Salutation"><input value={form.salutation} onChange={(e) => set('salutation', e.target.value)} /></Field>
        <Field label="Opening"><textarea value={form.intro_text} onChange={(e) => set('intro_text', e.target.value)} /></Field>
        <Field label="Closing"><textarea value={form.closing_text} onChange={(e) => set('closing_text', e.target.value)} /></Field>
        <div className="row">
          <div style={{ flex: 1 }}><Field label="Signed by"><input value={form.signatory_name} onChange={(e) => set('signatory_name', e.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Email"><input value={form.signatory_email} onChange={(e) => set('signatory_email', e.target.value)} /></Field></div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Annexure I — Notes on the offer</h2>
        <Field label="One note per line" hint="enclosure form, switchgear make, scope">
          <textarea value={form.notes_on_offer} style={{ minHeight: '6rem' }} onChange={(e) => set('notes_on_offer', e.target.value)} />
        </Field>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Annexure III — Terms</h2>
        <Field label="Scope of supply"><textarea value={form.terms.scope_of_supply ?? ''} onChange={(e) => setTerm('scope_of_supply', e.target.value)} /></Field>
        <Field label="Validity"><input value={form.terms.validity ?? ''} onChange={(e) => setTerm('validity', e.target.value)} /></Field>
        <Field label="Terms of payment"><textarea value={form.terms.payment ?? ''} onChange={(e) => setTerm('payment', e.target.value)} /></Field>
        <Field label="Delivery terms"><input value={form.terms.delivery_terms ?? ''} onChange={(e) => setTerm('delivery_terms', e.target.value)} /></Field>
        <Field label="Delivery timelines"><input value={form.terms.delivery_timelines ?? ''} onChange={(e) => setTerm('delivery_timelines', e.target.value)} /></Field>
      </div>

      <p className="muted">
        The price schedule and the technical offer come from the costing itself: {detail.data.panels.length} panel{detail.data.panels.length === 1 ? '' : 's'}, edited on the costing screen.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="row end">
        <button disabled={busy} onClick={() => { setError(null); preview.mutate() }}>{preview.isPending ? 'Rendering…' : 'Preview PDF'}</button>
        <button className="primary" disabled={busy || !form.customer_name.trim()} onClick={() => { setError(null); release.mutate() }}>
          {release.isPending ? 'Releasing…' : 'Release quotation'}
        </button>
      </div>
    </>
  )
}
