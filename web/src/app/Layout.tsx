import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '../modules/auth/session'
import { ErrorBoundary } from './ErrorBoundary'

/** The shell every signed-in screen sits in: brand, navigation, who you are. */
export function Layout() {
  const { profile, company, isMasterAdmin, hasRole, signOut } = useSession()
  const canAdminister = isMasterAdmin || hasRole('company_admin')
  const { pathname } = useLocation()

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">CostMatrix</span>
        <nav>
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/crm/enquiries">Enquiries</NavLink>
          <NavLink to="/costings">Costings</NavLink>
          <NavLink to="/quotations">Quotations</NavLink>
          <NavLink to="/crm/follow-ups">Follow-ups</NavLink>
          <NavLink to="/crm/customers">Customers</NavLink>
          <NavLink to="/library/components">Components</NavLink>
          <NavLink to="/library/assemblies">Kits</NavLink>
          {canAdminister && <NavLink to="/library/rates">Rates</NavLink>}
          {canAdminister && <NavLink to="/library/price-lists">Price lists</NavLink>}
          {canAdminister && <NavLink to="/library/import">Import</NavLink>}
          {canAdminister && <NavLink to="/admin/people">People</NavLink>}
          {canAdminister && <NavLink to="/admin/company">Company</NavLink>}
          {canAdminister && <NavLink to="/admin/approval-rules">Approval rules</NavLink>}
          {canAdminister && <NavLink to="/admin/labour-variance">Labour variance</NavLink>}
          {canAdminister && <NavLink to="/admin/quotation-defaults">Quotation wording</NavLink>}
          {canAdminister && <NavLink to="/admin/assistant">Assistant</NavLink>}
          {isMasterAdmin && <NavLink to="/admin/companies">Companies</NavLink>}
        </nav>
        <div className="who">
          <div>{profile?.full_name}</div>
          <div>{company?.name}</div>
        </div>
        <button onClick={() => void signOut()}>Sign out</button>
      </header>

      <main className="page">
        {/* A crash on one screen shows a message here; the navigation stays usable. */}
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
