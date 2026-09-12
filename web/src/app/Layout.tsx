import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '../modules/auth/session'
import { useFeatures } from '../modules/admin/use-features'
import { ErrorBoundary } from './ErrorBoundary'

/** The shell every signed-in screen sits in: brand, navigation, who you are. */
export function Layout() {
  const { profile, company, isMasterAdmin, hasRole, signOut } = useSession()
  const canAdminister = isMasterAdmin || hasRole('company_admin')
  const { pathname } = useLocation()
  // A feature that is switched off has no way in (the road to production). The
  // route still exists and explains itself; it just is not advertised.
  const { on } = useFeatures()

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
          {on('sales_analytics') && <NavLink to="/sales">Sales</NavLink>}
          <NavLink to="/crm/customers">Customers</NavLink>
          <NavLink to="/library/components">Components</NavLink>
          <NavLink to="/library/assemblies">Kits</NavLink>
          {canAdminister && <NavLink to="/library/rates">Rates</NavLink>}
          {canAdminister && on('price_lists') && <NavLink to="/library/price-lists">Price lists</NavLink>}
          {canAdminister && <NavLink to="/library/import">Import</NavLink>}
          {canAdminister && <NavLink to="/admin/people">People</NavLink>}
          {canAdminister && <NavLink to="/admin/company">Company</NavLink>}
          {canAdminister && on('approval_rules') && <NavLink to="/admin/approval-rules">Approval rules</NavLink>}
          {canAdminister && on('compatibility_checks') && <NavLink to="/admin/compatibility-rules">Compatibility</NavLink>}
          {canAdminister && on('labour_actuals') && <NavLink to="/admin/labour-variance">Labour variance</NavLink>}
          {canAdminister && <NavLink to="/admin/quotation-defaults">Quotation wording</NavLink>}
          {canAdminister && on('assistant') && <NavLink to="/admin/assistant">Assistant</NavLink>}
          {canAdminister && <NavLink to="/admin/features">Features</NavLink>}
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
