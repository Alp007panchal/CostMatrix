import { supabase } from '../../lib/supabase'
import type { ImportJob, ImportRow } from '../../lib/database.types'
import { fail } from '../library/api'
import type { BomMapping, BomRow } from './bom-import-read'

/**
 * Somebody else's parts list, read into a review and then onto a panel
 * (migration 0107). The browser reads the file; the database does the matching
 * and the writing, so a costing engineer's own permissions decide what happens.
 */

export async function listBomJobs(costingId: string): Promise<ImportJob[]> {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('type', 'bom')
    .order('started_at', { ascending: false })
    .limit(20)
  fail('Could not load the parts lists', error)
  return ((data ?? []) as ImportJob[]).filter(
    (j) => (j.summary as { costing_id?: string }).costing_id === costingId,
  )
}

export async function startBomImport(input: {
  costingId: string
  fileName: string
  rows: BomRow[]
  mapping: BomMapping
  documentId: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('start_bom_import', {
    target_costing: input.costingId,
    file_name: input.fileName,
    rows: input.rows,
    mapping: input.mapping,
    document: input.documentId,
  })
  fail('Could not read the parts list', error)
  return data as string
}

export interface BomDecision {
  row_id: string
  kind: 'kit' | 'component' | 'placeholder' | 'skip'
  ref_id?: string
  qty?: number
  section?: string
  category?: string
}

export interface BomOutcome {
  costing_id: string
  panel_id: string | null
  lines: number
  placeholders: number
  skipped: number
  remaining: number
  status: string
}

export async function applyBomImport(
  jobId: string,
  panelName: string,
  lines: BomDecision[],
): Promise<BomOutcome> {
  const { data, error } = await supabase.rpc('apply_bom_import', {
    job: jobId,
    decisions: { panel_name: panelName, lines },
  })
  fail('Could not bring the parts in', error)
  return data as BomOutcome
}

export type { ImportRow }
