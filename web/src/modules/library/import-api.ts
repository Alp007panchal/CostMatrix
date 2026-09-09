import { supabase } from '../../lib/supabase'
import type { ImportReport } from '../../lib/database.types'
import { fail } from './api'

/**
 * The seed importer (migration 0010), reading the owner's files as they are.
 * The database does the matching, validation and writing; with apply = false
 * it returns the same report without writing, which is what the preview shows.
 */

type Rows = Record<string, string>[]

async function call(fn: string, args: Record<string, unknown>, context: string): Promise<ImportReport> {
  const { data, error } = await supabase.rpc(fn, args)
  fail(context, error)
  return data as ImportReport
}

/** components.csv with category-map.csv for the BOM category. */
export function importComponents(rows: Rows, categoryMap: Rows, toCompany: string | null, apply: boolean, fileName: string) {
  return call('import_components', { rows, category_map: categoryMap, to_company: toCompany, apply, file_name: fileName }, 'Could not import the components')
}

/** kits.csv with kit-labour-template.csv (labour group, main device, per-kit hours). */
export function importKits(rows: Rows, kitTemplate: Rows, toCompany: string | null, apply: boolean, fileName: string) {
  return call('import_kits', { rows, kit_template: kitTemplate, to_company: toCompany, apply, file_name: fileName }, 'Could not import the kits')
}

/** kit-group-labour-template.csv, one row per labour group with three hours columns. */
export function importKitGroupHours(rows: Rows, toCompany: string | null, apply: boolean) {
  return call('import_kit_group_hours', { rows, to_company: toCompany, apply }, 'Could not import the hours')
}
