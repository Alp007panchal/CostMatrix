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

/** A catalogue line a copy could not re-price, and why (app.copy_costing). */
export interface KeptLine {
  code: string
  name: string
  unit_price: number
  reason: string
}

/** What app.copy_costing did. */
export interface CopyReport {
  costing_id: string
  costing_no: string
  title: string
  from_costing_no: string
  repriced: number
  kept: KeptLine[]
}

/** What app.copy_panel did. */
export interface PanelCopyReport {
  panel_id: string
  repriced: number
  kept: KeptLine[]
}

/** A section name offered when something is added to a panel (panel_sections). */
export interface PanelSection {
  name: string
  sort_order: number
}

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
  // --- added by migration 0100 (foundations F1). All optional. ---
  /** Who invoices, which may be a local distributor. `manufacturer` is the brand the quotation prints. */
  supplier: string | null
  /** Structured extras typed by category: mounting, operation, IP, dimensions, kVAr. */
  attributes: Record<string, unknown>
  /** The part that replaces this one once it is obsolete. */
  replaced_by: string | null
  datasheet_url: string | null
  lead_time_days: number | null
  /** When this price started. */
  price_valid_from: string | null
  /** Where the price came from: a supplier list and date, or who typed it. */
  price_source: string | null
  /** Derived from is_active and is_placeholder; read-only until a later migration makes it authoritative. */
  status: 'active' | 'obsolete' | 'placeholder'
  is_active: boolean
  // --- added by migration 0106 (foundations F12). All optional, all in mm. ---
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  mounting_type: MountingType | null
  /** Millimetres to leave clear around it: {top, bottom, left, right}. */
  clearances: Clearances
  weight_kg: number | null
  /** An enclosure cubicle only: the usable area inside it and its chambers. */
  enclosure_layout: EnclosureLayout
}

/** What a device mounts on. The layout canvas of phase 3.8 chooses the zone by it. */
export type MountingType = 'din_rail' | 'plate' | 'withdrawable' | 'door' | 'busbar_chamber' | 'other'

export interface Clearances {
  top?: number
  bottom?: number
  left?: number
  right?: number
}

export interface EnclosureLayout {
  usable_w_mm?: number
  usable_h_mm?: number
  usable_d_mm?: number
  busbar_chamber?: { w_mm?: number; h_mm?: number }
  cable_chamber?: { w_mm?: number; h_mm?: number }
  form?: string
}

/** app.panel_fit: the area a panel's kits need against what its cubicles offer. */
export interface PanelFit {
  verdict: 'fits' | 'tight' | 'no_fit' | 'unknown'
  safety_factor: number
  kits_measured: number
  kits_unmeasured: number
  unmeasured: { name: string; reason: string }[]
  cubicles: { code: string; quantity: number; known: boolean }[]
  kit_area_mm2: number
  required_area_mm2: number
  usable_area_mm2: number
  used_pct: number | null
  reason?: string
}

/** One advanced feature and whether it is switched on here (v_company_features). */
export interface CompanyFeature {
  code: string
  name: string
  blurb: string
  /** Does switching this on change what an existing costing does? Three do. */
  changes_costings: boolean
  option_key: string
  sort_order: number
  is_on: boolean
}

/** One finding of one compatibility rule against one panel (v_panel_warnings). */
export interface PanelWarning {
  company_id: string
  costing_id: string
  panel_id: string
  panel_name: string
  rule_id: string
  rule_kind: CompatibilityKind
  rule_name: string
  severity: 'warning' | 'blocker'
  /** The kit, or the panel where the finding belongs to no one kit. */
  subject: string
  message: string
  detail: Record<string, string>
}

export type CompatibilityKind =
  | 'device_depth_vs_cubicle'
  | 'accessory_fits_device'
  | 'feeders_vs_incomer'

