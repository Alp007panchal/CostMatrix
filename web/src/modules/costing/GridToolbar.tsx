import type { CostingPanel } from '../../lib/database.types'

/**
 * The grid's own controls: what it is, the Excel export, adding and copying a
 * panel, and which panels are being compared (roadmap 2.9 §3).
 *
 * It was two dropdowns, "compare A with B", which is the pair the roadmap asked
 * for and the wrong shape for the job: five sub-boards that ought to be
 * identical, where the question is not "do these two differ" but "which one is
 * the odd one out". So it is one button per panel — press the ones you want and
 * **the rest leave the table**, because the comparison is easier to read when
 * the columns are next to each other rather than four apart.
 *
 * Pressing nothing shows everything, which is what the grid did before and what
 * it does on arrival.
 */
export function GridToolbar({
  panels, editable, chosen, differingCount, onToggle, onShowAll, onExcel, onAddPanel, onCopyPanel,
}: {
  panels: CostingPanel[]
  editable: boolean
  /** The panel ids being compared; empty means every panel is shown. */
  chosen: string[]
  differingCount: number
  onToggle: (panelId: string) => void
  onShowAll: () => void
  onExcel: () => void
  onAddPanel: () => void
  onCopyPanel: (sourcePanelId: string) => void
}) {
  const comparing = chosen.length >= 2
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
          {/* The whole costing, not only what is shown: the file is a record of
              the costing, and a filtered one would be a surprise in an inbox. */}
          <button title="Every panel, whichever are shown here" onClick={onExcel}>Excel</button>
          {editable && <button className="primary" onClick={onAddPanel}>Add panel</button>}
        </div>
      </div>

      {panels.length > 1 && (
        <div className="grid-picker">
          <span className="lab">Show</span>
          <button
            type="button"
            className={chosen.length === 0 ? 'pick on' : 'pick'}
            aria-pressed={chosen.length === 0}
            onClick={onShowAll}
          >
            All {panels.length}
          </button>
          {panels.map((p) => (
            <button
              key={p.id}
              type="button"
              className={chosen.includes(p.id) ? 'pick on' : 'pick'}
              aria-pressed={chosen.includes(p.id)}
              onClick={() => onToggle(p.id)}
            >
              {p.name}
            </button>
          ))}

          <span className="note">
            {comparing
              ? `${chosen.length} side by side · ${differingCount} ${differingCount === 1 ? 'row differs' : 'rows differ'}, marked in amber`
              : chosen.length === 1
                ? 'one panel on its own — pick another to compare them'
                : 'pick two or more to compare them'}
          </span>

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
