import type { CableAlley } from '../../lib/database.types'
import { LAYERS, type Layer } from './layout-views'

export const VIEWS = ['Front', 'Rear', 'Plan', 'Door', '3D'] as const
export type View = (typeof VIEWS)[number]

/**
 * The bar above the drawing (roadmap 3.8, stage two): which view, which layers are
 * drawn, and the two choices that change what the rules produce — one face or two,
 * and where the cables run.
 *
 * The layer chips only hide and show; the two pickers re-arrange the board, so they
 * sit apart from them and say so.
 */
export function LayoutTabs({
  view,
  onView,
  layers,
  onLayer,
  access,
  onAccess,
  cableAlley,
  onCableAlley,
  allowsDoubleFront,
  from,
  onFrom,
  editable,
}: {
  view: View
  onView: (view: View) => void
  layers: Layer[]
  onLayer: (layer: Layer) => void
  access: 'single_front' | 'double_front'
  onAccess: (access: 'single_front' | 'double_front') => void
  cableAlley: CableAlley
  onCableAlley: (alley: CableAlley) => void
  allowsDoubleFront: boolean
  from: 'left' | 'right'
  onFrom: (from: 'left' | 'right') => void
  editable: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', margin: '.4rem 0' }}>
      <div className="row" style={{ gap: '.35rem', fontSize: '.75rem', flexWrap: 'wrap' }}>
        {VIEWS.map((name) => (
          <button
            key={name}
            className={name === view ? 'primary-chip' : ''}
            aria-current={name === view ? 'page' : undefined}
            style={{ fontSize: '.75rem', padding: '.15rem .55rem' }}
            onClick={() => onView(name)}
          >
            {name}
          </button>
        ))}

        {view === '3D' && (
          <button
            style={{ fontSize: '.75rem', padding: '.15rem .55rem', marginLeft: '.5rem' }}
            onClick={() => onFrom(from === 'left' ? 'right' : 'left')}
          >
            Seen from the {from}
          </button>
        )}
      </div>

      <div className="row" style={{ gap: '.35rem', fontSize: '.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="muted">Layers</span>
        {LAYERS.map((layer) => (
          <button
            key={layer}
            className={layers.includes(layer) ? 'primary-chip' : ''}
            style={{ fontSize: '.7rem', padding: '.1rem .45rem' }}
            aria-pressed={layers.includes(layer)}
            onClick={() => onLayer(layer)}
          >
            {layer}
          </button>
        ))}

        <span className="muted" style={{ marginLeft: 'auto' }}>Re-arranges the board:</span>
        <select
          aria-label="Cables"
          value={cableAlley}
          disabled={!editable}
          style={{ fontSize: '.7rem' }}
          onChange={(e) => onCableAlley(e.target.value as CableAlley)}
        >
          <option value="beside">cables beside</option>
          <option value="behind">cables behind</option>
        </select>
        <select
          aria-label="Faces"
          value={access}
          disabled={!editable || !allowsDoubleFront}
          title={allowsDoubleFront ? undefined : 'this construction is single-front'}
          style={{ fontSize: '.7rem' }}
          onChange={(e) => onAccess(e.target.value as 'single_front' | 'double_front')}
        >
          <option value="single_front">one face</option>
          <option value="double_front">two faces</option>
        </select>
      </div>
    </div>
  )
}