/** A compatibility check as a row somebody can read and edit (0114). */
export interface CompatibilityRule {
  id: string
  /** Null = a master rule, in force for every company. */
  company_id: string | null
  rule_kind: CompatibilityKind
  name: string
  params: Record<string, unknown>
  severity: 'warning' | 'blocker'
  message: string
  is_active: boolean
  sort_order: number
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

/** A company's approval rule (0102), wired into submit and approve by 0108. */
export interface ApprovalRule {
  id: string
  company_id: string
  sort_order: number
  name: string
  /** All of them must hold. An empty list always holds. */
  condition: { field: string; op: string; value: unknown }[]
  outcome: 'auto_approve' | 'require_approver' | 'require_master_admin' | 'block'
  is_active: boolean
}

/** app.approval_review: the verdict for one costing, and every rule behind it. */
export interface ApprovalReview {
  outcome: 'auto_approve' | 'require_approver' | 'require_master_admin' | 'block'
  rule_name: string | null
  rule_id: string | null
  facts: Record<string, unknown>
  rules: {
    rule_id: string
    name: string
    outcome: ApprovalRule['outcome']
    holds: boolean
    decided: boolean
    conditions: { field: string; op: string; value: unknown; holds: boolean; actual: unknown }[]
  }[]
}

/** app.v_quotation_validity: how long a quotation has left. */
export interface QuotationValidity {
  quotation_id: string
  company_id: string
  costing_id: string
  reference_no: string
  status: QuotationStatus
  valid_until: string | null
  expired_at: string | null
  sent_at: string | null
  customer_name: string
  days_left: number | null
  has_run_out: boolean
}

/** One upload of any kind, from the import framework F9 added in 0102. */
export interface ImportJob {
  id: string
  company_id: string | null
  user_id: string | null
  type: 'catalogue' | 'kits' | 'kit_group_hours' | 'bom' | 'price_list' | 'labour_hours'
  document_id: string | null
  file_name: string | null
  status: 'preview' | 'applied' | 'failed' | 'discarded'
  column_mapping: Record<string, string>
  summary: Record<string, unknown>
  rows_total: number | null
  started_at: string
  finished_at: string | null
}

/** One line of an upload: what it matched, what would happen, what happened. */
export interface ImportRow {
  id: string
  job_id: string
  row_number: number | null
  raw: PriceListRowPreview
  matched_entity_id: string | null
  match_method: string | null
  status: 'new' | 'changed' | 'unchanged' | 'rejected' | 'warning' | 'accepted' | 'skipped'
  message: string | null
}

/** What a price-list row's `raw` holds after the preview (migration 0105). */
export interface PriceListRowPreview {
  key?: string
  maker?: string
  description?: string
  new_price?: number
  new_currency?: string
  supplier?: string
  valid_from?: string
  old_price?: number
  old_currency?: string
  component_code?: string
  component_name?: string
  pricing_mode?: PricingMode
  is_placeholder?: boolean
  change_pct?: number
  applied_old_price?: number
  applied_old_currency?: string
  applied_at?: string
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
  // --- added by migration 0100 (foundations F2). All optional. ---
  /** Bumped by hand when the composition changes. A costing records the version it copied. */
  version: number
  /** The Annexure IV wording, separate from the internal kit name. */
  customer_wording: string | null
  /** Free labels — incomer, outgoer, apfc — so the configurator and the assistant can find kits. */
  tags: string[]
  /** Populated in a later phase; empty today. */
  compatibility_rules: Record<string, unknown>
  /** Derived from is_active; read-only. */
  status: 'active' | 'retired'
  // --- added by migration 0106 (foundations F12). Null = work it out from the
  // main device and its clearances, which is right for most kits. ---
  footprint_w_mm: number | null
  footprint_h_mm: number | null
  footprint_d_mm: number | null
  /** Roadmap 3.8: which mounting design this kit belongs to, and what it takes on the stack. */
  mounting_design: MountingDesign | null
  module_height_mm: number | null
  positions_per_plate: number | null
}

export interface AssemblyComponentRow {
  id: string
  assembly_id: string
  component_id: string
  quantity: number
  /** A formula over the kit's parameters; null means use `quantity` (0100, read since 0112). */
  qty_expression: string | null
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
  /** Which option the costing's own total means. Null: no choice, and it adds every panel. */
  chosen_option_label: string | null
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
  /** An extra the customer may take or leave: priced and printed, left out of the total. */
  is_option: boolean
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
  /** Which part of the panel this line sits in, e.g. Incomer. Null: not placed in one. */
  section: string | null
  source_assembly_id: string | null
  code: string
  name: string
  quantity: number
  /** The kit parameters this line was worked out from; empty for a kit that takes none. */
  parameters: Record<string, string>
  sort_order: number
}

/** What a parameterised kit asks for before it can be added (kit_parameters). */
export interface KitParameter {
  id: string
  assembly_id: string
  name: string
  value_type: 'number' | 'text' | 'boolean'
  unit: string | null
  default_value: string | null
  min_value: number | null
  max_value: number | null
  sort_order: number
}

/** One size of step kit in a proposed APFC bank (app.propose_apfc). */
export interface ApfcStep {
  assembly_id: string
  code: string
  name: string
  rating: number
  quantity: number
  kvar: number
}

/** What the configurator proposes for a target; it writes nothing until applied. */
export interface ApfcProposal {
  panel_id: string
  family: string
  target_kvar: number
  total_kvar: number
  /** What the sizes in the library could not reach. Zero when the target is met. */
  shortfall_kvar: number
  steps: ApfcStep[]
}

// --- the guided board configurator (roadmap 3.1) ---------------------------

/** One feeder way the customer asked for. */
export interface FeederAnswer {
  rating_a: number
  quantity: number
  /** mccb or mcb; blank lets the library decide. */
  type: string
}

/** The questions the configurator asks about a board. */
export interface BoardAnswers {
  sources: string[]
  incomer_rating_a: number | null
  incomer_type: string
  changeover: string
  feeders: FeederAnswer[]
  apfc_kvar: number | null
  metering: boolean
  form: string
  ip: string
  access: string
  cable_entry: string
}

/** One kit the configurator proposes, and which answer put it there. */
export interface BoardLine {
  assembly_id: string
  code: string
  name: string
  rating: number | null
  group_name: string | null
  role: string
  section: string
  quantity: number
  why: string
  /** False when the library had nothing that big; `note` says so. */
  exact: boolean
  note?: string
}

/** Something the answers asked for that this library cannot provide. */
export interface BoardGap {
  what: string
  why: string
}

export interface BoardProposal {
  panel_id: string
  panel: string
  lines: BoardLine[]
  missing: BoardGap[]
  /** The answers, shaped for costing_panels.parameters. */
  parameters: Record<string, unknown>
}

/** A kit as the configurator sees it (v_board_kits). */
export interface BoardKit {
  id: string
  code: string
  name: string
  rating: number | null
  group_name: string | null
  role: string
  flavour: string | null
  has_unpriced_part: boolean
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
  is_option: boolean
  /** Part of the offer the total means: the chosen option, or every panel while none is chosen. */
  in_chosen_offer: boolean
  /** Adds to the total. An optional extra never does. */
  counts_in_total: boolean
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
  /** What this offer's optional extras would add if the customer took them all. */
  optional_subtotal: number
  optional_tax: number
  optional_total: number
  chosen_option_label: string | null
  option_count: number
}

/** v_costing_option_totals */
export interface OptionTotals {
  option_label: string
  subtotal: number
  tax: number
  grand_total: number
  optional_subtotal: number
  optional_tax: number
  optional_total: number
  /** The option the costing's total means. */
  is_chosen: boolean
}

/** labour_actuals: hours actually worked, filed against a panel and process type. */
export interface LabourActual {
  id: string
  costing_id: string
  panel_id: string
  process_type: string
  hours: number
  source: 'manual' | 'timesheet'
  note: string | null
  recorded_at: string
}

/** v_panel_labour_variance: what the costing said, against what the shop worked. */
export interface PanelLabourVariance {
  costing_id: string
  panel_id: string
  panel_name: string
  panel_quantity: number
  process_type: string
  process_name: string
  sort_order: number
  estimated_hours: number
  actual_hours: number
  has_actuals: boolean
  entries: number
  last_recorded_at: string | null
  difference_hours: number
  /** Null when there is no estimate to compare with. */
  variance_pct: number | null
  hourly_rate: number
  difference_cost: number
}

/** v_kit_group_labour_variance: the same by kit group, apportioned by the estimate. */
/**
 * Hours recorded against a panel costed at none of that work, which the kit-group
 * report has no estimate to share out (v_panel_labour_unattributed).
 */
export interface UnattributedLabourHours {
  company_id: string
  costing_id: string
  panel_id: string
  panel_name: string
  process_type: string
  process_name: string
  process_sort: number
  hours: number
}

export interface KitGroupLabourVariance {
  company_id: string
  /** Null for kit lines whose library kit has since gone, or which had no group. */
  kit_group_id: string | null
  kit_group_name: string | null
  process_type: string
  process_name: string
  sort_order: number
  jobs: number
  panels: number
  kit_units: number
  estimated_hours: number
  actual_hours: number
  estimated_hours_per_kit: number
  actual_hours_per_kit: number
  variance_pct: number | null
  suggested_hours: number
  /** What the kit group says today; null if the group has no row for this process. */
  standard_hours: number | null
}

export interface CostingHistoryRow {
  id: string
  user_id: string | null
  /** Null when the person has since been removed, or for another company's row. */
  full_name: string | null
  action: string
  details: Record<string, unknown> | null
  at: string
}

// --- quotation -------------------------------------------------------------

/** superseded: another offer against the same enquiry won, so this one is off the table. */
export type QuotationStatus = 'released' | 'sent' | 'won' | 'lost' | 'superseded'

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

/** The costing a quotation was released from: which job, which revision. */
export interface QuotationCostingRef {
  family_id: string
  revision_no: number
  costing_no: string
  enquiry_id: string | null
  title: string
}

/** A quotation with the costing behind it, which is how the list groups them. */
export type QuotationRow = Quotation & { costing: QuotationCostingRef | null }

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
  /** Only bought if the customer takes that extra. */
  is_option: boolean
  /** Belongs to the option being offered as the job. */
  in_chosen_offer: boolean
}

