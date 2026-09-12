#!/usr/bin/env bash
# Rehearses the upgrade that merging `advanced` into `main` will perform on the
# production database, on a database that already holds rows.
#
#   ./supabase/tests/upgrade-rehearsal.sh
#
# Why this exists beside run-local.sh: that script applies every migration to an
# EMPTY database and then loads the seed, which proves the migrations are
# self-consistent. It does not prove they can be applied to a database that is
# already at 0017 and already full of the owner's catalogue, kits, costings and
# quotations — which is exactly what production is, and exactly what the merge
# to `main` will do to it.
#
# So: build production's shape (migrations 0001–0017, then every test written
# before the advanced track, which imports the real data/seed files and builds
# the NPP-192 costing), write down what that database says, apply 0100 onward,
# and refuse any difference.
#
# Needs PostgreSQL binaries on PATH, as run-local.sh does.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"   # the seed import reads data/seed by a path relative to the repository
db="${REHEARSAL_DB:-costmatrix_rehearsal}"

if [[ -n "${PGHOST:-}" || -n "${DATABASE_URL:-}" ]]; then
  dropdb --if-exists "$db"; createdb "$db"
  export PGDATABASE="$db"
else
  export PATH="$PATH:$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)"
  tmp="$(mktemp -d)"
  trap 'pg_ctl -D "$tmp/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
  initdb -D "$tmp/data" -U postgres --auth=trust >/dev/null
  pg_ctl -D "$tmp/data" -o "-p 55433 -k $tmp" -l "$tmp/log" start >/dev/null
  export PGHOST="$tmp" PGPORT=55433 PGUSER=postgres PGDATABASE=postgres
  createdb "$db"; export PGDATABASE="$db"
fi
psql_cmd=(psql -v ON_ERROR_STOP=1 -q -o /dev/null -v bootstrap="$root/supabase/bootstrap.sql")

echo "→ auth shim"
"${psql_cmd[@]}" -f "$root/supabase/tests/00_auth_shim.sql"

# --- What production is today: the basic app's migrations only ----------------
# The split is in the numbering (D-170): the basic track is 00xx, the advanced
# track 01xx, so the two halves of this rehearsal are two globs.
echo "→ building the database production has: migrations 00xx"
for f in "$root"/supabase/migrations/00[0-9][0-9]_*.sql; do
  echo "   $(basename "$f")"
  "${psql_cmd[@]}" -f "$f"
done

# --- and the rows production has ---------------------------------------------
# Every test written before the advanced track. 14 imports the real data/seed
# files through the real importer; 15 builds NPP-192; 10 and 21 release
# quotations. What is left behind is a database that looks like a used one.
echo "→ filling it the way the owner's is filled: tests 00–21"
for f in "$root"/supabase/tests/{0,1,2}[0-9]_*.sql; do
  n="$(basename "$f" | cut -c1-2)"
  case "$n" in 00) continue ;; esac
  [[ "$((10#$n))" -le 21 ]] || continue
  echo "   $(basename "$f")"
  "${psql_cmd[@]}" -f "$f"
done

echo "→ and a released quotation, which no test leaves behind"
"${psql_cmd[@]}" -f "$root/supabase/tests/upgrade-fill.sql"

echo "→ writing down what it says"
"${psql_cmd[@]}" -v phase=before -f "$root/supabase/tests/upgrade-snapshot.sql"

# --- The upgrade the merge will perform --------------------------------------
echo "→ the upgrade: migrations 01xx, in order, as the deploy workflow applies them"
for f in "$root"/supabase/migrations/01[0-9][0-9]_*.sql; do
  echo "   $(basename "$f")"
  "${psql_cmd[@]}" -f "$f"
done

echo "→ reading the same figures again"
"${psql_cmd[@]}" -v phase=after -f "$root/supabase/tests/upgrade-snapshot.sql"

echo "→ comparing"
psql -v ON_ERROR_STOP=1 -q -f "$root/supabase/tests/upgrade-compare.sql"

echo "The upgrade rehearsal passed: every figure identical either side of it."
