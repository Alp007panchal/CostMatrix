import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from '../modules/auth/session'
import { RequireAuth, RequireRole } from './guards'
import { Layout } from './Layout'
import { HomePage } from '../modules/dashboard/HomePage'
import { PeoplePage } from '../modules/admin/PeoplePage'
import { CompanyPage } from '../modules/admin/CompanyPage'
import { CompaniesPage } from '../modules/admin/CompaniesPage'
import { ComponentsPage } from '../modules/library/ComponentsPage'
import { RatesPage } from '../modules/library/RatesPage'

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
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<HomePage />} />
              <Route path="library/components" element={<ComponentsPage />} />
              <Route
                path="library/rates"
                element={
                  <RequireRole role="company_admin">
                    <RatesPage />
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
