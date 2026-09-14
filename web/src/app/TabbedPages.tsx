import { useQuery } from '@tanstack/react-query'
import { listAllKitGroupHours, listKitGroups } from '../modules/library/kits-api'
import { FirstTab, TabbedLayout } from './TabbedLayout'
import { LIBRARY_SETUP_TABS, SETTINGS_TABS } from './nav'
import { useSession } from '../modules/auth/session'
import { roleLabel } from '../lib/format'

/**
 * The two vertical-tab pages (house style §3).
 *
 * Both are **layout routes**: `/admin/company` and the rest did not move, they
 * simply draw inside a tab column now. Nothing that was ever bookmarked breaks,
 * and no screen had to change a line to join.
 */

export function SettingsLayout() {
  const { company, roles, isMasterAdmin } = useSession()
  const who = isMasterAdmin ? 'master administrator' : roles.map(roleLabel).join(' · ')
  const meta = [company?.name, who].filter((s): s is string => s !== undefined && s !== '').join(' · ')
  return (
    <TabbedLayout
      title="Settings"
      meta={meta}
      intro="Everything an administrator sets once. Each tab is one topic; changes apply to your company only unless you are the master administrator."
      tabs={SETTINGS_TABS}
    />
  )
}

export function SettingsFirstTab() {
  return <FirstTab tabs={SETTINGS_TABS} fallback="/admin/company" />
}

export function LibrarySetupLayout() {
  const empty = useEmptyKitGroups()
  return (
    <TabbedLayout
      title="Library set-up"
      meta="rates, labour hours and imports"
      intro="The numbers every costing is built from. Set these before costing: a rate or an hour that is missing here stops a costing later."
      tabs={LIBRARY_SETUP_TABS}
      counts={{ '/library/kit-groups': empty }}
    />
  )
}

export function LibrarySetupFirstTab() {
  return <FirstTab tabs={LIBRARY_SETUP_TABS} fallback="/library/rates" />
}

/**
 * "17 empty" beside Kit groups & labour hours — the owner's own outstanding job,
 * said where he would go to do it. Same two query keys the page itself uses, so
 * this adds no request of its own (§4 rule 7).
 */
function useEmptyKitGroups(): { text: string; bad?: boolean } | undefined {
  const groups = useQuery({ queryKey: ['kit-groups'], queryFn: listKitGroups })
  const hours = useQuery({ queryKey: ['kit-group-hours'], queryFn: listAllKitGroupHours })
  if (groups.data === undefined || hours.data === undefined) return undefined
  const withHours = new Set(hours.data.filter((h) => h.hours > 0).map((h) => h.kit_group_id))
  const empty = groups.data.filter((g) => !withHours.has(g.id)).length
  if (empty === 0) return undefined
  return { text: `${empty} empty`, bad: true }
}
