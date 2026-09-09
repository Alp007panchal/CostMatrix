import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { money } from '../../lib/format'
import { setMaterialRate, updateMasterMaterialRate } from './rates-api'

/**
 * One material rate: the company's own figure (in its currency) or the master
 * default (copper: 15 EUR per kg, landing at 3,000 KES), edited in place.
 */
export function MaterialRateRow(props: {
  code: string
  name: string
  unit: string
  rate: number
  source: string
  masterRateKes: number
  kesPerKg: number
  rateEntered: number
  rateCurrency: string
  masterRate: number
  masterCurrency: string
  companyId: string
  currencyCode: string
  currencyLabel: string
  isMasterAdmin: boolean
  masterRateId: string | undefined
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(props.rate))
  const [editMaster, setEditMaster] = useState(false)
  // A master figure is in the master's currency (EUR for copper); an own figure is in ours.
  const typedCurrency = editMaster && props.masterRateId ? props.masterCurrency : props.currencyCode

  const save = useMutation({
    mutationFn: async () => {
      if (editMaster && props.masterRateId) {
        return updateMasterMaterialRate(props.masterRateId, Number(value))
      }
      return setMaterialRate(props.companyId, props.code, props.name, Number(value), props.currencyCode)
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
          <span className="row end" style={{ gap: '.3rem' }}>
            <input
              type="number"
              step="0.0001"
              min="0"
              style={{ maxWidth: '8rem', textAlign: 'right' }}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <span className="muted">{typedCurrency}</span>
          </span>
        ) : (
          money(props.rate, props.currencyLabel)
        )}
      </td>
      <td className="right muted">{money(props.kesPerKg, 'KES')}/{props.unit}</td>
      <td className="muted">
        {props.source === 'company'
          ? `Yours (${props.rateEntered} ${props.rateCurrency})`
          : `Master default, ${props.masterRate} ${props.masterCurrency}/${props.unit}`}
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