// --- sales analytics (roadmap 3.6) ------------------------------------------

/** v_sales_outcomes: one row per enquiry, what happened to it and what it was worth. */
export interface SalesOutcome {
  company_id: string
  enquiry_id: string
  enquiry_no: string
  title: string
  customer_id: string
  customer_name: string
  received_on: string
  status: EnquiryStatus
  decided_at: string | null
  lost_reason: string | null
  won_quotation_id: string | null
  days_to_decide: number | null
  quotations_released: number
  costing_id: string | null
  costing_no: string | null
  /** The job's ex-VAT subtotal, from the offer that won or the latest one out. */
  value_ex_vat: number | null
  value_band: string
}

/** v_sales_group_outcomes: a job's outcome against each kit group it used. */
export interface SalesGroupOutcome {
  enquiry_id: string
  status: EnquiryStatus
  value_ex_vat: number | null
  kit_group_name: string
  lines: number
  material: number
  labour: number
  hours: number
}

/** v_margin_achieved: the margin quoted against the margin the shop achieved. */
export interface MarginAchieved {
  costing_id: string
  costing_no: string
  revision_no: number
  price_ex_vat: number
  material_cost: number
  labour_quoted: number
  labour_achieved: number
  hours_quoted: number
  hours_achieved: number
  margin_quoted_pct: number | null
  margin_achieved_pct: number | null
  /** How much of the labour is recorded fact rather than estimate. */
  labour_measured_pct: number
}

