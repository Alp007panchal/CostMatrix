# CostMatrix web app

React + TypeScript, built by Vite into static files. There is no server of ours: the browser
talks to Supabase directly, and PostgreSQL decides what each person may see.

## Running it locally

```sh
cd web
npm install
cp .env.example .env.local     # fill in from your Supabase project settings → API
npm run dev                    # http://localhost:5173
```

Both values in `.env.local` are public by design — they reach every browser, and row-level
security is what protects the data. The **secret key** (which Supabase used to call the service
role key) must never appear here.

Supabase renamed the browser key from `anon` to **publishable**. The app reads
`VITE_SUPABASE_PUBLISHABLE_KEY`, and falls back to `VITE_SUPABASE_ANON_KEY` for projects created
before the rename.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck` | TypeScript, no output |
| `npm test` | Unit tests |

## How the code is laid out

```
src/
  app/          router, layout shell, route guards
  lib/          Supabase client, table types, formatting helpers
  ui/           small shared pieces and the single stylesheet
  modules/
    auth/       sign in, and the session everything else reads
    admin/      companies, company settings, people and roles
    dashboard/  the home screen
```

Each module owns its queries in `api.ts` and its screens beside it. No file is meant to grow
past a few hundred lines; when one does, split it by screen.

## The rule worth remembering

Route guards and hidden buttons are for tidiness, not safety. Every rule the app applies is
enforced again by row-level security in PostgreSQL, and that is the one that counts. A screen
that forgets to hide a button is untidy; the database still refuses the write.
