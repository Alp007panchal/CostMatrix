import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from '../modules/auth/session'
import { FeatureGate } from '../modules/admin/FeatureGate'
import { RequireAuth, RequireRole } from './guards'
import { Layout } from './Layout'
import { LibrarySetupFirstTab, LibrarySetupLayout, SettingsFirstTab, SettingsLayout } from './TabbedPages'
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
const PriceListsPage = lazy(() => import('../modules/library/PriceListsPage').then((m) => ({ default: m.PriceListsPage })))
const CostingsPage = lazy(() => import('../modules/costing/CostingsPage').then((m) => ({ default: m.CostingsPage })))
const CostingEditor = lazy(() => import('../modules/costing/CostingEditor').then((m) => ({ default: m.CostingEditor })))
const ReleasePage = lazy(() => import('../modules/quotation/ReleasePage').then((m) => ({ default: m.ReleasePage })))
const QuotationsPage = lazy(() => import('../modules/quotation/QuotationsPage').then((m) => ({ default: m.QuotationsPage })))
const CustomersPage = lazy(() => import('../modules/crm/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const EnquiriesPage = lazy(() => import('../modules/crm/EnquiriesPage').then((m) => ({ default: m.EnquiriesPage })))
const EnquiryDetail = lazy(() => import('../modules/crm/EnquiryDetail').then((m) => ({ default: m.EnquiryDetail })))
const FollowUpsPage = lazy(() => import('../modules/crm/FollowUpsPage').then((m) => ({ default: m.FollowUpsPage })))
const ApprovalRulesPage = lazy(() => import('../modules/admin/ApprovalRulesPage').then((m) => ({ default: m.ApprovalRulesPage })))
const FeaturesPage = lazy(() => import('../modules/admin/FeaturesPage').then((m) => ({ default: m.FeaturesPage })))
const CompatibilityRulesPage = lazy(() => import('../modules/admin/CompatibilityRulesPage').then((m) => ({ default: m.CompatibilityRulesPage })))
const LibraryHealthPage = lazy(() => import('../modules/library/LibraryHealthPage').then((m) => ({ default: m.LibraryHealthPage })))
const LabourVariancePage = lazy(() => import('../modules/admin/LabourVariancePage').then((m) => ({ default: m.LabourVariancePage })))
const SalesPage = lazy(() => import('../modules/sales/SalesPage').then((m) => ({ default: m.SalesPage })))
const QuotationDefaultsPage = lazy(() => import('../modules/admin/QuotationDefaultsPage').then((m) => ({ default: m.QuotationDefaultsPage })))
const AssistantSettingsPage = lazy(() => import('../modules/assistant/AssistantSettingsPage').then((m) => ({ default: m.AssistantSettingsPage })))
const AssistantPage = lazy(() => import('../modules/assistant/AssistantPage').then((m) => ({ default: m.AssistantPage })))
const ErrorsPage = lazy(() => import('../modules/admin/ErrorsPage').then((m) => ({ default: m.ErrorsPage })))
const HelpPage = lazy(() => import('../modules/help/HelpPage').then((m) => ({ default: m.HelpPage })))
const TermsPage = lazy(() => import('../modules/legal/TermsPage').then((m) => ({ default: m.TermsPage })))

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
            {/*
              Also outside RequireAuth, and deliberately: somebody deciding
              whether to accept an invitation has to be able to read what the
              app stores before they have an account to read it with.
            */}
            <Route
              path="terms"
              element={
                <div className="reading">
                  <Suspense fallback={<p className="empty">Loading…</p>}>
                    <TermsPage />
                  </Suspense>
                </div>
              }
            />
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
              {/* Every signed-in person, whatever roles they hold or do not. */}
              <Route path="help" element={<HelpPage />} />
              <Route
                path="sales"
                element={
                  <FeatureGate code="sales_analytics">
                    <SalesPage />
                  </FeatureGate>
                }
              />
              <Route path="crm/customers" element={<CustomersPage />} />
              <Route path="crm/customers/:id" element={<CustomersPage />} />
              <Route path="crm/enquiries" element={<EnquiriesPage />} />
              <Route path="crm/enquiries/:id" element={<EnquiryDetail />} />
              <Route path="crm/follow-ups" element={<FollowUpsPage />} />

              {/*
                Settings: eight screens that used to be eight separate links in
                the top bar. The addresses have not changed — this is a layout
                route with no path of its own, so `/admin/company` still works
                and now simply draws with the tab column beside it.
              */}
              <Route path="settings" element={<SettingsFirstTab />} />
              <Route
                element={
                  <RequireRole role="company_admin">
                    <SettingsLayout />
                  </RequireRole>
                }
              >
                <Route path="admin/company" element={<CompanyPage />} />
                <Route path="admin/quotation-defaults" element={<QuotationDefaultsPage />} />
                <Route
                  path="admin/approval-rules"
                  element={
                    <FeatureGate code="approval_rules">
                      <ApprovalRulesPage />
                    </FeatureGate>
                  }
                />
                <Route
                  path="admin/compatibility-rules"
                  element={
                    <FeatureGate code="compatibility_checks">
                      <CompatibilityRulesPage />
                    </FeatureGate>
                  }
                />
                <Route path="admin/features" element={<FeaturesPage />} />
                <Route
                  path="admin/assistant"
                  element={
                    <FeatureGate code="assistant">
                      <AssistantSettingsPage />
                    </FeatureGate>
                  }
                />
                <Route
                  path="assistant"
                  element={
                    <FeatureGate code="assistant">
                      <AssistantPage />
                    </FeatureGate>
                  }
                />
                <Route path="admin/errors" element={<ErrorsPage />} />
                <Route
                  path="admin/companies"
                  element={
                    <RequireRole masterAdminOnly>
                      <CompaniesPage />
                    </RequireRole>
                  }
                />
              </Route>

              {/* Library set-up: the same arrangement for the four library screens. */}
              <Route path="library/setup" element={<LibrarySetupFirstTab />} />
              <Route
                element={
                  <RequireRole role="company_admin">
                    <LibrarySetupLayout />
                  </RequireRole>
                }
              >
                <Route path="library/rates" element={<RatesPage />} />
                <Route path="library/kit-groups" element={<KitGroupsPage />} />
                <Route
                  path="library/price-lists"
                  element={
                    <FeatureGate code="price_lists">
                      <PriceListsPage />
                    </FeatureGate>
                  }
                />
                <Route path="library/import" element={<SeedImportPage />} />
              </Route>

              <Route path="library/components" element={<ComponentsPage />} />
              <Route path="library/assemblies" element={<AssembliesPage />} />
              <Route
                path="library/health"
                element={
                  <RequireRole role="company_admin">
                    <FeatureGate code="library_health">
                      <LibraryHealthPage />
                    </FeatureGate>
                  </RequireRole>
                }
              />
              <Route
                path="admin/labour-variance"
                element={
                  <RequireRole role="company_admin">
                    <FeatureGate code="labour_actuals">
                      <LabourVariancePage />
                    </FeatureGate>
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
