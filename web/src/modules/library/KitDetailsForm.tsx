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
  // Foundations F12: the room this kit takes on a mounting plate, when it is not
  // simply its main device plus clearances. Blank = work it out from the device.
  const [fpW, setFpW] = useState(assembly.footprint_w_mm != null ? String(assembly.footprint_w_mm) : '')
  const [fpH, setFpH] = useState(assembly.footprint_h_mm != null ? String(assembly.footprint_h_mm) : '')
  const [fpD, setFpD] = useState(assembly.footprint_d_mm != null ? String(assembly.footprint_d_mm) : '')
  // Roadmap 3.8: what the layout needs to place this kit — which mounting design
  // it belongs to, the height it takes on the stack, how many fit across a plate.
  const [design, setDesign] = useState<string>(assembly.mounting_design ?? '')
  const [moduleH, setModuleH] = useState(assembly.module_height_mm != null ? String(assembly.module_height_mm) : '')
  const [positions, setPositions] = useState(assembly.positions_per_plate != null ? String(assembly.positions_per_plate) : '')
  const [saved, setSaved] = useState(false)

  const whole = (value: string): number | null => {
    const n = Number(value.trim())
    return value.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : Math.round(n)
  }

  const mm = (value: string): number | null => {
    const n = Number(value.trim())
    return value.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : n
  }

  const save = useMutation({
    mutationFn: () =>
      updateAssembly(assembly.id, {
        kit_group_id: group || null,
        rating: rating === '' ? null : Number(rating),
        rating_unit: rating === '' ? null : unit,
        poles: poles === '' ? null : Number(poles),
        customer_wording: wording.trim() || null,
        tags: parseTags(tags),
        footprint_w_mm: mm(fpW),
        footprint_h_mm: mm(fpH),
        footprint_d_mm: mm(fpD),
        mounting_design: (design || null) as Assembly['mounting_design'],
        module_height_mm: whole(moduleH),
        positions_per_plate: whole(positions),
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
    parseTags(tags).join(',') !== (assembly.tags ?? []).join(',') ||
    mm(fpW) !== assembly.footprint_w_mm ||
    mm(fpH) !== assembly.footprint_h_mm ||
    mm(fpD) !== assembly.footprint_d_mm ||
    (design || null) !== assembly.mounting_design ||
    whole(moduleH) !== assembly.module_height_mm ||
    whole(positions) !== assembly.positions_per_plate

  if (!editable) {
    const g = choices.find((c) => c.id === assembly.kit_group_id)
    return (
      <p className="muted">
        Group: {g?.name ?? 'none'}. Rating:{' '}
        {assembly.rating != null ? `${assembly.rating} ${assembly.rating_unit ?? ''}` : 'not set'}
        {assembly.poles ? `, ${assembly.poles} pole` : ''}.
        {assembly.customer_wording ? ` Customer wording: “${assembly.customer_wording}”.` : ''}
        {assembly.tags.length > 0 ? ` Labels: ${assembly.tags.join(', ')}.` : ''}
        {assembly.footprint_w_mm != null && assembly.footprint_h_mm != null
          ? ` Footprint: ${assembly.footprint_w_mm} × ${assembly.footprint_h_mm} mm.`
          : ''}
        {assembly.mounting_design != null
          ? ` Mounting: ${DESIGNS[assembly.mounting_design]}${
              assembly.module_height_mm != null ? `, ${assembly.module_height_mm} mm module` : ''
            }.`
          : ''}
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
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="muted" style={{ flexBasis: '100%', fontSize: '.8125rem' }}>
            Footprint in millimetres <span style={{ fontWeight: 400 }}>— only when this kit takes
            more room than its main device and clearances, e.g. accessories mounted beside it.
            Leave blank otherwise; the space check works it out from the device.</span>
          </div>
          {([['Width', fpW, setFpW], ['Height', fpH, setFpH], ['Depth', fpD, setFpD]] as const).map(
            ([label, value, setter]) => (
              <label key={label} style={{ flex: 1, minWidth: '7rem' }}>
                <div className="muted">{label}</div>
                <input
                  type="number" step="0.1" min="0" inputMode="decimal"
                  value={value}
                  onChange={(e) => { setSaved(false); setter(e.target.value) }}
                />
              </label>
            ),
          )}
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="muted" style={{ flexBasis: '100%', fontSize: '.8125rem' }}>
            Mounting, for the panel layout <span style={{ fontWeight: 400 }}>— which design this kit
            is built into, the height it takes on the stack (50 mm steps, the S4 cover heights), and
            how many fit across one plate where that is not simply the plate width divided by the
            device. Blank is fine; the layout will say a kit is unsized rather than guess.</span>
          </div>
          <label style={{ flex: 2, minWidth: '13rem' }}>
            <div className="muted">Mounting design</div>
            <select value={design} onChange={(e) => { setSaved(false); setDesign(e.target.value) }}>
              <option value="">— not decided —</option>
              {Object.entries(DESIGNS).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1, minWidth: '8rem' }}>
            <div className="muted">Module height (mm)</div>
            <input
              type="number" step="50" min="0" inputMode="numeric"
              value={moduleH}
              onChange={(e) => { setSaved(false); setModuleH(e.target.value) }}
            />
          </label>
          <label style={{ flex: 1, minWidth: '8rem' }}>
            <div className="muted">Positions per plate</div>
            <input
              type="number" step="1" min="0" inputMode="numeric"
              value={positions}
              onChange={(e) => { setSaved(false); setPositions(e.target.value) }}
            />
          </label>
        </div>
        <p className="muted" style={{ fontSize: '.8125rem' }}>
          Version {assembly.version}, {assembly.status}. A costing keeps the version it was built
          from, so changing this kit never changes a costing already made.
        </p>
      </div>
    </div>
  )
}

/** The six mounting designs of panel-layout-spec.md §3, in the words of the spec. */
const DESIGNS: Record<string, string> = {
  busbar_fed: 'Busbar-fed — ACB, ATS pair, changeover, isolator',
  mccb_plates: 'MCCB plates — one device per cover, stacked',
  side_by_side_plates: 'Side-by-side plates — MCBs, meters, contactors, terminals',
  compensation: 'Compensation — APFC steps',
  meter_board_plate: 'Meter board plate — wall-mounted board',
  inline_3nj6: 'In-line 3NJ6 — plug-in fuse-switch disconnectors',
}