/** v_sales_pipeline: the jobs still out there. */
export interface SalesPipelineRow {
  enquiry_id: string
  enquiry_no: string
  title: string
  customer_name: string
  status: EnquiryStatus
  received_on: string
  age_days: number
  value_ex_vat: number | null
  value_band: string
  quotations_released: number
  latest_quotation: string | null
  quotation_status: QuotationStatus | null
  sent_at: string | null
  days_left: number | null
  has_run_out: boolean | null
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
  /** The quotation that won the job; null while open, or when it was lost. */
  won_quotation_id: string | null
  lost_reason: string | null
}

/** A file kept with an enquiry: the drawing, the specification, the email. */
export type DocumentEntityType = 'enquiry' | 'costing' | 'quotation' | 'component' | 'supplier_price_list'

/** A file kept with a record (documents, migration 0101). The file itself is in the private `attachments` bucket. */
export interface Document {
  id: string
  company_id: string
  entity_type: DocumentEntityType
  entity_id: string | null
  file_name: string
  path: string
  mime_type: string | null
  size_bytes: number | null
  note: string | null
  /** Filled by the extract-document function; null until then. */
  extracted_text: string | null
  extraction_status: 'pending' | 'done' | 'failed' | 'unsupported'
  /** The reason it failed or was unsupported, or a truncation note when done. */
  extraction_error: string | null
  extracted_at: string | null
  created_at: string
  created_by: string | null
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

// --- the assistant (migrations 0102 to 0104) --------------------------------

export type AssistantEntityType = 'enquiry' | 'costing'
export type ProposalType = 'draft_costing' | 'review' | 'line_change'
export type ProposalStatus = 'open' | 'partially_applied' | 'applied' | 'rejected' | 'expired'

export interface AssistantConversation {
  id: string
  company_id: string
  user_id: string
  entity_type: AssistantEntityType
  entity_id: string
  title: string | null
  tokens_in: number
  tokens_out: number
  cost_usd: number
  created_at: string
  updated_at: string
}

export interface AssistantMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls: { name: string; input: Record<string, unknown> }[] | null
  tool_results: { name: string; is_error: boolean; summary: string }[] | null
  model: string | null
  tokens_in: number | null
  tokens_out: number | null
  latency_ms: number | null
  created_at: string
}

