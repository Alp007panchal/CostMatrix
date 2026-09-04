// Invites a person, creates their profile and gives them their roles.
//
// This runs on Supabase rather than in the browser because creating a login
// needs the service role key, which bypasses every security rule and must never
// reach a browser. The browser calls this; this checks the caller is allowed to
// invite into that company before it uses the key.
//
// Deploy with:  supabase functions deploy invite-user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type UserRole = 'company_admin' | 'costing_engineer' | 'approver'

interface InviteRequest {
  email: string
  full_name: string
  company_id: string
  roles: UserRole[]
}

const VALID_ROLES: UserRole[] = ['company_admin', 'costing_engineer', 'approver']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return reply({ error: 'Use POST' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return reply({ error: 'The function is missing its environment variables' }, 500)
  }

  // The privileged client. Everything below reads with it deliberately, so the
  // checks do not depend on the caller's own read policies.
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // --- who is asking? ------------------------------------------------------
  // Validating the caller's token directly avoids needing the browser key here,
  // so a key rename on Supabase's side cannot break this function.
  const authorization = request.headers.get('Authorization')
  if (!authorization) return reply({ error: 'Not signed in' }, 401)

  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller.user) return reply({ error: 'Not signed in' }, 401)

  // --- what did they ask for? ---------------------------------------------
  let body: InviteRequest
  try {
    body = await request.json()
  } catch {
    return reply({ error: 'Expected a JSON body' }, 400)
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  const fullName = String(body.full_name ?? '').trim()
  const companyId = String(body.company_id ?? '')
  const roles = Array.isArray(body.roles) ? body.roles.filter((r) => VALID_ROLES.includes(r)) : []

  if (!email.includes('@')) return reply({ error: 'A valid email address is needed' }, 400)
  if (!fullName) return reply({ error: 'A full name is needed' }, 400)
  if (!companyId) return reply({ error: 'A company is needed' }, 400)

  // --- may they? -----------------------------------------------------------
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('company_id, is_master_admin, is_active')
    .eq('id', caller.user.id)
    .maybeSingle()

  if (!callerProfile?.is_active) return reply({ error: 'Your account is not active' }, 403)

  const { data: callerRoles } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', caller.user.id)

  const isCompanyAdmin = (callerRoles ?? []).some((r) => r.role === 'company_admin')
  const allowed =
    callerProfile.is_master_admin ||
    (isCompanyAdmin && callerProfile.company_id === companyId)

  if (!allowed) {
    return reply({ error: 'You may only invite people into your own company' }, 403)
  }

  // --- do it ---------------------------------------------------------------
  const siteUrl = Deno.env.get('SITE_URL') ?? ''
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl ? `${siteUrl}/` : undefined,
  })

  if (inviteError || !invited.user) {
    return reply(
      { error: inviteError?.message ?? 'The invitation could not be sent' },
      inviteError?.status ?? 400,
    )
  }

  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: invited.user.id, company_id: companyId, full_name: fullName, email })

  if (profileError) {
    // The login now exists without a profile, which the app reports as
    // "not added to a company yet" rather than failing mysteriously.
    return reply({ error: `Invitation sent, but the profile failed: ${profileError.message}` }, 500)
  }

  if (roles.length > 0) {
    const { error: rolesError } = await admin
      .from('user_roles')
      .insert(roles.map((role) => ({ user_id: invited.user.id, company_id: companyId, role })))
    if (rolesError) {
      return reply({ error: `Invitation sent, but the roles failed: ${rolesError.message}` }, 500)
    }
  }

  return reply({ ok: true, user_id: invited.user.id }, 200)
})
