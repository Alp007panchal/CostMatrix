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
  enclosure_uplift_pct: number
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
  /** How many records anywhere name this person. Zero means they can still be moved or removed; undefined when the caller may not ask. */
  records: number | undefined
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
  /** What the supplier charges, in purchase_currency (fixed pricing only). */
  purchase_price: number | null
  purchase_currency: string
  weight_per_unit: number | null
  material_rate_code: string | null
  is_enclosure_cubicle: boolean
  /** Used by kits but not priced yet; cannot be costed until a purchase price is set. */
  is_placeholder: boolean
  rating: string | null
  poles: string | null
  breaking_capacity: string | null
  frame_size: string | null
  is_active: boolean
}

/** What an import function reports, with or without having written anything. */
export interface ImportReport {
  new: number
  changed: number
  unchanged: number
  rejected: { row: number; key: string; reason: string }[]
  warnings?: { row?: number; key: string; reason: string }[]
  changes: { key: string; changes: { field: string; from: unknown; to: unknown }[] }[]
  applied: boolean
  batch_id: string | null
  groups_new?: number
  overrides?: number
  skipped_blank?: number
  busbar_kg_derived?: number
}

/** A component as the signed-in company would pay for it (v_component_prices). */
export interface ComponentPrice extends Omit<Component, 'purchase_price' | 'breaking_capacity' | 'frame_size'> {
  category_name: string
  /** The purchase price in purchase_currency. */
  raw_price: number | null
  /** What this company pays, in its own currency, after discount and conversion. Null until a placeholder gets a purchase price. */
  unit_price: number | null
  currency_code: string
  currency_label: string
  source: 'master' | 'company'
  /** KES per 1 unit of the purchase currency, landed (one number, decision 2). */
  landed_factor: number | null
  /** purchase_price × landed factor, before any discount. */
  landed_price_kes: number | null
}

export interface CurrencyFactor {
  id: string
  company_id: string | null
  currency_code: string
  /** KES per 1 unit of the currency, landed: exchange rate, freight, duty and handling in one number. */
  landed_factor: number
  note: string | null
}

/** The factor this company works with per currency: its own row or the master default (v_currency_factors). */
export interface EffectiveCurrencyFactor {
  currency_code: string
  landed_factor: number
  source: 'master' | 'company'
  master_landed_factor: number
  master_id: string
  own_id: string | null
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
  currency_code: string
}

/** The rate this company actually pays, its own or the master default. */
export interface EffectiveMaterialRate {
  code: string
  name: string
  unit: string
  /** What this company pays per unit, in its own currency. */
  rate: number
  source: 'master' | 'company'
  master_rate_kes: number
  kes_per_kg: number
  /** The rate as typed and its currency (15 EUR). */
  rate_entered: number
  currency_code: string
  master_rate: number
  master_currency: string
}

export interface PriceHistoryRow {
  id: string
  component_id: string
  old_price: number | null
  new_price: number
  purchase_currency: string | null
  changed_at: string
  changed_by: string | null
}

/** A kit: a main device plus its busbar, cable and accessories. The table is still called assemblies. */
export interface Assembly {
  id: string
  company_id: string | null
  code: string
  name: string
  description: string | null
  kit_group_id: string | null
  rating: number | null
  rating_unit: 'A' | 'KVAR' | null
  poles: number | null
  is_active: boolean
}

export interface AssemblyComponentRow {
  id: string
  assembly_id: string
  component_id: string
  quantity: number
  is_main_device: boolean
  sort_order: number
}

/** A family of kits that share labour hours per process type. */
export interface KitGroup {
  id: string
  company_id: string | null
  name: string
  description: string | null
  sort_order: number
}

export interface KitGroupHours {
  id: string
  kit_group_id: string
  process_type: string
  hours: number
}

/** Hours per process type for one assembly, as this company plans them. */
export interface AssemblyHours {
  assembly_id: string
  process_type: string
  process_name: string
  sort_order: number
  effective_hours: number
  /** The kit's own hours, if it has a row for this process type. */
  master_hours: number | null
  company_hours: number | null
  /** The kit group's hours, used when the kit has none of its own. */
  group_hours: number | null
  source: 'master' | 'company_override' | 'private' | 'kit_group'
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
  enclosure_uplift_pct: number
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
  /** kit: a copy of a library kit. free: the panel's holder for loose components and typed lines. */
  kind: 'kit' | 'free'
  source_assembly_id: string | null
  code: string
  name: string
  quantity: number
  sort_order: number
}

/** A kit as the costing picker sees it (v_kits). */
export interface Kit {
  id: string
  company_id: string | null
  code: string
  name: string
  description: string | null
  is_active: boolean
  kit_group_id: string | null
  group_name: string | null
  rating: number | null
  rating_unit: 'A' | 'KVAR' | null
  poles: number | null
  main_device_code: string | null
  main_device_name: string | null
  has_unpriced_part: boolean
  line_count: number
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
  purchase_price: number | null
  purchase_currency: string | null
  landed_factor: number | null
  uplift_pct: number | null
  unit_price: number
  /** Typed in with its own price; no catalogue source. */
  is_manual: boolean
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
