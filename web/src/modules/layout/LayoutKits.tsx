import type { LayoutKit, LayoutSection } from '../../lib/database.types'
import { designWords, placedCounts } from './layout'

/**
 * The kits on this panel, grouped by the mounting design they are built into,
 * each saying how many of it are placed. A kit the library has not described is
 * shown too, in amber: it cannot be dragged anywhere, and the reason is written
 * beside it rather than left for somebody to guess.
 */
export function LayoutKits({
  kits,
  sections,
  onDragStart,
  unsized,
}: {
  kits: LayoutKit[]
  sections: LayoutSection[]
  onDragStart: (kit: LayoutKit) => void
  unsized: { name: string; why: string }[]
}) {
  const placed = placedCounts(sections)
  const groups = new Map<string, LayoutKit[]>()
  for (const kit of kits) {
    const key = kit.mounting_design ?? 'none'
    groups.set(key, [...(groups.get(key) ?? []), kit])
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: '6px', padding: '.5rem', overflowY: 'auto', maxHeight: '62vh' }}>
      <strong style={{ fontSize: '.75rem' }}>Kits on this panel</strong>
      <p className="muted" style={{ fontSize: '.7rem', margin: '.15rem 0 .4rem' }}>
        Drag onto a section. The module height comes from the kit library.
      </p>
      {kits.length === 0 && <p className="muted" style={{ fontSize: '.75rem' }}>No kits on this panel yet.</p>}

      {[...groups.entries()].map(([design, inGroup]) => (
        <div key={design} style={{ marginBottom: '.5rem' }}>
          <div className="muted" style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {design === 'none' ? 'Not described yet' : designWords(design)}
          </div>
          {inGroup.map((kit) => {
            const done = placed[kit.costing_assembly_id] ?? 0
            const canDrag = kit.is_sized
            return (
              <div
                key={kit.costing_assembly_id}
                draggable={canDrag}
                onDragStart={() => onDragStart(kit)}
                title={canDrag ? 'Drag onto a section' : 'This kit cannot be placed until the library describes it'}
                style={{
                  border: `1px solid ${canDrag ? 'var(--line)' : '#f59e0b'}`,
                  background: canDrag ? undefined : '#fffbeb',
                  borderRadius: '5px', padding: '.3rem .4rem', marginTop: '.25rem',
                  fontSize: '.75rem', cursor: canDrag ? 'grab' : 'not-allowed',
                }}
              >
                <div>{kit.name}</div>
                <div className="muted" style={{ fontSize: '.7rem' }}>
                  {kit.module_height_mm !== null ? `${kit.module_height_mm} mm module · ` : ''}
                  {done} of {kit.quantity} placed
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {unsized.length > 0 && (
        <div style={{ marginTop: '.5rem', fontSize: '.7rem' }}>
          <strong>Cannot be placed</strong>
          <ul style={{ margin: '.2rem 0 0 .9rem', padding: 0 }}>
            {unsized.map((u) => <li key={u.name}>{u.name} — {u.why}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
