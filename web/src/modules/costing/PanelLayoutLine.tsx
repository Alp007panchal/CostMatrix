import { useState } from 'react'
import type { CostingPanel } from '../../lib/database.types'
import { LayoutDialog } from '../layout/LayoutDialog'

/**
 * The way into the panel layout (roadmap 3.8): one button on the panel, and the
 * pop-up over it. Kept here so the panel card knows nothing about the drawing.
 */
export function PanelLayoutLine({
  panel,
  editable,
  onApplied,
}: {
  panel: CostingPanel
  editable: boolean
  onApplied: () => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button style={{ marginTop: '.5rem', fontSize: '.8125rem' }} onClick={() => setOpen(true)}>
        Lay this panel out
      </button>
      {open && (
        <LayoutDialog
          panelId={panel.id}
          panelName={panel.name}
          editable={editable}
          onClose={() => setOpen(false)}
          onApplied={onApplied}
        />
      )}
    </>
  )
}
