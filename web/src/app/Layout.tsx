import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '../modules/auth/session'
import { useFeatures } from '../modules/admin/use-features'
import { useAttention } from '../modules/dashboard/use-attention'
import { navCount } from '../modules/dashboard/attention'
import { roleLabel } from '../lib/format'
import { NAV_GROUPS, type NavItem } from './nav'
import { HeaderSlotContext } from './PageHeader'
import { ErrorBoundary } from './ErrorBoundary'

/**
 * The shell every signed-in screen sits in (house style §3).
 *
 * What changed and why: there were twenty-five links in one top bar, in no
 * order, and a 60 rem cap that made every table scroll sideways on a screen with
 * room to spare. Now a dark sidebar of six named groups, and the page gets the
 * width of the window.
 *
 * The top bar is the page's, not the shell's: the title, the mono meta line and
 * the buttons are portalled in by whichever screen is open (`PageHeader`). The
 * shell only says where they go, and falls back to the brand when a screen has
 * not said.
 */
export function Layout() {
  const { profile, company, roles, isMasterAdmin, hasRole, signOut } = useSession()
  const canAdminister = isMasterAdmin || hasRole('company_admin')
  const { pathname } = useLocation()
  // A feature that is switched off has no way in (the road to production). The
  // route still exists and explains itself; it just is not advertised.
  const { on } = useFeatures()
  const attention = useAttention()

  // Held in state rather than a ref: the children that portal into these mount
  // before this component's refs are assigned, so they need a render to react to.
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null)
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null)

  const visible = (item: NavItem): boolean => {
    if (item.master === true && !isMasterAdmin) return false
    if (item.admin === true && !canAdminister) return false
    if (item.feature !== undefined && !on(item.feature)) return false
    return true
  }

  const now = new Date()
  const when = `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · Nairobi`

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Sections">
        <div className="brand">
          <div className="mark">COSTMATRIX</div>
          <div className="sub">{company?.name ?? ''}</div>
        </div>

        {NAV_GROUPS.map((group) => {
          const items = group.items.filter(visible)
          if (items.length === 0) return null
          return (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {items.map((item) => {
                const count = item.count === undefined ? null : navCount(attention, item.count)
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                  >
                    <span className="dot" />
                    {item.label}
                    {count !== null && <span className={count.hot ? 'cnt hot' : 'cnt'}>{count.text}</span>}
                  </NavLink>
                )
              })}
            </div>
          )
        })}

        <div className="who">
          <b>{profile?.full_name}</b>
          {company?.name}
          <div className="r">
            {isMasterAdmin ? 'Master administrator' : roles.map(roleLabel).join(' · ') || 'No roles yet'}
          </div>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          {/* The slot comes first and the fallback after it, so CSS can hide the
              fallback the moment a screen portals its own title in. Reading the
              slot's children during render would be a lie half the time. */}
          <div className="titles">
            <div ref={setTitleSlot} />
            <h1 className="fallback">CostMatrix</h1>
          </div>
          <div className="right">
            <div className="row" ref={setActionSlot} />
            <span className="when">{when}</span>
            <button onClick={() => void signOut()}>Sign out</button>
          </div>
        </header>

        <main className="page">
          <HeaderSlotContext.Provider value={{ title: titleSlot, actions: actionSlot }}>
            {/* A crash on one screen shows a message here; the navigation stays usable. */}
            <ErrorBoundary key={pathname}>
              <Outlet />
            </ErrorBoundary>
          </HeaderSlotContext.Provider>
        </main>
      </div>
    </div>
  )
}
