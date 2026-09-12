import { supabase } from '../../lib/supabase'
import { functionErrorMessage } from '../../lib/errors'
import type {
  ApprovalRule,
  Company,
  CompanySettings,
  PersonWithRoles,
  Profile,
  UserRole,
} from '../../lib/database.types'

/**
 * Every query and change the admin screens make. Row-level security decides
 * what comes back, so these do not filter by company: asking for "all
 * companies" returns one row for an ordinary user and every row for the master
 * admin, which is exactly what each screen wants to show.
 */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

export async function listCompanies(): Promise<Company[]> {
  const { data, error } = await supabase.from('companies').select('*').order('name')
  fail('Could not load companies', error)
  return (data ?? []) as Company[]
}

export async function getCompany(id: string): Promise<Company | null> {
  const { data, error } = await supabase.from('companies').select('*').eq('id', id).maybeSingle()
  fail('Could not load the company', error)
  return (data as Company) ?? null
}

export async function createCompany(input: {
  name: string
  kind: Company['kind']
  currency_code: string
  currency_label: string
  exchange_rate: number
  discount_pct: number
}): Promise<Company> {
  const { data, error } = await supabase.from('companies').insert(input).select().single()
  fail('Could not create the company', error)
  return data as Company
}

/**
 * Company fields the company itself owns. The discount is deliberately absent:
 * a database trigger refuses it from anyone but the master admin.
 */
export async function updateCompany(
  id: string,
  changes: Partial<
    Pick<
      Company,
      | 'name'
      | 'currency_code'
      | 'currency_label'
      | 'exchange_rate'
      | 'material_margin_pct'
      | 'labour_margin_pct'
      | 'tax_pct'
      | 'price_rounding_step'
      | 'enclosure_uplift_pct'
      | 'quotation_prefix'
      | 'quotation_no_includes_year'
      | 'address'
      | 'tax_pin'
      | 'logo_path'
      | 'is_active'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('companies').update(changes).eq('id', id)
  fail('Could not save the company', error)
}

/** Master admin only; the trigger enforces it whatever the screen shows. */
export async function setCompanyDiscount(id: string, discountPct: number): Promise<void> {
  const { error } = await supabase
    .from('companies')
    .update({ discount_pct: discountPct })
    .eq('id', id)
  fail('Could not set the discount', error)
}

export async function getCompanySettings(companyId: string): Promise<CompanySettings | null> {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()
  fail('Could not load the company settings', error)
  return (data as CompanySettings) ?? null
}

export async function updateCompanySettings(
  companyId: string,
  changes: Partial<CompanySettings>,
): Promise<void> {
  const { error } = await supabase
    .from('company_settings')
    .update(changes)
    .eq('company_id', companyId)
  fail('Could not save the company settings', error)
}

/** People and their roles, joined in the app so the two policies stay simple. */
export async function listPeople(companyId?: string): Promise<PersonWithRoles[]> {
  const profileQuery = supabase.from('profiles').select('*').order('full_name')
  const { data: profiles, error: profilesError } = companyId
    ? await profileQuery.eq('company_id', companyId)
    : await profileQuery
  fail('Could not load people', profilesError)

  const { data: roles, error: rolesError } = await supabase.from('user_roles').select('*')
  fail('Could not load roles', rolesError)

  const rolesByUser = new Map<string, UserRole[]>()
  for (const row of (roles ?? []) as { user_id: string; role: UserRole }[]) {
    rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row.role])
  }

  // How much each person has done, so the screen knows who may still be moved
  // or removed. It is one call for everybody, not one per row.
  let footprints = new Map<string, number>()
  try {
    footprints = await listPersonFootprints()
  } catch {
    // An engineer may not ask; the screen simply shows no such buttons.
  }

  return ((profiles ?? []) as Profile[]).map((profile) => ({
    ...profile,
    roles: rolesByUser.get(profile.id) ?? [],
    records: footprints.get(profile.id),
  }))
}

export async function grantRole(
  userId: string,
  companyId: string,
  role: UserRole,
): Promise<void> {
  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: userId, company_id: companyId, role })
  fail('Could not give that role', error)
}

