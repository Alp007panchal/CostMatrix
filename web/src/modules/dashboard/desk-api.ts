import { supabase } from '../../lib/supabase'
import type { DeskItem } from '../../lib/database.types'

/** What is waiting on the person signed in (migration 0129). Reads only. */
export async function listMyDesk(): Promise<DeskItem[]> {
  const { data, error } = await supabase
    .from('v_my_desk')
    .select('*')
    .order('sort_order')
    .order('days', { ascending: false })
  if (error) throw new Error(`Could not read your desk: ${error.message}`)
  return (data ?? []) as DeskItem[]
}
