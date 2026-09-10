// Removes a person who was added by mistake: their login, profile and roles.
//
// Deliberately narrow. People who have built or approved anything are
// deactivated, never deleted, because their name belongs on that work. This
// only accepts a person with no records at all, which the database confirms
// through app.person_footprint before the login is touched.
//
// It runs on Supabase rather than in the browser because deleting a login needs
// the service role key, which bypasses every security rule and must never reach
// a browser.
//
// Deploy with:  supabase functions deploy remove-user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // --- who is asking? ------------------------------------------------------
  const authorization = request.headers.get('Authorization')
  if (!authorization) return reply({ error: 'Not signed in' }, 401)

  const token = authorization.replace(/^Bearer\s+/i, '')
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller.user) return reply({ error: 'Not signed in' }, 401)

  // --- what did they ask for? ---------------------------------------------
  let userId = ''
  try {
    const body = await request.json()
    userId = String(body.user_id ?? '')
  } catch {
    return reply({ error: 'Expected a JSON body' }, 400)
  }
  if (!userId) return reply({ error: 'A person is needed' }, 400)
  if (userId === caller.user.id) return reply({ error: 'You cannot remove yourself' }, 400)

  // --- may they? -----------------------------------------------------------
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('is_master_admin, is_active')
    .eq('id', caller.user.id)
    .maybeSingle()

  if (!callerProfile?.is_active) return reply({ error: 'Your account is not active' }, 403)
  if (!callerProfile.is_master_admin) {
    return reply({ error: 'Only the master administrator may remove somebody' }, 403)
  }

  const { data: target } = await admin
    .from('profiles')
    .select('full_name, is_master_admin')
    .eq('id', userId)
    .maybeSingle()

  if (!target) return reply({ error: 'No such person' }, 404)
  if (target.is_master_admin) {
    return reply({ error: 'The master administrator cannot be removed' }, 400)
  }

  // --- has this person done anything? --------------------------------------
  const { data: footprint, error: footprintError } = await admin.rpc('person_footprint', {
    uid: userId,
  })

  if (footprintError) {
    return reply({ error: `Could not check their records: ${footprintError.message}` }, 500)
  }
  if ((footprint ?? 0) > 0) {
    return reply(
      {
        error:
          `${target.full_name} already has ${footprint} record(s). ` +
          'Deactivate them instead, so their name stays on their work.',
      },
      409,
    )
  }

  // --- do it ---------------------------------------------------------------
  // profiles.id references auth.users on delete cascade, and user_roles keys on
  // the profile, so deleting the login takes all three rows with it.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError) {
    return reply({ error: deleteError.message }, deleteError.status ?? 400)
  }

  return reply({ removed: true }, 200)
})
