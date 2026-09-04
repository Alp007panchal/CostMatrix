import { createClient } from '@supabase/supabase-js'

const url = import.meta.env['VITE_SUPABASE_URL']

// Supabase renamed its browser key from "anon" (a long JWT starting eyJ) to
// "publishable" (starting sb_publishable_). Both work; the old name is accepted
// so a project set up before the rename keeps running.
const publishableKey =
  import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ?? import.meta.env['VITE_SUPABASE_ANON_KEY']

if (!url || !publishableKey) {
  // Failing loudly here beats a blank page and a console full of 401s.
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy web/.env.example to web/.env.local and fill in the two values from ' +
      'your Supabase project settings, then restart the dev server.',
  )
}

// Both values are public by design: they reach every browser. Row-level
// security in Postgres is what protects the data. The secret key (formerly the
// service role key) must never appear in this app.
export const supabase = createClient(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})
