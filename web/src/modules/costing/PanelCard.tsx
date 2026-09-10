import { useState } from 'react'
import { money } from '../../lib/format'
import type {
  AssemblyTotals,
  ComponentCategory,
  ComponentPrice,
  CostingAssembly,
  CostingItem,
  CostingLabour,
  CostingPanel,
  Kit,
  PanelPrice,
} from '../../lib/database.types'
import { PanelLines } from './PanelLines'
import { KitPicker } from './KitPicker'
import { kvarTotal } from './kvar'
import { AddFreeLine } from './AddFreeLine'
import { Detail } from './PanelDetails'
import { describePanel } from './technical'
import type { ManualItemInput } from './api'

interface Handlers {
  onPanelChange: (id: string, changes: Partial<CostingPanel>) => void
  onPanelRemove: (id: string) => void
  onAddAssembly: (panelId: string, assemblyId: string, quantity: number, section: string | null) => Promise<void>
  onAddComponent: (panelId: string, componentId: string, quantity: number, section: string | null) => Promise<void>
  onAddManual: (panelId: string, input: ManualItemInput, section: string | null) => Promise<void>
  onAssemblyQuantity: (id: string, quantity: number) => void
  onAssemblyRemove: (id: string) => void
  onAssemblySection: (id: string, section: string | null) => void
  onItemQuantity: (id: string, quantity: number) => void
  onItemRemove: (id: string) => void
  onHours: (id: string, hours: number) => void
}

/** One panel: its details, its price, the kits it is made of and its loose lines. */
export function PanelCard({
  panel,
  price,
  assemblies,
  items,
  labour,
  assemblyTotals,
  kits,
  components,
  categories,
  sections,
  label,
  editable,
  processNames,
  handlers,
}: {
  panel: CostingPanel
  price: PanelPrice | undefined
  assemblies: CostingAssembly[]
  items: CostingItem[]
  labour: CostingLabour[]
  assemblyTotals: AssemblyTotals[]
  kits: Kit[]
  components: ComponentPrice[]
  categories: ComponentCategory[]
  /** The section names on offer; a section typed here is kept as it is. */
  sections: string[]
  label: string
  editable: boolean
  processNames: Record<string, string>
  handlers: Handlers
}) {
  const [showDetails, setShowDetails] = useState(false)
  const [section, setSection] = useState('')
  const kvar = kvarTotal(assemblies, kits)
  const listId = `panel-sections-${panel.id}`

  const field = (key: keyof CostingPanel, value: string | number | null) =>
    handlers.onPanelChange(panel.id, { [key]: value })

  return (
    <div className="card">
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="row">
            {editable ? (
              <input
                defaultValue={panel.name}
                style={{ fontWeight: 650, fontSize: '1.05rem', flex: 2, minWidth: '12rem' }}
                onBlur={(e) => e.target.value.trim() && e.target.value !== panel.name && field('name', e.target.value.trim())}
              />
            ) : (
              <h2 style={{ margin: 0 }}>{panel.name}</h2>
            )}
            <label className="row" style={{ gap: '.3rem' }}>
              <span className="muted">Qty</span>
              {editable ? (
                <input
                  type="number"
                  step="1"
                  min="1"
                  defaultValue={panel.quantity}
                  style={{ width: '4.5rem' }}
                  onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== panel.quantity && field('quantity', Number(e.target.value))}
                />
              ) : (
                <strong>{panel.quantity}</strong>
              )}
              <span className="muted">{panel.uom}</span>
            </label>
          </div>
          <button
            onClick={() => setShowDetails((s) => !s)}
            style={{ marginTop: '.4rem', fontSize: '.8125rem' }}
          >
            {showDetails ? 'Hide details' : 'Details: tag, option, description'}
          </button>
        </div>

        <div style={{ textAlign: 'right', minWidth: '11rem' }}>
          <div className="muted" style={{ fontSize: '.8125rem' }}>Price each</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 650 }}>
            {money(price?.unit_price ?? 0, label)}
          </div>
          <div className="muted" style={{ fontSize: '.8125rem' }}>
            × {panel.quantity} = {money(price?.line_total ?? 0, label)}
          </div>
          {editable && (
            <button className="danger" style={{ marginTop: '.5rem' }} onClick={() => handlers.onPanelRemove(panel.id)}>
              Remove panel
            </button>
          )}
        </div>
      </div>

      {showDetails && (
        <div style={{ marginTop: '.75rem', display: 'grid', gap: '.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))' }}>
          <Detail label="Tag" value={panel.tag} editable={editable} onCommit={(v) => field('tag', v)} />
          <Detail label="Option" hint="e.g. Option 1" value={panel.option_label} editable={editable} onCommit={(v) => field('option_label', v)} />
          <Detail label="Unit" value={panel.uom} editable={editable} onCommit={(v) => field('uom', v || 'PC')} />
          <Detail label="Enclosure" hint="e.g. 2100(H)×800(W)×800(D)" value={panel.enclosure_dimensions} editable={editable} onCommit={(v) => field('enclosure_dimensions', v)} />
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="spread">
              <span className="muted" style={{ fontSize: '.8125rem' }}>Technical description (printed on the quotation; left blank, it is written from the kits at release)</span>
              {editable && assemblies.length > 0 && (
                <button
                  style={{ fontSize: '.8125rem' }}
                  onClick={() => {
                    const draft = describePanel({ panel, assemblies, items, kits })
                    if (!panel.technical_description || window.confirm('Replace the current text with a draft written from the kits and lines?')) {
                      field('technical_description', draft || null)
                    }
                  }}
                >
                  Draft from the kits
                </button>
              )}
            </div>
            {editable ? (
              <textarea
                key={panel.technical_description ?? ''}
                defaultValue={panel.technical_description ?? ''}
                style={{ minHeight: '7rem' }}
                onBlur={(e) => e.target.value !== (panel.technical_description ?? '') && field('technical_description', e.target.value || null)}
              />
            ) : (
              <p style={{ whiteSpace: 'pre-wrap' }}>{panel.technical_description || <span className="muted">None</span>}</p>
            )}
          </div>
        </div>
      )}

      <PanelLines
        assemblies={assemblies}
        items={items}
        labour={labour}
        assemblyTotals={assemblyTotals}
        sections={sections}
        price={price}
        kvar={kvar}
        label={label}
        editable={editable}
        processNames={processNames}
        handlers={handlers}
      />

      {editable && (
        <>
          <div className="row" style={{ marginTop: '.75rem', gap: '.4rem' }}>
            <span className="muted" style={{ fontSize: '.8125rem' }}>Add to section</span>
            <input
              list={listId}
              value={section}
              placeholder="none"
              aria-label="Section to add to"
              style={{ width: '11rem' }}
              onChange={(e) => setSection(e.target.value)}
            />
            <datalist id={listId}>
              {sections.map((s) => <option key={s} value={s} />)}
            </datalist>
            <span className="muted" style={{ fontSize: '.75rem' }}>
              — choose one or type your own; everything added below goes there.
            </span>
          </div>
          <KitPicker kits={kits} onAdd={(id, qty) => handlers.onAddAssembly(panel.id, id, qty, clean(section))} />
          <AddFreeLine
            components={components}
            categories={categories}
            label={label}
            onAddComponent={(cid, qty) => handlers.onAddComponent(panel.id, cid, qty, clean(section))}
            onAddManual={(input) => handlers.onAddManual(panel.id, input, clean(section))}
          />
        </>
      )}
    </div>
  )
}

/** Blank or spaces mean no section, which is what the database stores. */
function clean(section: string): string | null {
  return section.trim() === '' ? null : section.trim()
}
