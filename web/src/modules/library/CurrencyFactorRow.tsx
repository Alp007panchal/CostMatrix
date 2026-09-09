import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { money } from '../../lib/format'
import type { EffectiveCurrencyFactor } from '../../lib/database.types'
import {
  addMasterCurrency,
  clearCurrencyFactor,
  setCurrencyFactor,
  updateMasterCurrencyFactor,
} from './rates-api'

/**
 * One currency: the landed factor — KES per 1 unit, with exchange rate,
 * freight, duty and handling in one number (decision 2) — the company's own or
 * the master default, edited in place. A company admin writes an override; the
 * master admin may tick "master" to change the default for everyone.
 */
export function CurrencyFactorRow({
  row,
  companyId,
  isMasterAdmin,
  onSaved,
}: {
  row: EffectiveCurrencyFactor
  companyId: string
  isMasterAdmin: boolean
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [factor, setFactor] = useState(String(row.landed_factor))
  const [editMaster, setEditMaster] = useState(isMasterAdmin)

  const save = useMutation({
    mutationFn: async () => {
      const f = Number(factor)
      if (!(f > 0)) throw new Error('The factor must be greater than zero')
      if (editMaster && isMasterAdmin) return updateMasterCurrencyFactor(row.master_id, f)
      return setCurrencyFactor(companyId, row.currency_code, f)
    },
    onSuccess: () => {
      setEditing(false)
      onSaved()
    },
  })
  const clear = useMutation({
    mutationFn: () => clearCurrencyFactor(row.own_id ?? ''),
    onSuccess: onSaved,
  })

  return (
    <tr>
      <td>{row.currency_code}</td>
      <td className="right">
        {editing ? (
          <input
            type="number"
            step="0.000001"
            min="0"
            style={{ maxWidth: '9rem', textAlign: 'right' }}
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
          />
        ) : (
          money(row.landed_factor, 'KES')
        )}
      </td>
      <td className="muted">
        {row.source === 'company' ? `Yours (master ${row.master_landed_factor})` : 'Master default'}
      </td>
      <td className="right">
        {editing ? (
          <span className="row end" style={{ gap: '.35rem' }}>
            {isMasterAdmin && (
              <label className="row" style={{ gap: '.3rem', fontSize: '.8125rem' }}>
                <input type="checkbox" checked={editMaster} onChange={(e) => setEditMaster(e.target.checked)} />
                master
              </label>
            )}
            <button className="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              Save
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </span>
        ) : (
          <>
            <button
              onClick={() => {
                setFactor(String(row.landed_factor))
                setEditing(true)
              }}
            >
              Change
            </button>
            {row.own_id && (
              <>
                {' '}
                <button disabled={clear.isPending} onClick={() => clear.mutate()}>
                  Use master
                </button>
              </>
            )}
          </>
        )}
        {(save.error || clear.error) && <div className="error">{String(save.error ?? clear.error)}</div>}
      </td>
    </tr>
  )
}

/** Master admin only: a currency the library may buy in, with its landed factor. */
export function NewCurrencyRow({ onSaved }: { onSaved: () => void }) {
  const [code, setCode] = useState('')
  const [factor, setFactor] = useState('')

  const add = useMutation({
    mutationFn: async () => {
      const c = code.trim().toUpperCase()
      if (!/^[A-Z]{3}$/.test(c)) throw new Error('A currency is three letters, e.g. USD')
      if (!(Number(factor) > 0)) throw new Error('The factor must be greater than zero')
      return addMasterCurrency(c, Number(factor))
    },
    onSuccess: () => {
      setCode('')
      setFactor('')
      onSaved()
    },
  })

  return (
    <tr>
      <td>
        <input value={code} maxLength={3} placeholder="USD" style={{ width: '4.5rem' }} onChange={(e) => setCode(e.target.value)} />
      </td>
      <td className="right">
        <input type="number" step="0.000001" min="0" value={factor} placeholder="KES per 1, landed" style={{ maxWidth: '9rem', textAlign: 'right' }} onChange={(e) => setFactor(e.target.value)} />
      </td>
      <td className="muted">New master currency</td>
      <td className="right">
        <button className="primary" disabled={add.isPending} onClick={() => add.mutate()}>
          Add
        </button>
        {add.error && <div className="error">{String(add.error)}</div>}
      </td>
    </tr>
  )
}
