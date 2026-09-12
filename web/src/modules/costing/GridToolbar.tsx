import type { CostingPanel } from '../../lib/database.types'

/**
 * The grid's own controls: what it is, the Excel export, adding and copying a
 * panel, and the one compare pair (roadmap 2.9 §3).
 */
export function GridToolbar({
  panels, editable, comparing, differingCount, compareA, compareB,
  onCompareA, onCompareB, onExcel, onAddPanel, onCopyPanel,
}: {
  panels: CostingPanel[]
  editable: boolean
  comparing: boolean
  differingCount: number
  compareA: string
  compareB: string
  onCompareA: (id: string) => void
  onCompareB: (id: string) => void
  onExcel: () => void
  onAddPanel: () => void
  onCopyPanel: (sourcePanelId: string) => void
}) {
  return (
    <>
      <div className="spread" style={{ alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Panels at a glance</h2>
          <p className="muted" style={{ fontSize: '.8125rem', margin: '.3rem 0 0', maxWidth: '46rem' }}>
            Every panel is a column; every kit and loose component any of them uses is a row. Type a
            quantity in a cell to change it — prices stay frozen and the change is recorded exactly as
            in the panel editor. A blank cell means the panel does not use that row.
          </p>
        </div>
        <div className="row end" style={{ flexWrap: 'wrap' }}>
          <button onClick={onExcel}>Excel</button>
          {editable && <button className="primary" onClick={onAddPanel}>Add panel</button>}
        </div>
      </div>

      {panels.length > 1 && (
        <div className="row" style={{ marginTop: '.75rem', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '.8125rem' }}>Compare</span>
          <select aria-label="Compare this panel" value={compareA} style={{ width: '11rem' }} onChange={(e) => onCompareA(e.target.value)}>
            <option value="">—</option>
            {panels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="muted" style={{ fontSize: '.8125rem' }}>with</span>
          <select aria-label="Compare with this panel" value={compareB} style={{ width: '11rem' }} onChange={(e) => onCompareB(e.target.value)}>
            <option value="">—</option>
            {panels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {comparing && (
            <span className="muted" style={{ fontSize: '.8125rem' }}>
              — {differingCount} {differingCount === 1 ? 'row differs' : 'rows differ'}, marked in amber
            </span>
          )}
          {editable && (
            <select
              aria-label="Copy a panel"
              value=""
              style={{ width: '12rem', marginLeft: 'auto' }}
              onChange={(e) => e.target.value && onCopyPanel(e.target.value)}
            >
              <option value="">Copy panel…</option>
              {panels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
      )}
    </>
  )
}
