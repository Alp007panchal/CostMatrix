#!/usr/bin/env bash
# Builds a throwaway Postgres, applies every migration in order, then runs every
# test file. Used locally and in CI. Any failure stops the script.
#
#   ./supabase/tests/run-local.sh
#
# Needs PostgreSQL binaries on PATH (or in /usr/lib/postgresql/*/bin).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
db="${TEST_DB:-costmatrix_test}"

# Use an existing server if one is configured, else start a temporary one.
if [[ -n "${PGHOST:-}" || -n "${DATABASE_URL:-}" ]]; then
  psql_cmd=(psql -v ON_ERROR_STOP=1 -q -o /dev/null)
  dropdb --if-exists "$db"; createdb "$db"
  export PGDATABASE="$db"
else
  export PATH="$PATH:$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)"
  tmp="$(mktemp -d)"
  trap 'pg_ctl -D "$tmp/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
  initdb -D "$tmp/data" -U postgres --auth=trust >/dev/null
  pg_ctl -D "$tmp/data" -o "-p 55432 -k $tmp" -l "$tmp/log" start >/dev/null
  export PGHOST="$tmp" PGPORT=55432 PGUSER=postgres PGDATABASE=postgres
  createdb "$db"; export PGDATABASE="$db"
  psql_cmd=(psql -v ON_ERROR_STOP=1 -q -o /dev/null)
fi

echo "→ auth shim"
"${psql_cmd[@]}" -f "$root/supabase/tests/00_auth_shim.sql"

for f in "$root"/supabase/migrations/*.sql; do
  echo "→ migration $(basename "$f")"
  "${psql_cmd[@]}" -f "$f"
done

# The seed is development data, not a test, but it must stay loadable: a broken
# seed is a broken `supabase db reset` for everyone.
echo "→ seed.sql"
"${psql_cmd[@]}" -f "$root/supabase/seed.sql"

failed=0
for f in "$root"/supabase/tests/[0-9][0-9]_*.sql; do
  case "$(basename "$f")" in 00_auth_shim.sql) continue ;; esac
  echo "→ test $(basename "$f")"
  if ! "${psql_cmd[@]}" -f "$f"; then failed=1; fi
done

if [[ $failed -ne 0 ]]; then echo "FAILED"; exit 1; fi
echo "All tests passed."
