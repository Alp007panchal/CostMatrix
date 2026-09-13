import { useEffect, useState } from 'react'
import type {
  CableAlley,
  LayoutDoorDevice,
  LayoutFit,
  LayoutKit,
  LayoutPlan,
  LayoutSection,
  LayoutWeight,
} from '../../lib/database.types'
import { LayoutKits } from './LayoutKits'
import { LayoutSettings } from './LayoutSettings'
import { LayoutTabs, type View } from './LayoutTabs'
import { LayoutVerdict } from './LayoutVerdict'
import { LayoutViews } from './LayoutViews'
import {
  applyLayoutEnclosure,
  arrangePanel,
  constructions as listConstructions,
  doorDevices,
  layoutFit,
  layoutKits,
  panelWeight,
  saveLayout,
  savedLayout,
} from './layout-api'
import { dropRefusal, placeKit, removePlacement } from './layout'
import { LAYERS, type Layer, isDoubleFront, patchSection, weightWords, wouldLose } from './layout-views'

type Construction = {
  code: string
  name: string
  height_mm: number | null
  allows_double_front: boolean
  depths_busbar_top_mm: number[]
  depths_busbar_rear_mm: number[]
  forms: string[]
}

/**
 * The panel layout pop-up (roadmap 3.8). Five views of one board: the front, the
 * back, the plan, the doors and an isometric picture.
 *
 * The rules all live in the database. This screen holds the sections a person is
 * editing, asks `layout_fit` again after every change, and draws the answer — so
 * what is on the screen is always what the costing would be told.
 */
