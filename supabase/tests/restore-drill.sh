#!/usr/bin/env bash
# Rehearses restoring a backup: dump a full database, restore it into a fresh
# empty one, and refuse any figure that differs.
#
#   ./supabase/tests/restore-drill.sh
#
# "A backup you have never restored is not a backup" is the line in the runbook,
# and until now nothing in the repository could act on it — the weekly dump did
# not exist, so the drill's first step was impossible. The dump exists now
# (.github/workflows/weekly-backup.yml), and this proves the *mechanism*: that a
# `pg_dump` of this schema can be loaded into an empty database and give back the
# same costings, to the cent.
#
# What it does NOT prove is that the owner's real backup restores — only a drill
# against the real dump does that, and the runbook (Part E) says how. This is the
# rehearsal that makes that drill worth attempting.
#
# Reuses figures-snapshot.sql and figures-compare.sql, which already write down
# and compare fourteen figures, so a restore and an upgrade are held to the same
# standard.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
src="${DRILL_DB:-costmatrix_drill_source}"
dst="${DRILL_RESTORE_DB:-costmatrix_drill_restored}"

if [[ -n "${PGHOST:-}" || -n "${DATABASE_URL:-}" ]]; then
  dropdb --if-exists "$src"; dropdb --if-exists "$dst"; createdb "$src"
else
  export PATH="$PATH:$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)"
  tmp="$(mktemp -d)"
  trap 'pg_ctl -D "$tmp/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
  initdb -D "$tmp/data" -U postgres --auth=trust >/dev/null
  pg_ctl -D "$tmp/data" -o "-p 55434 -k $tmp" -l "$tmp/log" start >/dev/null
  export PGHOST="$tmp" PGPORT=55434 PGUSER=postgres PGDATABASE=postgres
  createdb "$src"
fi
psql_src=(psql -v ON_ERROR_STOP=1 -q -o /dev/null -d "$src" -v bootstrap="$root/supabase/bootstrap.sql")

echo "→ building a database worth backing up"
"${psql_src[@]}" -f "$root/supabase/tests/00_auth_shim.sql"
for f in "$root"/supabase/migrations/*.sql; do "${psql_src[@]}" -f "$f"; done
# The tests written before the advanced track leave the owner's real seed, the
# NPP-192 costing and a company's worth of rows behind them.
for f in "$root"/supabase/tests/{0,1,2}[0-9]_*.sql; do
  n="$(basename "$f" | cut -c1-2)"
  case "$n" in 00) continue ;; esac
  [[ "$((10#$n))" -le 21 ]] || continue
  "${psql_src[@]}" -f "$f"
done
"${psql_src[@]}" -f "$root/supabase/tests/figures-fill.sql"

echo "→ writing down what it says"
"${psql_src[@]}" -v phase=before -f "$root/supabase/tests/figures-snapshot.sql"

echo "→ taking the dump"
dump="$(mktemp)"
pg_dump --no-owner --no-privileges -d "$src" > "$dump"
size=$(wc -c < "$dump")
echo "   $size bytes"
if [ "$size" -lt 100000 ]; then
  echo "the dump is $size bytes, which is far too small to be this database" >&2
  exit 1
fi

echo "→ restoring it into an empty database"
createdb "$dst"
# No shim here: the dump carries the auth schema with it, exactly as a real dump
# carries what a real project has. The roles it grants to are cluster-wide and
# already exist; a real restore takes them from the roles.sql the weekly job
# dumps beside the schema.
#
# The restore must not need ON_ERROR_STOP relaxed: a dump that only loads when
# errors are ignored is a dump that restores something other than what was taken.
psql -v ON_ERROR_STOP=1 -q -o /dev/null -d "$dst" -f "$dump"
rm -f "$dump"

echo "→ reading the same figures out of the restored copy"
psql -v ON_ERROR_STOP=1 -q -o /dev/null -d "$dst" -v phase=after \
  -f "$root/supabase/tests/figures-snapshot.sql"

echo "→ comparing"
psql -v ON_ERROR_STOP=1 -q -d "$dst" -f "$root/supabase/tests/figures-compare.sql"

echo "The restore drill passed: the copy says exactly what the original said."
