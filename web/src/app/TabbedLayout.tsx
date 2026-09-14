import { Fragment } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { useFeatures } from '../modules/admin/use-features'
import { useSession } from '../modules/auth/session'
import { PageHeader } from './PageHeader'
import type { TabItem } from './nav'

/**
 * A long screen made of vertical tabs (house style §3 and §4 rule 4): Settings
 * and Library set-up.
 *
 * The tabs are **real routes**, not local state. That is what lets every link
 * and bookmark the app has ever had keep working: `/admin/company` did not move,
 * it simply now draws with a tab column beside it and "Settings" in the top bar.
 * `/settings` and `/library/setup` are redirects to the first tab a person can
 * actually see, which is not the same tab for everybody.
 */
export function TabbedLayout({
  title,
  meta,
  intro,
  tabs,
  counts,
}: {
  title: string
  meta: string
  intro: string
  tabs: TabItem[]
  /** A figure beside a tab, e.g. "17 empty" on the kit groups. */
  counts?: Record<string, { text: string; bad?: boolean } | undefined>
}) {
  const visible = useVisibleTabs(tabs)
  return (
    <>
      <PageHeader title={title} meta={meta} />
      <p className="intro">{intro}</p>
      <div className="vlayout">
        <div className="vtabs">
          {visible.map((tab, i) => (
            <Fragment key={tab.to}>
              {tab.group !== undefined && tab.group !== visible[i - 1]?.group && (
                <div className="vlabel">{tab.group}</div>
              )}
              <NavLink to={tab.to} className={({ isActive }) => (isActive ? 'vtab active' : 'vtab')}>
                {tab.label}
                {counts?.[tab.to] !== undefined && (
                  <span className={counts[tab.to]?.bad === true ? 'cnt bad' : 'cnt'}>{counts[tab.to]?.text}</span>
                )}
              </NavLink>
            </Fragment>
          ))}
        </div>
        <div className="vbody">
          <Outlet />
        </div>
      </div>
    </>
  )
}

/** The tabs this person can see: a feature switched off has no tab at all. */
export function useVisibleTabs(tabs: TabItem[]): TabItem[] {
  const { on } = useFeatures()
  const { isMasterAdmin } = useSession()
  return tabs.filter((t) => {
    if (t.master === true && !isMasterAdmin) return false
    if (t.feature !== undefined && !on(t.feature)) return false
    return true
  })
}

/** Where `/settings` and `/library/setup` land: the first tab that is there. */
export function FirstTab({ tabs, fallback }: { tabs: TabItem[]; fallback: string }) {
  const visible = useVisibleTabs(tabs)
  return <Navigate to={visible[0]?.to ?? fallback} replace />
}
