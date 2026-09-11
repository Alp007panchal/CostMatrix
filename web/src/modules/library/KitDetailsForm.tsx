import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { Assembly } from '../../lib/database.types'
import { updateAssembly } from './api'
import { listKitGroups } from './kits-api'
import { parseTags } from './library-fields'

/** Which group a kit belongs to, and the rating and poles the technical offer will print. */
export function KitDetailsForm({
  assembly,
  isMaster,
  companyId,
  editable,
  onSaved,
}: {
  assembly: Assembly
  isMaster: boolean
  companyId: string
  editable: boolean
  onSaved: () => void
}) {
  const groups = useQuery({ queryKey: ['kit-groups'], queryFn: listKitGroups })
  const [group, setGroup] = useState(assembly.kit_group_id ?? '')
  const [rating, setRating] = useState(assembly.rating != null ? String(assembly.rating) : '')
  const [unit, setUnit] = useState<'A' | 'KVAR'>(assembly.rating_unit ?? 'A')
  const [poles, setPoles] = useState(assembly.poles != null ? String(assembly.poles) : '')
  // Foundations F2: the wording the customer sees, and labels the configurator
  // and the assistant use to find this kit instead of parsing its name.
  const [wording, setWording] = useState(assembly.customer_wording ?? '')
  const [tags, setTags] = useState((assembly.tags ?? []).join(', '))
  const [saved, setSaved] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      updateAssembly(assembly.id, {
        kit_group_id: group || null,
        rating: rating === '' ? null : Number(rating),
        rating_unit: rating === '' ? null : unit,
        poles: poles === '' ? null : Number(poles),
        customer_wording: wording.trim() || null,
        tags: parseTags(tags),
      }),
    onSuccess: () => {
      setSaved(true)
      onSaved()
    },
  })

  // A master kit may only sit in a master group; a private kit in a master group or its own.
  const choices = (groups.data ?? []).filter((g) => g.company_id === null || (!isMaster && g.company_id === companyId))
  const dirty =
    group !== (assembly.kit_group_id ?? '') ||
    rating !== (assembly.rating != null ? String(assembly.rating) : '') ||
    unit !== (assembly.rating_unit ?? 'A') ||
    poles !== (assembly.poles != null ? String(assembly.poles) : '') ||
    wording !== (assembly.customer_wording ?? '') ||
    parseTags(tags).join(',') !== (assembly.tags ?? []).join(',')

  if (!editable) {
    const g = choices.find((c) => c.id === assembly.kit_group_id)
    return (
      <p className="muted">
        Group: {g?.name ?? 'none'}. Rating:{' '}
        {assembly.rating != null ? `${assembly.rating} ${assembly.rating_unit ?? ''}` : 'not set'}
        {assembly.poles ? `, ${assembly.poles} pole` : ''}.
        {assembly.customer_wording ? ` Customer wording: “${assembly.customer_wording}”.` : ''}
        {assembly.tags.length > 0 ? ` Labels: ${assembly.tags.join(', ')}.` : ''}
      </p>
    )
  }

  return (
    <div className="row" style={{ alignItems: 'flex-end', gap: '.75rem', flexWrap: 'wrap' }}>
      <label style={{ flex: 2, minWidth: '12rem' }}>
        <div className="muted">Kit group (hours come from it)</div>
        <select value={group} onChange={(e) => { setSaved(false); setGroup(e.target.value) }}>
          <option value="">— none —</option>
          {choices.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}{g.company_id ? ' (yours)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label style={{ width: '7rem' }}>
        <div className="muted">Rating</div>
        <input type="number" step="0.5" min="0" value={rating} onChange={(e) => { setSaved(false); setRating(e.target.value) }} />
      </label>
      <label style={{ width: '6rem' }}>
        <div className="muted">Unit</div>
        <select value={unit} onChange={(e) => { setSaved(false); setUnit(e.target.value as 'A' | 'KVAR') }}>
          <option value="A">A</option>
          <option value="KVAR">KVAR</option>
        </select>
      </label>
      <label style={{ width: '6rem' }}>
        <div className="muted">Poles</div>
        <select value={poles} onChange={(e) => { setSaved(false); setPoles(e.target.value) }}>
          <option value="">—</option>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>{n}P</option>
          ))}
        </select>
      </label>
      <button className="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Saving…' : 'Save details'}
      </button>
      {saved && !dirty && <span className="ok">Saved.</span>}
      {save.error && <span className="error">{String(save.error)}</span>}

      <div style={{ width: '100%' }}>
        <label>
          <div className="muted">
            Customer wording <span style={{ fontWeight: 400 }}>— how this kit reads in the technical
            offer, if the kit name is not what the customer should see. Optional.</span>
          </div>
          <textarea
            rows={2}
            placeholder="1 No. 1600A FP ACB (KPLC)"
            value={wording}
            onChange={(e) => { setSaved(false); setWording(e.target.value) }}
          />
        </label>
        <label>
          <div className="muted">
            Labels <span style={{ fontWeight: 400 }}>— separated by commas, e.g. incomer, apfc.
            Optional.</span>
          </div>
          <input
            placeholder="incomer, outgoer, apfc, metering"
            value={tags}
            onChange={(e) => { setSaved(false); setTags(e.target.value) }}
          />
        </label>
        <p className="muted" style={{ fontSize: '.8125rem' }}>
          Version {assembly.version}, {assembly.status}. A costing keeps the version it was built
          from, so changing this kit never changes a costing already made.
        </p>
      </div>
    </div>
  )
}
