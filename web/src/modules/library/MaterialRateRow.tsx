import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { money } from '../../lib/format'
import { setMaterialRate, updateMasterMaterialRate } from './rates-api'

/** One material rate: the company's own figure or the master default, edited in place. */
export function MaterialRateRow(props: {
  code: string
  name: string
  unit: string
  rate: number
  source: string
  masterRateKes: number
  companyId: string
  currencyLabel: string
  isMasterAdmin: boolean
  masterRateId: string | undefined
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(props.rate))
  const [editMaster, setEditMaster] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      if (editMaster && props.masterRateId) {
        return updateMasterMaterialRate(props.masterRateId, Number(value))
      }
      return setMaterialRate(props.companyId, props.code, props.name, Number(value))
    },
    onSuccess: () => {
      setEditing(false)
      props.onSaved()
    },
  })

  return (
    <tr>
      <td>
        {props.name}
        <div className="muted">per {props.unit}</div>
      </td>
      <td className="right">
        {editing ? (
          <input
            type="number"
            step="0.01"
            min="0"
            style={{ maxWidth: '9rem', textAlign: 'right' }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          money(props.rate, props.currencyLabel)
        )}
      </td>
      <td className="muted">
        {props.source === 'company' ? 'Yours' : `Master default, KES ${props.masterRateKes}`}
      </td>
      <td className="right">
        {editing ? (
          <span className="row end" style={{ gap: '.35rem' }}>
            {props.isMasterAdmin && props.masterRateId && (
              <label className="row" style={{ gap: '.3rem', fontSize: '.8125rem' }}>
                <input
                  type="checkbox"
                  checked={editMaster}
                  onChange={(e) => setEditMaster(e.target.checked)}
                />
                master
              </label>
            )}
            <button className="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              Save
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </span>
        ) : (
          <button
            onClick={() => {
              setValue(String(props.rate))
              setEditing(true)
            }}
          >
            Change
          </button>
        )}
        {save.error && <div className="error">{String(save.error)}</div>}
      </td>
    </tr>
  )
}
