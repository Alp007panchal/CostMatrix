import { useState } from 'react'
import { useSession } from '../modules/auth/session'

/**
 * On lists the master admin can see across every company: a company column
 * and a filter. For everyone else the hook is inert — they see one company
 * and the column stays hidden.
 */
export function useCompanyFilter() {
  const { companies, companyName, isMasterAdmin } = useSession()
  const [companyId, setCompanyId] = useState('')
  const multi = isMasterAdmin && companies.length > 1
  const keep = (rowCompanyId: string | null | undefined) => !multi || !companyId || rowCompanyId === companyId
  return { multi, companyId, setCompanyId, keep, companyName, companies }
}

export function CompanyFilterSelect({ filter }: { filter: ReturnType<typeof useCompanyFilter> }) {
  if (!filter.multi) return null
  return (
    <select value={filter.companyId} style={{ width: 'auto' }} onChange={(e) => filter.setCompanyId(e.target.value)}>
      <option value="">All companies</option>
      {filter.companies.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )
}
