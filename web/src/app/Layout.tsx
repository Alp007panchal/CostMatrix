import { NavLink, Outlet } from 'react-router-dom'
import { useSession } from '../modules/auth/session'

/** The shell every signed-in screen sits in: brand, navigation, who you are. */
export function Layout() {
  const { profile, company, isMasterAdmin, hasRole, signOut } = useSession()
  const canAdminister = isMasterAdmin || hasRole('company_admin')

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">CostMatrix</span>
        <nav>
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/library/components">Components</NavLink>
          {canAdminister && <NavLink to="/library/rates">Rates</NavLink>}
          {canAdminister && <NavLink to="/admin/people">People</NavLink>}
          {canAdminister && <NavLink to="/admin/company">Company</NavLink>}
          {isMasterAdmin && <NavLink to="/admin/companies">Companies</NavLink>}
        </nav>
        <div className="who">
          <div>{profile?.full_name}</div>
          <div>{company?.name}</div>
        </div>
        <button onClick={() => void signOut()}>Sign out</button>
      </header>

      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}
