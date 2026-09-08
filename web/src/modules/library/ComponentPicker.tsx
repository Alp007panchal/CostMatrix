import { useState } from 'react'
import { money } from '../../lib/format'
import type { ComponentPrice } from '../../lib/database.types'

/** Type-ahead search over the components an assembly may still add. */
export function ComponentPicker({
  candidates,
  label,
  onPick,
}: {
  candidates: ComponentPrice[]
  label: string
  onPick: (componentId: string, qty: number) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [qty, setQty] = useState('1')
  const [error, setError] = useState<string | null>(null)

  const needle = search.trim().toLowerCase()
  const matches = needle
    ? candidates
        .filter((c) =>
          [c.code, c.name, c.manufacturer, c.part_number]
            .filter(Boolean)
            .some((f) => String(f).toLowerCase().includes(needle)),
        )
        .slice(0, 8)
    : []

  return (
    <div style={{ marginTop: '1rem' }}>
      <div className="row">
        <input
          placeholder="Add a component: type to search"
          value={search}
          style={{ flex: 3, minWidth: '14rem' }}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          type="number"
          step="0.001"
          min="0.001"
          value={qty}
          aria-label="Quantity"
          style={{ width: '6rem' }}
          onChange={(e) => setQty(e.target.value)}
        />
      </div>
      {error && <p className="error">{error}</p>}
      {matches.length > 0 && (
        <div className="table-wrap" style={{ marginTop: '.5rem' }}>
          <table>
            <tbody>
              {matches.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.code} — {c.name}
                    <span className="muted"> {c.manufacturer}</span>
                  </td>
                  <td className="right">{money(c.unit_price, label)}</td>
                  <td className="right">
                    <button
                      className="primary"
                      onClick={() => {
                        setError(null)
                        onPick(c.id, Number(qty) || 1)
                          .then(() => setSearch(''))
                          .catch((e: unknown) => setError(String(e)))
                      }}
                    >
                      Add
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
