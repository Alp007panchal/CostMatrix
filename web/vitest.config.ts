import { defineConfig } from 'vitest/config'

// The assistant's core (supabase/functions/_shared/ai) has no Deno in it on
// purpose, so its tests run here with the fake provider and no API key.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', '../supabase/functions/_shared/ai/**/*.test.ts'],
  },
})
