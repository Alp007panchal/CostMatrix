import { supabase } from '../../lib/supabase'
import type { LibraryHealthRow, LibraryIssue, LibraryIssueKind } from '../../lib/database.types'

/** What the library is missing (migration 0128). Reads only; there is no write. */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

export async function listLibraryHealth(): Promise<LibraryHealthRow[]> {
  const { data, error } = await supabase.from('v_library_health').select('*').order('sort_order')
  fail('Could not read the library', error)
  return (data ?? []) as LibraryHealthRow[]
}

/**
 * The rows behind one heading, fetched only when somebody opens it. A fault the
 * whole library shares runs to hundreds of rows, and nobody asked for them until
 * they did.
 */
export async function listLibraryIssues(kind: LibraryIssueKind, limit = 200): Promise<LibraryIssue[]> {
  const { data, error } = await supabase
    .from('v_library_issues')
    .select('*')
    .eq('kind', kind)
    .order('used_by_kits', { ascending: false })
    .order('code')
    .limit(limit)
  fail('Could not read the library', error)
  return (data ?? []) as LibraryIssue[]
}
