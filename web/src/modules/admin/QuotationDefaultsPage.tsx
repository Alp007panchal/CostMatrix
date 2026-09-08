import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Field } from '../../ui/Async'
import type { CompanySettings } from '../../lib/database.types'
import {
  addFooterLogo, getCompanySettings, listFooterLogos, removeFooterLogo,
  updateCompany, updateCompanySettings, uploadLogo,
} from './api'
import { logoAsDataUrl } from '../quotation/api'

/**
 * What every quotation starts from: the letterhead, the standard wording, the
 * terms, the signatory and the logos. The approver can still change the
 * wording on each quotation; this is where the defaults live.
 */
export function QuotationDefaultsPage() {
  const { company, refresh: refreshSession } = useSession()
  const queryClient = useQueryClient()
  const companyId = company?.id ?? ''

  const settings = useQuery({ queryKey: ['company-settings', companyId], queryFn: () => getCompanySettings(companyId), enabled: Boolean(companyId) })
  const footers = useQuery({ queryKey: ['footer-logos', companyId], queryFn: () => listFooterLogos(companyId), enabled: Boolean(companyId) })

  const [form, setForm] = useState<CompanySettings | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (settings.data) setForm(settings.data) }, [settings.data])

  const save = useMutation({
    mutationFn: async (values: CompanySettings) => {
      const { id: _id, company_id: _c, ...changes } = values
      void _id; void _c
      await updateCompanySettings(companyId, changes)
    },
    onSuccess: () => { setSaved(true); void queryClient.invalidateQueries({ queryKey: ['company-settings', companyId] }) },
  })

  if (!company) return null
  if (settings.isPending) return <p className="empty">Loading…</p>
  if (settings.error) return <p className="error">{String(settings.error)}</p>
  if (!form) return null

  const set = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => { setSaved(false); setForm({ ...form, [key]: value }) }
  const text = (key: keyof CompanySettings, label: string, hint?: string, multiline = false) => (
    <Field label={label} {...(hint ? { hint } : {})}>
      {multiline
        ? <textarea value={(form[key] as string | null) ?? ''} onChange={(e) => set(key, e.target.value as never)} />
        : <input value={(form[key] as string | null) ?? ''} onChange={(e) => set(key, e.target.value as never)} />}
    </Field>
  )

  function submit(e: FormEvent) { e.preventDefault(); if (form) save.mutate(form) }

  return (
    <>
      <h1>Quotation wording</h1>
      <p className="muted">Every new quotation starts from these. The approver can still edit the wording on each one.</p>

      <LogoCard companyId={companyId} currentPath={company.logo_path} onChanged={refreshSession} />

      <FooterLogosCard companyId={companyId} logos={footers.data ?? []} onChanged={() => queryClient.invalidateQueries({ queryKey: ['footer-logos', companyId] })} />

      <form onSubmit={submit}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Letterhead</h2>
          {text('po_box', 'P.O. Box', 'e.g. 18525-00500')}
          {text('street_address', 'Address', 'e.g. Road 1, off Baba Dogo Road, Ruaraka, Nairobi, Kenya')}
          {text('phones', 'Phone numbers')}
          {text('email', 'Email')}
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Cover letter</h2>
          {text('salutation', 'Salutation')}
          {text('intro_text', 'Opening sentence', undefined, true)}
          {text('closing_text', 'Closing paragraph', undefined, true)}
          <div className="row">
            <div style={{ flex: 1 }}>{text('signatory_name', 'Signed by')}</div>
            <div style={{ flex: 1 }}>{text('signatory_email', 'Signatory email')}</div>
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Standard annexure text</h2>
          {text('default_notes_on_offer', 'Notes on the offer', 'one per line; e.g. switchgear make, scope', true)}
          {text('scope_of_supply', 'Scope of supply', undefined, true)}
          <Field label="Validity, days">
            <input type="number" min="1" value={form.validity_days} style={{ maxWidth: '8rem' }} onChange={(e) => set('validity_days', Number(e.target.value))} />
          </Field>
          {text('payment_terms', 'Terms of payment', undefined, true)}
          {text('delivery_terms', 'Delivery terms', 'e.g. Ex-Works Nairobi')}
          {text('delivery_timelines', 'Delivery timelines', 'e.g. To be confirmed after order confirmation')}
          {text('bank_details', 'Bank details', 'optional', true)}
        </div>
        {save.error && <p className="error">{String(save.error)}</p>}
        {saved && <p className="ok">Saved.</p>}
        <div className="row end">
          <button type="submit" className="primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save wording'}</button>
        </div>
      </form>
    </>
  )
}

function LogoCard({ companyId, currentPath, onChanged }: { companyId: string; currentPath: string | null; onChanged: () => Promise<void> }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void logoAsDataUrl(currentPath).then(setPreview) }, [currentPath])

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadLogo(companyId, file, 'header')
      await updateCompany(companyId, { logo_path: path })
    },
    onSuccess: onChanged,
    onError: (e) => setError(String(e)),
  })

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Header logo</h2>
      <div className="row">
        {preview ? <img src={preview} alt="Company logo" style={{ height: 56, maxWidth: 200, objectFit: 'contain', background: '#fff', border: '1px solid var(--line)', padding: 4 }} /> : <span className="muted">None yet — the company name prints instead.</span>}
        <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" disabled={upload.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setError(null); upload.mutate(f) } }} />
      </div>
      <p className="muted" style={{ fontSize: '.8125rem' }}>PNG with a transparent background prints best. It appears top-left on every page.</p>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function FooterLogosCard({ companyId, logos, onChanged }: { companyId: string; logos: { id: string; image_path: string; caption: string | null }[]; onChanged: () => Promise<unknown> }) {
  const [previews, setPreviews] = useState<Record<string, string | null>>({})
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void Promise.all(logos.map(async (l) => [l.id, await logoAsDataUrl(l.image_path)] as const)).then((pairs) => setPreviews(Object.fromEntries(pairs)))
  }, [logos])

  const add = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadLogo(companyId, file, 'footer')
      await addFooterLogo(companyId, path, file.name.replace(/\.[^.]+$/, ''), logos.length)
    },
    onSuccess: onChanged,
    onError: (e) => setError(String(e)),
  })
  const remove = useMutation({ mutationFn: removeFooterLogo, onSuccess: onChanged })

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Footer strip</h2>
      <p className="muted">Partner logos and certification marks, printed in a row at the foot of every page.</p>
      <div className="row" style={{ marginBottom: '.75rem' }}>
        {logos.map((l) => (
          <div key={l.id} style={{ textAlign: 'center' }}>
            {previews[l.id] ? <img src={previews[l.id] ?? ''} alt={l.caption ?? ''} style={{ height: 32, maxWidth: 90, objectFit: 'contain' }} /> : <span className="muted">…</span>}
            <div><button className="danger" style={{ fontSize: '.75rem' }} onClick={() => remove.mutate(l.id)}>remove</button></div>
          </div>
        ))}
        {logos.length === 0 && <span className="muted">None yet.</span>}
      </div>
      <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" disabled={add.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setError(null); add.mutate(f) } }} />
      {error && <p className="error">{error}</p>}
    </div>
  )
}