export interface AssistantProposal {
  id: string
  conversation_id: string
  message_id: string | null
  company_id: string
  entity_type: AssistantEntityType
  entity_id: string
  type: ProposalType
  status: ProposalStatus
  payload: ProposalPayload
  applied_by: string | null
  applied_at: string | null
  result: ProposalResult | null
  created_at: string
}

/** What the model cited for a line or a finding (AI spec §6.3). */
export interface Evidence {
  document_id?: string
  page?: number
  quote?: string
}

export interface DraftLine {
  section?: string
  kind: 'kit' | 'component'
  ref_id: string
  name: string
  qty: number
  confidence: 'high' | 'medium' | 'low'
  reason?: string
  evidence?: Evidence
}

export interface DraftPanel {
  name: string
  qty?: number
  parameters?: Record<string, unknown>
  lines?: DraftLine[]
  unresolved?: { text: string; evidence?: Evidence; suggestion?: string }[]
}

export interface LineChange {
  panel_line_item_id?: string
  line_id?: string
  action: 'add' | 'change_qty' | 'remove' | 'set_parameter'
  ref?: string
  qty?: number
  section?: string
  parameter?: string
  value?: unknown
  reason: string
}

export interface ReviewFinding {
  severity: 'blocker' | 'warning' | 'note'
  code: string
  text: string
  evidence?: Evidence
  proposal?: LineChange
}

