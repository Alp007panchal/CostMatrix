import { supabase } from '../../lib/supabase'
import type {
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
      | 'quotation_prefix'
      | 'quotation_no_includes_year'
      | 'address'
      | 'tax_pin'
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

  return ((profiles ?? []) as Profile[]).map((profile) => ({
    ...profile,
    roles: rolesByUser.get(profile.id) ?? [],
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
  if (error) throw new Error(`Could not send the invitation: ${error.message}`)
}
