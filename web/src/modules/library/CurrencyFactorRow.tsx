import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { money } from '../../lib/format'
import type { EffectiveCurrencyFactor } from '../../lib/database.types'
import { addMasterCurrency, clearCurrencyFactor, setCurrencyFactor, updateMasterCurrencyFactor } from './rates-api'

/**
 * One currency: exchange rate and landed factor, the company's own or the
 * master default, edited in place. A company admin writes an override; the
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
  const [rate, setRate] = useState(String(row.exchange_rate))
  const [factor, setFactor] = useState(String(row.landed_factor))
  const [editMaster, setEditMaster] = useState(isMasterAdmin)

  const save = useMutation({
    mutationFn: async () => {
      const r = Number(rate)
      const f = Number(factor)
      if (!(r > 0) || !(f > 0)) throw new Error('Both figures must be greater than zero')
      if (editMaster && isMasterAdmin) return updateMasterCurrencyFactor(row.master_id, r, f)
      return setCurrencyFactor(companyId, row.currency_code, r, f)
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

  const input = (value: string, set: (v: string) => void, step: string) => (
    <input
      type="number"
      step={step}
      min="0"
      style={{ maxWidth: '8rem', textAlign: 'right' }}
      value={value}
      onChange={(e) => set(e.target.value)}
    />
  )

  return (
    <tr>
      <td>{row.currency_code}</td>
      <td className="right">{editing ? input(rate, setRate, '0.000001') : row.exchange_rate}</td>
      <td className="right">{editing ? input(factor, setFactor, '0.00000001') : row.landed_factor}</td>
      <td className="right">{money(row.exchange_rate * row.landed_factor, 'KES')}</td>
      <td className="muted">
        {row.source === 'company'
          ? `Yours (master ${row.master_exchange_rate} × ${row.master_landed_factor})`
          : 'Master default'}
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
                setRate(String(row.exchange_rate))
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

/** Master admin only: a currency the library may buy in, with its first figures. */
export function NewCurrencyRow({ onSaved }: { onSaved: () => void }) {
  const [code, setCode] = useState('')
  const [rate, setRate] = useState('')
  const [factor, setFactor] = useState('1')

  const add = useMutation({
    mutationFn: async () => {
      const c = code.trim().toUpperCase()
      if (!/^[A-Z]{3}$/.test(c)) throw new Error('A currency is three letters, e.g. USD')
      if (!(Number(rate) > 0) || !(Number(factor) > 0)) throw new Error('Both figures must be greater than zero')
      return addMasterCurrency(c, Number(rate), Number(factor))
    },
    onSuccess: () => {
      setCode('')
      setRate('')
      setFactor('1')
      onSaved()
    },
  })

  return (
    <tr>
      <td>
        <input value={code} maxLength={3} placeholder="USD" style={{ width: '4.5rem' }} onChange={(e) => setCode(e.target.value)} />
      </td>
      <td className="right">
        <input type="number" step="0.000001" min="0" value={rate} placeholder="KES per 1" style={{ maxWidth: '8rem', textAlign: 'right' }} onChange={(e) => setRate(e.target.value)} />
      </td>
      <td className="right">
        <input type="number" step="0.00000001" min="0" value={factor} style={{ maxWidth: '8rem', textAlign: 'right' }} onChange={(e) => setFactor(e.target.value)} />
      </td>
      <td></td>
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
