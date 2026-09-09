import { supabase } from '../../lib/supabase'
import type { ImportReport } from '../../lib/database.types'
import { fail } from './api'

/**
 * The seed importer (migration 0010). The database does the matching,
 * validation and writing; with apply = false it returns the same report
 * without writing, which is what the preview shows.
 */

type Rows = Record<string, string>[]

async function call(fn: string, args: Record<string, unknown>, context: string): Promise<ImportReport> {
  const { data, error } = await supabase.rpc(fn, args)
  fail(context, error)
  return data as ImportReport
}

export function importComponents(rows: Rows, toCompany: string | null, apply: boolean, fileName: string) {
  return call('import_components', { rows, to_company: toCompany, apply, file_name: fileName }, 'Could not import the components')
}

export function importKits(rows: Rows, toCompany: string | null, apply: boolean, fileName: string) {
  return call('import_kits', { rows, to_company: toCompany, apply, file_name: fileName }, 'Could not import the kits')
}

export function importKitGroupHours(rows: Rows, toCompany: string | null, apply: boolean) {
  return call('import_kit_group_hours', { rows, to_company: toCompany, apply }, 'Could not import the hours')
}
