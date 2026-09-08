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

export interface Assembly {
  id: string
  company_id: string | null
  code: string
  name: string
  description: string | null
  is_active: boolean
}

export interface AssemblyComponentRow {
  id: string
  assembly_id: string
  component_id: string
  quantity: number
  sort_order: number
}

/** Hours per process type for one assembly, as this company plans them. */
export interface AssemblyHours {
  assembly_id: string
  process_type: string
  process_name: string
  sort_order: number
  effective_hours: number
  master_hours: number | null
  company_hours: number | null
  source: 'master' | 'company_override' | 'private'
}

// --- costing ---------------------------------------------------------------

export type CostingStatus = 'draft' | 'submitted' | 'approved'

export interface Costing {
  id: string
  company_id: string
  enquiry_id: string | null
  costing_no: string
  revision_no: number
  family_id: string
  previous_revision_id: string | null
  is_current: boolean
  title: string
  notes: string | null
  status: CostingStatus
  currency_code: string
  currency_label: string
  exchange_rate: number
  discount_pct: number
  material_margin_pct: number
  labour_margin_pct: number
  negotiation_margin_pct: number
  price_rounding_step: number
  tax_pct: number
  submitted_at: string | null
  approved_at: string | null
  returned_at: string | null
  return_comment: string | null
  created_at: string
  updated_at: string
}

export interface CostingPanel {
  id: string
  costing_id: string
  company_id: string
  name: string
  tag: string | null
  option_label: string | null
  uom: string
  quantity: number
  technical_description: string | null
  enclosure_dimensions: string | null
  sort_order: number
}

export interface CostingAssembly {
  id: string
  costing_id: string
  panel_id: string
  source_assembly_id: string | null
  code: string
  name: string
  quantity: number
  sort_order: number
}

export interface CostingItem {
  id: string
  costing_id: string
  costing_assembly_id: string
  source_component_id: string | null
  code: string
  name: string
  category_code: string
  unit: string
  manufacturer: string | null
  part_number: string | null
  quantity: number
  pricing_mode: PricingMode
  unit_price: number
  sort_order: number
}

export interface CostingLabour {
  id: string
  costing_id: string
  costing_assembly_id: string
  process_type: string
  hours: number
  source_hours: number | null
  source: string
  hourly_rate: number
}

/** v_costing_assembly_totals */
export interface AssemblyTotals {
  costing_assembly_id: string
  material_each: number
  labour_each: number
  material_total: number
  labour_total: number
  hours_each: number
  hours_total: number
}

/** v_costing_panel_prices */
export interface PanelPrice {
  panel_id: string
  material_cost: number
  labour_cost: number
  hours: number
  material_sell: number
  labour_sell: number
  unit_price: number
  line_total: number
}

/** v_costing_totals */
export interface CostingTotals {
  costing_id: string
  material_cost: number
  labour_cost: number
  hours: number
  subtotal: number
  tax: number
  grand_total: number
}

/** v_costing_option_totals */
export interface OptionTotals {
  option_label: string
  subtotal: number
  tax: number
  grand_total: number
}

export interface CostingHistoryRow {
  id: string
  user_id: string | null
  action: string
  details: Record<string, unknown> | null
  at: string
}

// --- quotation -------------------------------------------------------------

export type QuotationStatus = 'released' | 'sent' | 'won' | 'lost'

export interface QuotationTerms {
  scope_of_supply: string | null
  validity: string | null
  payment: string | null
  delivery_terms: string | null
  delivery_timelines: string | null
}

export interface Letterhead {
  company_name: string
  po_box: string | null
  street_address: string | null
  phones: string | null
  email: string | null
  tax_pin: string | null
  logo_path: string | null
  currency_label: string
}

export interface Quotation {
  id: string
  company_id: string
  costing_id: string
  reference_no: string
  customer_id: string | null
  contact_id: string | null
  customer_name: string
  customer_address: string | null
  subject: string
  salutation: string
  intro_text: string
  closing_text: string
  notes_on_offer: string | null
  terms: QuotationTerms
  signatory_name: string | null
  signatory_email: string | null
  letterhead_snapshot: Letterhead
  pdf_path: string
  released_at: string
  status: QuotationStatus
  sent_at: string | null
  decided_at: string | null
  lost_reason: string | null
}

/** What the approver types or accepts at release. Blanks fall back to company defaults. */
export interface ReleaseTexts {
  customer_name: string
  customer_id?: string
  contact_id?: string
  customer_address?: string
  subject?: string
  salutation?: string
  intro_text?: string
  closing_text?: string
  notes_on_offer?: string
  terms?: QuotationTerms
  signatory_name?: string
  signatory_email?: string
}

/** v_costing_items_by_category: one row per distinct component, quantities multiplied through. */
export interface BomItem {
  costing_id: string
  category_code: string
  category_name: string
  code: string
  name: string
  manufacturer: string | null
  part_number: string | null
  unit: string
  unit_price: number
  option_label: string | null
  quantity: number
  line_total: number
}

// --- crm -------------------------------------------------------------------

export type EnquiryStatus = 'open' | 'quoted' | 'won' | 'lost' | 'closed'

export interface Customer {
  id: string
  company_id: string
  name: string
  address: string | null
  city: string | null
  country: string | null
  tax_pin: string | null
  notes: string | null
  is_active: boolean
  created_at: string
}

export interface Contact {
  id: string
  company_id: string
  customer_id: string
  name: string
  email: string | null
  phone: string | null
  job_title: string | null
  is_primary: boolean
  is_active: boolean
}

export interface Project {
  id: string
  company_id: string
  customer_id: string
  name: string
  site_location: string | null
  notes: string | null
  is_active: boolean
}

export interface Enquiry {
  id: string
  company_id: string
  enquiry_no: string
  customer_id: string
  contact_id: string | null
  project_id: string | null
  received_on: string
  title: string
  description: string | null
  source: string | null
  status: EnquiryStatus
  stage: string | null
  owner_user_id: string | null
  created_at: string
}

export interface QuotationFollowup {
  id: string
  quotation_id: string
  company_id: string
  due_on: string
  note: string | null
  assigned_to: string | null
  done_at: string | null
  created_at: string
}
