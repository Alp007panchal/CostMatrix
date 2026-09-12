import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Async } from '../../ui/Async'
import { addKitParameter, listKitParameters, removeKitParameter, updateKitParameter } from './kits-api'

/**
 * What a kit asks for before it can be costed (roadmap 3.3): busbar metres, the
 * number of steps, a feeder count. A line of the kit can then work its quantity
 * out from them instead of being typed 296 times.
 *
 * A kit with no parameters is every kit in the library today, and stays exactly
 * as it was: the card says so and offers to add the first one.
 */
export function KitParametersCard({ assemblyId, canEdit }: { assemblyId: string; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const parameters = useQuery({
    queryKey: ['kit-parameters', assemblyId],
    queryFn: () => listKitParameters(assemblyId),
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['kit-parameters', assemblyId] })
    void queryClient.invalidateQueries({ queryKey: ['assembly-components', assemblyId] })
  }

  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [fallback, setFallback] = useState('')
  const [low, setLow] = useState('')
  const [high, setHigh] = useState('')

  const add = useMutation({
    mutationFn: () =>
      addKitParameter({
        assembly_id: assemblyId,
        name: name.trim().replace(/\s+/g, '_').toLowerCase(),
        unit: unit.trim() || null,
        default_value: fallback.trim() || null,
        min_value: low.trim() === '' ? null : Number(low),
        max_value: high.trim() === '' ? null : Number(high),
        sort_order: (parameters.data ?? []).length,
      }),
    onSuccess: () => { setName(''); setUnit(''); setFallback(''); setLow(''); setHigh(''); refresh() },
  })
  const save = useMutation({
    mutationFn: (input: { id: string; changes: Parameters<typeof updateKitParameter>[1] }) =>
      updateKitParameter(input.id, input.changes),
    onSuccess: refresh,
  })
  const drop = useMutation({ mutationFn: (id: string) => removeKitParameter(id), onSuccess: refresh })

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>What this kit asks for</h2>
      <p className="muted" style={{ fontSize: '.8125rem', marginTop: 0 }}>
        Leave this empty and the kit behaves as it always has: every line at the quantity typed
        beside it. Add a parameter — <em>busbar_metres</em>, <em>steps</em> — and a line can work
        its quantity out from the answer instead, through the <strong>formula</strong> box in the
        material list below.
      </p>

      <div className="table-wrap">
        <Async query={parameters} empty="Nothing — this kit takes fixed quantities.">
          {(rows) => (
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Unit</th><th className="right">Default</th>
                  <th className="right">Least</th><th className="right">Most</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td><code>{p.name}</code></td>
                    <td className="muted">{p.unit ?? '—'}</td>
                    <td className="right">
                      {canEdit ? (
                        <input
                          defaultValue={p.default_value ?? ''}
                          aria-label={`Default for ${p.name}`}
                          style={{ width: '5rem', textAlign: 'right' }}
                          onBlur={(e) => e.target.value !== (p.default_value ?? '') &&
                            save.mutate({ id: p.id, changes: { default_value: e.target.value.trim() || null } })}
                        />
                      ) : (p.default_value ?? '—')}
                    </td>
                    <td className="right muted">{p.min_value ?? '—'}</td>
                    <td className="right muted">{p.max_value ?? '—'}</td>
                    <td className="right">
                      {canEdit && (
                        <button className="danger" onClick={() => drop.mutate(p.id)}>Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Async>
      </div>

      {canEdit && (
        <div className="row" style={{ flexWrap: 'wrap', marginTop: '.5rem' }}>
          <input placeholder="name, e.g. busbar_metres" value={name} style={{ flex: 2, minWidth: '11rem' }} onChange={(e) => setName(e.target.value)} />
          <input placeholder="unit" value={unit} style={{ width: '5rem' }} onChange={(e) => setUnit(e.target.value)} />
          <input placeholder="default" value={fallback} style={{ width: '6rem' }} onChange={(e) => setFallback(e.target.value)} />
          <input placeholder="least" value={low} style={{ width: '5rem' }} onChange={(e) => setLow(e.target.value)} />
          <input placeholder="most" value={high} style={{ width: '5rem' }} onChange={(e) => setHigh(e.target.value)} />
          <button className="primary" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>
            Add parameter
          </button>
        </div>
      )}
      {(add.error || save.error || drop.error) && (
        <p className="error">{String(add.error ?? save.error ?? drop.error)}</p>
      )}
    </div>
  )
}
