import { useEffect, useState } from 'react'
import type { LayoutFit, LayoutKit, LayoutPlan, LayoutSection } from '../../lib/database.types'
import { LayoutCanvas } from './LayoutCanvas'
import { LayoutKits } from './LayoutKits'
import { LayoutVerdict } from './LayoutVerdict'
import {
  applyLayoutEnclosure,
  arrangePanel,
  constructions as listConstructions,
  layoutFit,
  layoutKits,
  saveLayout,
  savedLayout,
} from './layout-api'
import { dropRefusal, placeKit, removePlacement } from './layout'

/**
 * The panel layout pop-up (roadmap 3.8), stage one: the front view.
 *
 * Three columns, as the spec draws them — the kits on this panel, the board at
 * true scale, and whether it fits. The rear, side, door and 3D views and the GA
 * sketch are stage two; their tabs are shown as what is coming rather than
 * hidden, because a person should see where they will be.
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
  const [choices, setChoices] = useState<{ code: string; name: string; height_mm: number | null }[]>([])
  const [dragging, setDragging] = useState<LayoutKit | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  useEffect(() => {
    layoutKits(panelId).then(setKits).catch((e: unknown) => setError(String(e)))
    listConstructions().then(setChoices).catch(() => setChoices([]))
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

  const height = choices.find((c) => c.code === construction)?.height_mm ?? 2000

  const arrange = () => {
    setBusy(true); setError(null); setSaid(null)
    arrangePanel(panelId, construction)
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

  const drop = (sectionName: string) => {
    const kit = dragging
    setDragging(null)
    if (kit === null) return
    const section = sections.find((s) => s.name === sectionName)
    if (section === undefined) return
    const refusal = dropRefusal(section, kit, fit)
    if (refusal !== null) { setError(refusal); return }
    setError(null)
    setSections(placeKit(sections, sectionName, kit))
  }

  return (
    <div className="modal" role="dialog" aria-label={`Panel layout, ${panelName}`}>
      <div className="modal-card" style={{ width: 'min(1500px, 96vw)' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <strong>Panel layout — {panelName}</strong>
            <div className="muted" style={{ fontSize: '.75rem' }}>
              Front view, drawn at 1 : 4 from the kit library.{' '}
              {plan?.assumed.note ?? 'The usable height of a device compartment is assumed until the S4 drawings are read.'}
            </div>
          </div>
          <div className="row">
            <select
              value={construction}
              aria-label="Construction"
              onChange={(e) => setConstruction(e.target.value)}
            >
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

        <div className="row" style={{ gap: '.4rem', margin: '.4rem 0', fontSize: '.75rem' }}>
          <span className="primary-chip" aria-current="page">Front</span>
          {['Rear', 'Side', 'Door', '3D'].map((tab) => (
            <span key={tab} className="muted" title="Stage two">{tab} — later</span>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '15rem 1fr 19rem', gap: '.75rem' }}>
          <LayoutKits
            kits={kits}
            sections={sections}
            onDragStart={setDragging}
            unsized={plan?.unsized ?? []}
          />
          <div style={{ border: '1px solid var(--line)', borderRadius: '6px', overflow: 'hidden' }}>
            <LayoutCanvas
              sections={sections}
              fit={fit}
              heightMm={height}
              onDropKit={drop}
              onRemove={(name, index) => setSections(removePlacement(sections, name, index))}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
          <LayoutVerdict
            fit={fit}
            plan={plan}
            editable={editable}
            busy={busy}
            onApply={apply}
          />
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
