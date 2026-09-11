import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from '../modules/auth/session'
import { RequireAuth, RequireRole } from './guards'
import { Layout } from './Layout'
import { HomePage } from '../modules/dashboard/HomePage'
import { SetPasswordPage } from '../modules/auth/SetPasswordPage'

// Each area of the app is fetched the first time somebody opens it, so signing
// in does not download the costing editor for a person who only sets rates.
const PeoplePage = lazy(() => import('../modules/admin/PeoplePage').then((m) => ({ default: m.PeoplePage })))
const CompanyPage = lazy(() => import('../modules/admin/CompanyPage').then((m) => ({ default: m.CompanyPage })))
const CompaniesPage = lazy(() => import('../modules/admin/CompaniesPage').then((m) => ({ default: m.CompaniesPage })))
const ComponentsPage = lazy(() => import('../modules/library/ComponentsPage').then((m) => ({ default: m.ComponentsPage })))
const RatesPage = lazy(() => import('../modules/library/RatesPage').then((m) => ({ default: m.RatesPage })))
const AssembliesPage = lazy(() => import('../modules/library/AssembliesPage').then((m) => ({ default: m.AssembliesPage })))
const KitGroupsPage = lazy(() => import('../modules/library/KitGroupsPage').then((m) => ({ default: m.KitGroupsPage })))
const SeedImportPage = lazy(() => import('../modules/library/SeedImportPage').then((m) => ({ default: m.SeedImportPage })))
const CostingsPage = lazy(() => import('../modules/costing/CostingsPage').then((m) => ({ default: m.CostingsPage })))
const CostingEditor = lazy(() => import('../modules/costing/CostingEditor').then((m) => ({ default: m.CostingEditor })))
const ReleasePage = lazy(() => import('../modules/quotation/ReleasePage').then((m) => ({ default: m.ReleasePage })))
const QuotationsPage = lazy(() => import('../modules/quotation/QuotationsPage').then((m) => ({ default: m.QuotationsPage })))
const CustomersPage = lazy(() => import('../modules/crm/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const EnquiriesPage = lazy(() => import('../modules/crm/EnquiriesPage').then((m) => ({ default: m.EnquiriesPage })))
const EnquiryDetail = lazy(() => import('../modules/crm/EnquiryDetail').then((m) => ({ default: m.EnquiryDetail })))
const FollowUpsPage = lazy(() => import('../modules/crm/FollowUpsPage').then((m) => ({ default: m.FollowUpsPage })))
const QuotationDefaultsPage = lazy(() => import('../modules/admin/QuotationDefaultsPage').then((m) => ({ default: m.QuotationDefaultsPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The database is the authority; a stale list for a few seconds is fine,
      // but refetching on every window focus is noise.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <BrowserRouter>
          <Routes>
            {/*
              Outside RequireAuth: a recovery or invitation link lands here, and
              somebody following an invitation has a session but may not belong to
              a company yet. This is the address resetPasswordForEmail sends
              people to, and the one the invitation function uses.
            */}
            <Route path="reset-password" element={<SetPasswordPage />} />
            <Route
              element={
                <RequireAuth>
                  <Suspense fallback={<p className="empty">Loading…</p>}>
                    <Layout />
                  </Suspense>
                </RequireAuth>
              }
            >
              <Route index element={<HomePage />} />
              <Route path="costings" element={<CostingsPage />} />
              <Route path="costings/:id" element={<CostingEditor />} />
              <Route
                path="costings/:id/release"
                element={
                  <RequireRole role="approver">
                    <ReleasePage />
                  </RequireRole>
                }
              />
              <Route path="quotations" element={<QuotationsPage />} />
              <Route path="crm/customers" element={<CustomersPage />} />
              <Route path="crm/customers/:id" element={<CustomersPage />} />
              <Route path="crm/enquiries" element={<EnquiriesPage />} />
              <Route path="crm/enquiries/:id" element={<EnquiryDetail />} />
              <Route path="crm/follow-ups" element={<FollowUpsPage />} />
              <Route
                path="admin/quotation-defaults"
                element={
                  <RequireRole role="company_admin">
                    <QuotationDefaultsPage />
                  </RequireRole>
                }
              />
              <Route path="library/components" element={<ComponentsPage />} />
              <Route path="library/assemblies" element={<AssembliesPage />} />
              <Route path="library/kit-groups" element={<KitGroupsPage />} />
              <Route
                path="library/rates"
                element={
                  <RequireRole role="company_admin">
                    <RatesPage />
                  </RequireRole>
                }
              />
              <Route
                path="library/import"
                element={
                  <RequireRole role="company_admin">
                    <SeedImportPage />
                  </RequireRole>
                }
              />
              <Route
                path="admin/people"
                element={
                  <RequireRole role="company_admin">
                    <PeoplePage />
                  </RequireRole>
                }
              />
              <Route
                path="admin/company"
                element={
                  <RequireRole role="company_admin">
                    <CompanyPage />
                  </RequireRole>
                }
              />
              <Route
                path="admin/companies"
                element={
                  <RequireRole masterAdminOnly>
                    <CompaniesPage />
                  </RequireRole>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </QueryClientProvider>
  )
}

function NotFound() {
  return (
    <div className="card">
      <h1>No such page</h1>
      <p className="muted">The address you followed does not exist.</p>
    </div>
  )
}