export function LayoutDialog({
  panelId,
  panelName,
  editable,
  onClose,
  onApplied,
}: {
  panelId: string
  panelName: string
  editable: boolean
  onClose: () => void
  onApplied: () => Promise<void> | void
}) {
  const [kits, setKits] = useState<LayoutKit[]>([])
  const [sections, setSections] = useState<LayoutSection[]>([])
  const [plan, setPlan] = useState<LayoutPlan | null>(null)
  const [fit, setFit] = useState<LayoutFit | null>(null)
  const [construction, setConstruction] = useState('S4')
  const [choices, setChoices] = useState<Construction[]>([])
  const [dragging, setDragging] = useState<LayoutKit | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<View>('Front')
  const [layers, setLayers] = useState<Layer[]>([...LAYERS])
  const [access, setAccess] = useState<'single_front' | 'double_front'>('single_front')
  const [cableAlley, setCableAlley] = useState<CableAlley>('beside')
  const [from, setFrom] = useState<'left' | 'right'>('left')
  const [doorParts, setDoorParts] = useState<LayoutDoorDevice[]>([])
  const [weight, setWeight] = useState<LayoutWeight | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  useEffect(() => {
    layoutKits(panelId).then(setKits).catch((e: unknown) => setError(String(e)))
    listConstructions().then(setChoices).catch(() => setChoices([]))
    doorDevices(panelId).then(setDoorParts).catch(() => setDoorParts([]))
    panelWeight(panelId).then(setWeight).catch(() => setWeight(null))
    savedLayout(panelId)
      .then((saved) => {
        if (saved === null) return
        setSections(saved.sections)
        if (saved.construction_code !== null) setConstruction(saved.construction_code)
        setSaid(`Version ${saved.version}, as you left it.`)
      })
      .catch(() => undefined)
  }, [panelId])

  // The verdict follows the drawing: every edit asks the database again, so what
  // is on the screen is what the costing would be told.
  useEffect(() => {
    if (sections.length === 0) { setFit(null); return }
    layoutFit(sections, construction).then(setFit).catch(() => setFit(null))
  }, [sections, construction])

  const built = choices.find((c) => c.code === construction) ?? null
  const height = built?.height_mm ?? 2000
  const depth = plan?.depth_mm ?? sections[0]?.depth_mm ?? 800
  const depths = (access === 'double_front' ? built?.depths_busbar_rear_mm : built?.depths_busbar_top_mm) ?? []
  const chosen = sections.find((s) => s.name === selected) ?? null

  const arrange = () => {
    setBusy(true); setError(null); setSaid(null)
    arrangePanel(panelId, construction, access, cableAlley)
      .then((p) => {
        setPlan(p)
        setSections(p.sections)
        setSaid(`${p.sections.length} sections, arranged by the rules. Correct what is wrong.`)
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  const save = () => {
    setBusy(true); setError(null); setSaid(null)
    saveLayout(panelId, sections, construction, null)
      .then((r) => setSaid(`Saved as version ${r.version}. No price moved: a layout is a drawing.`))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  const apply = (replace: boolean) => {
    setBusy(true); setError(null); setSaid(null)
    saveLayout(panelId, sections, construction, null)
      .then(() => applyLayoutEnclosure(panelId, replace))
      .then(async (r) => {
        const missing = r.missing.length === 0 ? '' : ` ${r.missing.length} width(s) the catalogue cannot supply are listed below.`
        setSaid(`${r.kinds} kind(s) of cubicle put on the costing in an Enclosure section.${missing}`)
        await onApplied()
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  const drop = (sectionName: string, side: 'front' | 'rear') => {
    const kit = dragging
    setDragging(null)
    if (kit === null) return
    const section = sections.find((s) => s.name === sectionName)
    if (section === undefined) return
    if (side === 'rear' && !isDoubleFront(section)) {
      setError(`${sectionName} has one face. Turn two faces on for it first, under Section.`)
      return
    }
    const refusal = dropRefusal(section, kit, fit)
    if (refusal !== null) { setError(refusal); return }
    setError(null)
    setSections(placeKit(sections, sectionName, kit, side))
  }

  const change = (patch: Partial<LayoutSection>) => {
    if (chosen === null) return
    if (patch.access === 'single_front' && wouldLose(chosen) > 0) {
      setError(`${chosen.name} has ${wouldLose(chosen)} kit(s) on its back face. Take them off before you make it one face.`)
      return
    }
    setError(null)
    setSections(patchSection(sections, chosen.name, patch))
  }

  return (
    <div className="modal" role="dialog" aria-label={`Panel layout, ${panelName}`}>
      <div className="modal-card" style={{ width: 'min(1500px, 96vw)' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <strong>Panel layout — {panelName}</strong>
            <div className="muted" style={{ fontSize: '.75rem' }}>
              Drawn at 1 : 4 from the kit library.{' '}
              {plan?.assumed.note ?? 'The usable height of a device compartment is assumed until the S4 drawings are read.'}
            </div>
          </div>
          <div className="row">
            <select value={construction} aria-label="Construction" onChange={(e) => setConstruction(e.target.value)}>
              {choices.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              {choices.length === 0 && <option value="S4">SIVACON S4</option>}
            </select>
            <button disabled={busy || !editable} onClick={arrange}>Work the board out</button>
            <button disabled={busy || !editable || sections.length === 0} onClick={save}>
              {busy ? 'Working…' : 'Save layout'}
            </button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>

        <LayoutTabs
          view={view}
          onView={setView}
          layers={layers}
          onLayer={(layer) =>
            setLayers(layers.includes(layer) ? layers.filter((l) => l !== layer) : [...layers, layer])}
          access={access}
          onAccess={setAccess}
          cableAlley={cableAlley}
          onCableAlley={setCableAlley}
          allowsDoubleFront={built?.allows_double_front ?? false}
          from={from}
          onFrom={setFrom}
          editable={editable}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '15rem 1fr 19rem', gap: '.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            <LayoutKits kits={kits} sections={sections} onDragStart={setDragging} unsized={plan?.unsized ?? []} />
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '.4rem' }}>
              <div className="muted" style={{ fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Section
              </div>
              <LayoutSettings
                section={chosen}
                depths={depths}
                forms={built?.forms ?? []}
                allowsDoubleFront={built?.allows_double_front ?? false}
                editable={editable}
                onChange={change}
              />
            </div>
          </div>

          <div style={{ border: '1px solid var(--line)', borderRadius: '6px', overflow: 'hidden' }}>
            <LayoutViews
              view={view}
              sections={sections}
              fit={fit}
              heightMm={height}
              depthMm={depth}
              selected={selected}
              doorParts={doorParts}
              layers={layers}
              from={from}
              onDropKit={drop}
              onRemove={(name, index, side) => setSections(removePlacement(sections, name, index, side))}
              onSelect={setSelected}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            <LayoutVerdict fit={fit} plan={plan} editable={editable} busy={busy} onApply={apply} />
            <p className="muted" style={{ fontSize: '.7rem', margin: 0 }}>
              {sections.length > 0 && `${fit?.total_width_mm ?? 0} × ${height} (+100 base) × ${fit?.max_depth_mm ?? depth} mm · `}
              weight {weightWords(weight)}
            </p>
          </div>
        </div>

        {error !== null && <p className="error" style={{ fontSize: '.8125rem' }}>{error}</p>}
        {said !== null && <p className="ok" style={{ fontSize: '.8125rem' }}>{said}</p>}
        <p className="muted" style={{ fontSize: '.75rem' }}>
          Drag a kit onto a section to place it; double-click one on the drawing to take it off.
          Saving writes no costing line; only the button under <em>Does it fit?</em> does.
        </p>
      </div>
    </div>
  )
}