export type ProposalPayload =
  | { summary?: string; panels?: DraftPanel[]; notes_for_engineer?: string[] }
  | { summary?: string; findings?: ReviewFinding[] }
  | LineChange

export interface ProposalResult {
  costing_id?: string
  created_costing?: boolean
  lines?: Record<string, unknown>[]
  findings_applied?: number[]
  rejected_reason?: string | null
}

/** What app.assistant_allowance() answers. */
export interface AssistantAllowance {
  enabled: boolean
  monthly_token_budget: number
  used_this_month: number
  recent_requests: number
  rate_limit_per_minute: number
}

/** What app.assistant_usage() answers, for the admin screen. */
export interface AssistantUsage {
  months: { month: string; turns: number; tokens_in: number; tokens_out: number; conversations: number }[]
  cost_usd_this_month: number
  by_user_this_month: { user_id: string; name: string | null; turns: number; tokens: number }[]
  proposals: Partial<Record<ProposalStatus, number>>
  allowance: AssistantAllowance
}

/** The six mounting designs of panel-layout-spec.md §3. */
export type MountingDesign =
  | 'busbar_fed'
  | 'mccb_plates'
  | 'side_by_side_plates'
  | 'compensation'
  | 'meter_board_plate'
  | 'inline_3nj6'

export interface CompanyOption {
  id: string
  company_id: string
  key: string
  value: unknown
  value_type: 'boolean' | 'number' | 'text' | 'json'
}

// --- the busbar run calculator (roadmap 4.1) -------------------------------

/** One copper bar size, as v_busbar_bars sees it. */
export interface BusbarBar {
  id: string
  code: string
  width_mm: number | null
  thickness_mm: number | null
  area_mm2: number | null
  kg_per_metre: number | null
  price_per_metre: number | null
  is_priced: boolean
}

/** One bar run: the workbook's CU-OPT1 row. */
export interface BusbarRun {
  label: string
  bar_code: string
  phases: number
  runs_per_phase: number
  length_m: number
  sets: number
  /** What the formula gives. Filled in by the database; absent on a row being typed. */
  metres?: number
}

/** The metres, kilograms and value of one bar size across a schedule. */
export interface BusbarBarTotal {
  bar_code: string
  kg_per_metre: number | null
  price_per_metre: number | null
  metres: number
  kg: number | null
  value: number | null
  is_priced: boolean
}

/** What app.busbar_run_totals answers. */
export interface BusbarTotals {
  runs: BusbarRun[]
  bars: BusbarBarTotal[]
  total_metres: number
  total_kg: number
  total_value: number
  /** Named bars with no price behind them, or null when every bar is priced. */
  unpriced_bars: string | null
}

/** What app.starting_busbar_runs answers: a schedule to correct, not a measurement. */
export interface BusbarStart {
  panel_id: string
  panel: string
  runs: BusbarRun[]
  totals: BusbarTotals
  note: string
}

/** A row of v_panel_busbar_check: asked for against costed. */
export interface BusbarCheckRow {
  panel_id: string
  bar_code: string
  scheduled_m: number
  costed_m: number
  difference_m: number
  kg_per_metre: number | null
  scheduled_kg: number | null
}

/** What app.apply_busbar_runs answers. */
export interface BusbarApplied {
  panel_id: string
  section: string
  sizes: number
  metres: number
  replaced: number
}

// --- the panel layout (roadmap 3.8, stage one) -----------------------------

/** One kit on the panel, as the layout sees it (v_panel_layout_kits). */
export interface LayoutKit {
  costing_assembly_id: string
  panel_id: string
  name: string
  quantity: number
  assembly_id: string
  mounting_design: MountingDesign | null
  module_height_mm: number | null
  positions_per_plate: number | null
  footprint_w_mm: number | null
  rating: number | null
  rating_unit: 'A' | 'KVAR' | null
  /** Whether the library says enough about it to place it at all. */
  is_sized: boolean
}

