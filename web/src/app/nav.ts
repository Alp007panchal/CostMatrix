/**
 * The navigation, as data (house style §3).
 *
 * It is a list rather than JSX so that one test can walk it against the routes
 * in `App.tsx` and prove every screen is reachable — for each role, with each
 * feature on. A link that exists only inside a component is a link nothing can
 * check, and this app grew to twenty-five of them in one top bar.
 */

/** Which count, if any, belongs on the right of an item. */
export type CountKey = 'costings' | 'quotations' | 'followups' | 'library'

export interface NavItem {
  to: string
  label: string
  /** Hidden unless this feature is switched on. */
  feature?: string
  /** Company administrators and the master administrator only. */
  admin?: boolean
  /** The master administrator only. */
  master?: boolean
  count?: CountKey
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Overview', items: [{ to: '/', label: 'Home' }] },
  {
    label: '1 · Enquiry to quote',
    items: [
      { to: '/crm/customers', label: 'Customers' },
      { to: '/crm/enquiries', label: 'Enquiries' },
      { to: '/costings', label: 'Costings', count: 'costings' },
      { to: '/quotations', label: 'Quotations', count: 'quotations' },
      { to: '/crm/follow-ups', label: 'Follow-ups', count: 'followups' },
    ],
  },
  {
    label: '2 · Library',
    items: [
      { to: '/library/components', label: 'Components' },
      { to: '/library/assemblies', label: 'Kits' },
      { to: '/library/health', label: 'Library health', feature: 'library_health', admin: true, count: 'library' },
      { to: '/library/setup', label: 'Library set-up', admin: true },
    ],
  },
  {
    label: '3 · Insight',
    items: [
      { to: '/assistant', label: 'Ask about your jobs', feature: 'assistant' },
      { to: '/sales', label: 'Sales', feature: 'sales_analytics' },
      { to: '/admin/labour-variance', label: 'Labour variance', feature: 'labour_actuals', admin: true },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/settings', label: 'Settings', admin: true },
      { to: '/admin/people', label: 'People', admin: true },
    ],
  },
  { label: 'Help', items: [{ to: '/help', label: 'Help' }] },
]

/** One tab of a vertical-tab page: a heading may precede it. */
export interface TabItem {
  to: string
  label: string
  group?: string
  feature?: string
  master?: boolean
}

/** `/settings` (house style §3). The old routes still work and land on the tab. */
export const SETTINGS_TABS: TabItem[] = [
  { to: '/admin/company', label: 'Company details', group: 'Company' },
  { to: '/admin/quotation-defaults', label: 'Quotation wording' },
  { to: '/admin/approval-rules', label: 'Approval rules', feature: 'approval_rules' },
  { to: '/admin/compatibility-rules', label: 'Compatibility rules', feature: 'compatibility_checks' },
  { to: '/admin/features', label: 'Features', group: 'App' },
  { to: '/admin/assistant', label: 'Assistant', feature: 'assistant' },
  { to: '/admin/errors', label: 'What broke' },
  { to: '/admin/companies', label: 'Companies', master: true },
]

/** `/library/setup`. */
export const LIBRARY_SETUP_TABS: TabItem[] = [
  { to: '/library/rates', label: 'Rates & currency factors' },
  { to: '/library/kit-groups', label: 'Kit groups & labour hours' },
  { to: '/library/price-lists', label: 'Price lists', feature: 'price_lists' },
  { to: '/library/import', label: 'Import' },
]

/** Every destination the shell offers, for the reachability test. */
export function allNavRoutes(): string[] {
  return [
    ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to)),
    ...SETTINGS_TABS.map((t) => t.to),
    ...LIBRARY_SETUP_TABS.map((t) => t.to),
  ]
}
