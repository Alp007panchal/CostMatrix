import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Field } from '../../ui/Async'
import type { Customer } from '../../lib/database.types'
import { updateCustomer, type CustomerInput } from './api'

/** Correct a customer's details. The name and address print on quotations, so typos matter. */
export function CustomerEditForm({ customer, onClose, onSaved }: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CustomerInput>({
    name: customer.name, address: customer.address ?? '', city: customer.city ?? '',
    country: customer.country ?? '', tax_pin: customer.tax_pin ?? '', notes: customer.notes ?? '',
  })
  const set = (k: keyof CustomerInput, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const save = useMutation({
    mutationFn: () => updateCustomer(customer.id, {
      name: form.name.trim(), address: form.address?.trim() || null, city: form.city?.trim() || null,
      country: form.country?.trim() || null, tax_pin: form.tax_pin?.trim() || null, notes: form.notes?.trim() || null,
    }),
    onSuccess: onSaved,
  })
  function submit(e: FormEvent) { e.preventDefault(); save.mutate() }
  return (
    <form className="card" onSubmit={submit}>
      <div className="spread"><h2 style={{ marginTop: 0 }}>Edit customer</h2><button type="button" onClick={onClose}>Cancel</button></div>
      <Field label="Company name"><input value={form.name} required autoFocus onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Address"><textarea value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
      <div className="row">
        <div style={{ flex: 1 }}><Field label="City"><input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Country"><input value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Tax PIN"><input value={form.tax_pin ?? ''} onChange={(e) => set('tax_pin', e.target.value)} /></Field></div>
      </div>
      <Field label="Notes" hint="optional"><textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      {save.error && <p className="error">{String(save.error)}</p>}
      <p className="muted" style={{ fontSize: '.8125rem' }}>Quotations already released keep the name and address they were printed with.</p>
      <div className="row end"><button type="submit" className="primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button></div>
    </form>
  )
}
