// Shapes of the tables this slice touches, matching supabase/migrations/0002.
// Later these are generated with `supabase gen types typescript`; hand-written
// for now so the app can be built before the project exists.

export type CompanyKind = 'in_house' | 'external' | 'buyer'
export type UserRole = 'company_admin' | 'costing_engineer' | 'approver'

export interface Company {
  id: string
  name: string
  kind: CompanyKind
  currency_code: string
  currency_label: string
  exchange_rate: number
  discount_pct: number
  material_margin_pct: number
  labour_margin_pct: number
  tax_pct: number
  price_rounding_step: number
  quotation_prefix: string
  quotation_no_includes_year: boolean
  address: string | null
  tax_pin: string | null
  logo_path: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CompanySettings {
  id: string
  company_id: string
  po_box: string | null
  street_address: string | null
  phones: string | null
  email: string | null
  salutation: string
  intro_text: string
  closing_text: string
  signatory_name: string | null
  signatory_email: string | null
  default_notes_on_offer: string | null
  scope_of_supply: string | null
  validity_days: number
  payment_terms: string | null
  delivery_terms: string | null
  delivery_timelines: string | null
  bank_details: string | null
  quotation_footer: string | null
}

export interface Profile {
  id: string
  company_id: string
  full_name: string
  email: string | null
  is_master_admin: boolean
  is_active: boolean
  created_at: string
}

export interface UserRoleRow {
  id: string
  user_id: string
  company_id: string
  role: UserRole
}

/** A profile with the roles that belong to it, as the users screen shows them. */
export interface PersonWithRoles extends Profile {
  roles: UserRole[]
}

// --- library ---------------------------------------------------------------

export type PricingMode = 'fixed' | 'weight_rate'

export interface ComponentCategory {
  code: string
  name: string
  sort_order: number
}

export interface ProcessType {
  code: string
  name: string
  sort_order: number
}

export interface Component {
  id: string
  company_id: string | null
  category_code: string
  code: string
  name: string
  description: string | null
  unit: string
  manufacturer: string | null
  part_number: string | null
  pricing_mode: PricingMode
  unit_price: number | null
  currency_code: string
  weight_per_unit: number | null
  material_rate_code: string | null
  is_active: boolean
}

/** A component as the signed-in company would pay for it. */
export interface ComponentPrice extends Omit<Component, 'unit_price' | 'currency_code'> {
  category_name: string
  raw_price: number | null
  unit_price: number
  currency_code: string
  currency_label: string
  source: 'master' | 'company'
}

export interface LabourRate {
  id: string
  company_id: string | null
  process_type: string
  hourly_rate: number
}

export interface MaterialRate {
  id: string
  company_id: string | null
  code: string
  name: string
  unit: string
  rate: number
}

/** The rate this company actually pays, its own or the master default. */
export interface EffectiveMaterialRate {
  code: string
  name: string
  unit: string
  rate: number
  source: 'master' | 'company'
  master_rate_kes: number
}

export interface PriceHistoryRow {
  id: string
  component_id: string
  old_price: number | null
  new_price: number
  changed_at: string
  changed_by: string | null
}