/** One kit placed on a face of a section. */
export interface LayoutPlacement {
  costing_assembly_id: string
  face: 'front' | 'rear'
  name: string
  slot: number
  height_mm: number | null
  /** Where it sits down the compartment; absent means "under the one above". */
  y_mm?: number
  quantity?: number
  unsized: boolean
}

/** One face of a section. A single-front section has one, the front. */
export interface LayoutFace {
  side: 'front' | 'rear'
  connection: 'front' | 'rear'
  design: MountingDesign | string
  placements: LayoutPlacement[]
}

/** Where a section's outgoing cables run, which decides its plate width. */
export type CableAlley = 'beside' | 'behind'

/** One section of the board. */
export interface LayoutSection {
  name: string
  width_mm: number
  busbar_compartment_mm: number
  access: 'single_front' | 'double_front'
  design: MountingDesign | string
  faces: LayoutFace[]
  /** Added by stage two; a section saved by stage one has none of them. */
  depth_mm?: number
  form?: string
  busbar_side?: 'left' | 'right'
  cable_alley?: CableAlley
}

/** What app.arrange_panel answers. Writes nothing. */
export interface LayoutPlan {
  panel_id: string
  panel: string
  construction: string
  sections: LayoutSection[]
  /** Which rule made each section, in words. */
  explain: { section: string; why: string }[]
  /** Kits the library has not described enough to place. */
  unsized: { name: string; why: string }[]
  kvar: { used: number; limit_per_section: number | null }
  assumed: { device_compartment_mm: number; note: string }
  /** The board's own dimensions, from the construction's lists (stage two). */
  access?: 'single_front' | 'double_front'
  cable_alley?: CableAlley
  depth_mm?: number
  height_mm?: number | null
  base_mm?: number
}

export type LayoutVerdict = 'fits' | 'tight' | 'no_fit' | 'unknown' | 'empty'

/** One face's verdict. A double-front section has two (stage two). */
export interface LayoutFitFace {
  side: 'front' | 'rear'
  connection: 'front' | 'rear'
  design: MountingDesign | string
  used: number
  capacity: number | null
  unit: string
  plate_width_mm: number | null
  unsized: number
  verdict: LayoutVerdict
  why: string
}

/** One section's verdict: the figures of its worst face. */
export interface LayoutFitSection {
  name: string
  design: MountingDesign | string
  width_mm: number
  used: number
  capacity: number | null
  unit: string
  unsized: number
  verdict: LayoutVerdict
  why: string
  /** Added by stage two. */
  depth_mm?: number | null
  access?: 'single_front' | 'double_front'
  cable_alley?: CableAlley
  /** Set when the section is too shallow for the arrangement drawn on it. */
  too_shallow?: string | null
  faces?: LayoutFitFace[]
}

/** What app.layout_fit answers. */
export interface LayoutFit {
  verdict: LayoutVerdict
  sections: LayoutFitSection[]
  section_count: number
  total_width_mm: number
  max_depth_mm?: number | null
}

/** One part mounted on the door rather than inside (v_panel_door_devices). */
export interface LayoutDoorDevice {
  panel_id: string
  costing_assembly_id: string
  kit_name: string | null
  name: string
  code: string
  quantity: number
  width_mm: number | null
  height_mm: number | null
  category_code: string
}

/** Roughly what a panel weighs (v_panel_layout_weight). */
export interface LayoutWeight {
  panel_id: string
  weight_kg: number | null
  without_weight: number
  lines: number
}

/** What app.apply_layout_enclosure answers. */
export interface LayoutEnclosureApplied {
  panel_id: string
  section: string
  kinds: number
  replaced: number
  /** Widths the catalogue cannot supply, named rather than dropped. */
  missing: { width_mm: number; quantity: number; why: string }[]
  wanted: Record<string, number>
}
