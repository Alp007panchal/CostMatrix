import { useQuery } from '@tanstack/react-query'
import type { CostingLabourGaps } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { labourWarning } from './labour-gaps'

/**
 * The missing-labour warning on a costing (migration 0123).
 *
 * It does not block anything and changes no price. A supply-only job with no
 * labour is legitimate, so this says what it sees and leaves the judgement to the
 * engineer — but it says it where the number is read, because a quotation with
 * the time left out is the most expensive mistake this app can make quietly.
 */
export function LabourWarning({ costingId }: { costingId: string }) {
  const gaps = useQuery({
    queryKey: ['labour-gaps', costingId],
    queryFn: async (): Promise<CostingLabourGaps | null> => {
      const { data, error } = await supabase
        .from('v_costing_labour_gaps')
        .select('costing_id, kit_lines, kit_lines_without_hours, groups_to_fill, processes_without_rate, labour_rows_without_rate, material_cost, labour_cost, labour_share_pct, verdict')
        .eq('costing_id', costingId)
        .limit(1)
      if (error) throw new Error(error.message)
      return ((data ?? [])[0] ?? null) as CostingLabourGaps | null
    },
  })

  const warning = labourWarning(gaps.data ?? null)
  if (warning === null) return null

  return (
    <div
      className="card"
      role="status"
      style={{
        borderLeft: `4px solid ${warning.tone === 'bad' ? 'var(--bad, #b3261e)' : 'var(--warn, #b45309)'}`,
      }}
    >
      <strong style={{ color: warning.tone === 'bad' ? 'var(--bad, #b3261e)' : 'var(--warn, #b45309)' }}>
        {warning.headline}
      </strong>
      <p style={{ margin: '.35rem 0', fontSize: '.8125rem' }}>{warning.detail}</p>
      <p className="muted" style={{ margin: 0, fontSize: '.8125rem' }}>{warning.fix}</p>
    </div>
  )
}
