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
