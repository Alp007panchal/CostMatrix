import { useQuery } from '@tanstack/react-query'
import { useFeatures } from '../admin/use-features'
import { listFollowups } from '../crm/api'
import { listLibraryHealth } from '../library/library-health-api'
import { listMyDesk } from './desk-api'
import { attentionFrom, todayIso, type Attention, NOTHING } from './attention'

/**
 * The four numbers the sidebar, the home tiles and the exception bar share.
 *
 * Deliberately reuses the query keys the pages themselves use — `my-desk`,
 * `followups`, `library-health` — so the shell asks for nothing extra: react-query
 * hands the sidebar the same rows the page is already showing.
 */
export function useAttention(): Attention {
  const { on } = useFeatures()
  const desk = useQuery({ queryKey: ['my-desk'], queryFn: listMyDesk, enabled: on('my_desk') })
  const followups = useQuery({ queryKey: ['followups'], queryFn: listFollowups })
  const library = useQuery({
    queryKey: ['library-health'],
    queryFn: listLibraryHealth,
    enabled: on('library_health'),
  })
  if (desk.data === undefined && followups.data === undefined && library.data === undefined) return NOTHING
  return attentionFrom(desk.data ?? [], followups.data ?? [], library.data ?? [], todayIso())
}