export async function revokeRole(userId: string, role: UserRole): Promise<void> {
  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role', role)
  fail('Could not remove that role', error)
}

/** People are deactivated, never deleted: their name stays on their costings. */
export async function setPersonActive(userId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId)
  fail('Could not change that person', error)
}

/**
 * Creating a login needs the service role key, which must never reach a
 * browser, so this calls the invite-user Edge Function instead. See
 * supabase/functions/invite-user.
 */
export async function invitePerson(input: {
  email: string
  full_name: string
  company_id: string
  roles: UserRole[]
}): Promise<void> {
  const { error } = await supabase.functions.invoke('invite-user', { body: input })
  if (error) throw new Error(await functionErrorMessage(error, 'Could not send the invitation'))
}

/**
 * Deletes a login, but only for somebody who has done nothing yet; the function
 * checks that in the database first. Everyone else is deactivated.
 */
export async function removePerson(userId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('remove-user', { body: { user_id: userId } })
  if (error) throw new Error(await functionErrorMessage(error, 'Could not remove this person'))
}

/** Master admin only, and only before they have any records. */
export async function movePerson(userId: string, companyId: string): Promise<void> {
  const { error } = await supabase.rpc('move_person', { uid: userId, to_company: companyId })
  fail('Could not move this person', error)
}

/** How many records name each person the caller administers. */
export async function listPersonFootprints(): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('person_footprints')
  fail('Could not count what people have done', error)
  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { user_id: string; records: number }[]) {
    counts.set(row.user_id, Number(row.records))
  }
  return counts
}

// --- logos ---------------------------------------------------------------------

export interface FooterLogo {
  id: string
  company_id: string
  image_path: string
  caption: string | null
  sort_order: number
}

export async function listFooterLogos(companyId: string): Promise<FooterLogo[]> {
  const { data, error } = await supabase
    .from('company_footer_logos')
    .select('*')
    .eq('company_id', companyId)
    .order('sort_order')
  fail('Could not load the footer logos', error)
  return (data ?? []) as FooterLogo[]
}

/** Puts an image in the company's own folder of the private logos bucket. */
export async function uploadLogo(companyId: string, file: File, name: string): Promise<string> {
  const ext = (file.name.split('.').pop() ?? 'png').toLowerCase()
  const path = `${companyId}/${name}-${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('logos')
    .upload(path, file, { contentType: file.type, upsert: false })
  fail('Could not upload the image', error)
  return path
}

export async function addFooterLogo(companyId: string, imagePath: string, caption: string | null, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from('company_footer_logos')
    .insert({ company_id: companyId, image_path: imagePath, caption, sort_order: sortOrder })
  fail('Could not add the footer logo', error)
}

export async function removeFooterLogo(id: string): Promise<void> {
  const { error } = await supabase.from('company_footer_logos').delete().eq('id', id)
  fail('Could not remove the footer logo', error)
}

// --- approval rules (roadmap 2.5) -------------------------------------------

/**
 * The rules that decide whether a costing needs a second pair of eyes. Written
 * by a company administrator; read by everybody, because the costing screen
 * explains itself with them.
 */
export async function listApprovalRules(companyId: string): Promise<ApprovalRule[]> {
  const { data, error } = await supabase
    .from('approval_rules')
    .select('*')
    .eq('company_id', companyId)
    .order('sort_order')
  fail('Could not load the approval rules', error)
  return (data ?? []) as ApprovalRule[]
}

export async function saveApprovalRule(
  rule: Pick<ApprovalRule, 'name' | 'condition' | 'outcome' | 'sort_order' | 'is_active'> & {
    id?: string
    company_id: string
  },
): Promise<void> {
  const { id, ...values } = rule
  const { error } = id
    ? await supabase.from('approval_rules').update(values).eq('id', id)
    : await supabase.from('approval_rules').insert(values)
  fail('Could not save the rule', error)
}

export async function removeApprovalRule(id: string): Promise<void> {
  const { error } = await supabase.from('approval_rules').delete().eq('id', id)
  fail('Could not remove the rule', error)
}
