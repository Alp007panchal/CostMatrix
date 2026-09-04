import { createClient } from '@supabase/supabase-js'

const url = import.meta.env['VITE_SUPABASE_URL']
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY']

if (!url || !anonKey) {
  // Failing loudly here beats a blank page and a console full of 401s.
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy web/.env.example to web/.env.local and fill in the two values from ' +
      'your Supabase project settings, then restart the dev server.',
  )
}

// Both values are public by design: they reach every browser. Row-level
// security in Postgres is what protects the data. The service role key must
// never appear in this app.
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})
