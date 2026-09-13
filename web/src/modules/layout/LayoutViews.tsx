import type { LayoutDoorDevice, LayoutFit, LayoutSection } from '../../lib/database.types'
import { LayoutCanvas } from './LayoutCanvas'
import { LayoutDoor } from './LayoutDoor'
import { LayoutIso } from './LayoutIso'
import { LayoutPlan } from './LayoutPlan'
import { LayoutRear } from './LayoutRear'
import type { Layer } from './layout-views'
import type { View } from './LayoutTabs'

/**
 * Which of the five views is on screen (roadmap 3.8, stage two). Nothing but a
 * switch, kept out of the pop-up so that adding the sixth — the GA sketch — is one
 * line here rather than another branch in a screen that already does enough.
 */
export function LayoutViews({
  view,
  sections,
  fit,
  heightMm,
  depthMm,
  selected,
  doorParts,
  layers,
  from,
  onDropKit,
  onRemove,
  onSelect,
}: {
  view: View
  sections: LayoutSection[]
  fit: LayoutFit | null
  heightMm: number
  depthMm: number
  selected: string | null
  doorParts: LayoutDoorDevice[]
  layers: Layer[]
  from: 'left' | 'right'
  onDropKit: (sectionName: string, side: 'front' | 'rear') => void
  onRemove: (sectionName: string, index: number, side: 'front' | 'rear') => void
  onSelect: (sectionName: string) => void
}) {
  const chosen = sections.find((s) => s.name === selected) ?? sections[0] ?? null

  if (view === 'Rear') {
    return (
      <LayoutRear
        sections={sections}
        fit={fit}
        heightMm={heightMm}
        showCables={layers.includes('Cables')}
        onDropKit={(name) => onDropKit(name, 'rear')}
        onRemove={(name, index) => onRemove(name, index, 'rear')}
      />
    )
  }
  if (view === 'Plan') {
    return <LayoutPlan section={chosen} fit={fit} />
  }
  if (view === 'Door') {
    return <LayoutDoor sections={sections} devices={doorParts} heightMm={heightMm} />
  }
  if (view === '3D') {
    return (
      <LayoutIso
        sections={sections}
        heightMm={heightMm}
        depthMm={depthMm}
        from={from}
        openDoors={!layers.includes('Doors')}
      />
    )
  }
  return (
    <LayoutCanvas
      sections={sections}
      fit={fit}
      heightMm={heightMm}
      selected={selected}
      onSelect={onSelect}
      onDropKit={(name) => onDropKit(name, 'front')}
      onRemove={(name, index) => onRemove(name, index, 'front')}
    />
  )
}
