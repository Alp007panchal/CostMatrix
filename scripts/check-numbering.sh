#!/usr/bin/env bash
# Refuses a pull request that re-uses a number another one has already taken.
#
# Why this exists rather than a rule in CLAUDE.md: the rule was there, and it
# was broken three times in one week by sessions working in parallel —
# migration 0116 taken twice, decision numbers D-241 to D-244 three times, and
# D-276 to D-278 against the panel-layout work. A convention two sessions must
# both remember is not a mechanism. A red tick is.
#
# The migration case is the dangerous one. Supabase records a migration by its
# number, so a second file carrying a number that has already been applied is
# **silently skipped** — the tables it creates simply never exist, and nothing
# anywhere says so.
#
# Three checks:
#   1. No two migration files share a number.
#   2. No migration this branch adds re-uses a number another branch has taken,
#      and none is numbered below what `origin/main` has already applied. That
#      second half is the 0018 trap: production has recorded 0001-0017 AND
#      0100-0118, so a new 0018 would sort behind eighteen migrations that have
#      already run.
#   3. No two decisions in docs/decisions.md share an id.
#
# Run it anywhere: ./scripts/check-numbering.sh

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

fail=0
note() { printf '%s\n' "$*"; }
problem() { printf '  ✗ %s\n' "$*"; fail=1; }

# --- 1. No two migration files share a number --------------------------------
note "→ migration numbers are unique"
dupes="$(
  for f in supabase/migrations/[0-9][0-9][0-9][0-9]_*.sql; do
    basename "$f" | cut -c1-4
  done | sort | uniq -d
)"
if [[ -n "$dupes" ]]; then
  while read -r n; do
    [[ -n "$n" ]] || continue
    problem "two migrations are numbered $n:"
    for f in supabase/migrations/"$n"_*.sql; do printf '      %s\n' "$(basename "$f")"; done
  done <<<"$dupes"
else
  note "  ✓ $(ls supabase/migrations/[0-9][0-9][0-9][0-9]_*.sql | wc -l | tr -d ' ') migrations, no number used twice"
fi

# --- 2. New migrations: no clash anywhere, nothing below what has run --------
note "→ new migrations clash with nobody, and none sorts below what has run"
if ! git rev-parse --verify --quiet origin/main >/dev/null; then
  note "  – origin/main is not in this clone, so there is nothing to compare against."
  note "    (In CI the database job checks out with fetch-depth: 0 so that it is.)"
else
  self="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"

  # number<TAB>filename, for every migration claimed by a branch that is not
  # ours and not already merged into ours. A branch whose tip is an ancestor of
  # HEAD has no independent claim — its migrations ARE ours, and counting them
  # would make a legitimate run of 0119..0122 look like 0119 clashing with 0122.
  #
  # The ancestry test is necessary and not quite sufficient: a branch we merged
  # can move on afterwards — `advanced` gained a merge of `main` an hour after
  # this branch took it — and it then stops being an ancestor while still
  # carrying copies of the very migrations we are bringing. A claim on a file we
  # already have, under the same name, is not a rival claim either: it is the
  # same migration seen twice. Genuinely foreign files still count, which is what
  # keeps two sessions from both writing 0116.
  ours="$(ls supabase/migrations/[0-9][0-9][0-9][0-9]_*.sql 2>/dev/null | xargs -n1 basename 2>/dev/null | sort -u)"
  elsewhere="$(
    for ref in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin); do
      [[ "$ref" == "origin/HEAD" || "$ref" == "$self" ]] && continue
      git merge-base --is-ancestor "$ref" HEAD 2>/dev/null && continue
      git ls-tree --name-only "$ref" -- supabase/migrations/ 2>/dev/null \
        | sed -n 's#supabase/migrations/\(\([0-9]\{4\}\)_.*\)#\2\t\1#p'
    done | sort -u | awk -F'\t' -v ours="$ours" '
      BEGIN { n = split(ours, a, "\n"); for (i = 1; i <= n; i++) mine[a[i]] = 1 }
      !($2 in mine)'
  )"
  on_main="$(git ls-tree --name-only origin/main -- supabase/migrations/ 2>/dev/null \
    | sed -n 's#supabase/migrations/\([0-9]\{4\}\)_.*#\1#p' | sort)"

  # Two different yardsticks, and the difference is the whole of check 2.
  #
  # A CLASH is measured against every branch: a number is free only if nobody
  # anywhere has taken it. That is what stops two sessions both writing 0116.
  #
  # ORDERING is measured against `origin/main` alone, because that is what has
  # actually been applied. A migration sitting on a branch that has not merged
  # has run nowhere, so it cannot have run *before* yours. Measuring order
  # against it refuses correct work: on 2026-09-14 five branches held 0123 to
  # 0127, each one the next free number when it was written, and the guard
  # refused four of the five for being "below 0127". Only the highest-numbered
  # branch could ever have gone green, and only if it merged first — the exact
  # opposite of the order the numbers ask for.
  #
  # What those higher branches really carry is a merge-order requirement, not a
  # fault, so they are reported as a note underneath and the run stays green.
  applied="$(printf '%s\n' "$on_main" | grep -E '^[0-9]{4}$' | sort | tail -n 1 || true)"
  highest="$(printf '%s\n' "$elsewhere" | cut -f1; printf '%s\n' "$on_main")"
  highest="$(printf '%s\n' "$highest" | grep -E '^[0-9]{4}$' | sort | tail -n 1)"

  if [[ -z "$highest" ]]; then
    note "  – no migrations anywhere yet; nothing to compare against."
  else
    added=0
    mine_new=""
    for f in supabase/migrations/[0-9][0-9][0-9][0-9]_*.sql; do
      name="$(basename "$f")"
      n="${name:0:4}"
      # Already on main, by name? Then it is not new, whatever its number.
      git cat-file -e "origin/main:supabase/migrations/$name" 2>/dev/null && continue
      added=$((added + 1))
      if printf '%s\n' "$on_main" | grep -qx "$n"; then
        problem "$name re-uses number $n, which origin/main has already applied."
      else
        clash="$(printf '%s\n' "$elsewhere" | awk -F'\t' -v n="$n" -v me="$name" \
          '$1 == n && $2 != me { print $2 }' | head -n 1)"
        if [[ -n "$clash" ]]; then
          problem "$name re-uses number $n, which another branch has taken as $clash."
        elif [[ -n "$applied" && "$((10#$n))" -lt "$((10#$applied))" ]]; then
          problem "$name is numbered $n, below $applied which origin/main has already applied."
          problem "    A migration that sorts behind one already recorded is skipped in silence."
          problem "    Use $(printf '%04d' "$((10#$applied + 1))") or higher."
        else
          mine_new="$mine_new$n"$'\n'
        fi
      fi
    done
    lowest_new="$(printf '%s\n' "$mine_new" | grep -E '^[0-9]{4}$' | sort | head -n 1 || true)"
    above=""
    if [[ -n "$lowest_new" ]]; then
      above="$(printf '%s\n' "$elsewhere" | awk -F'\t' -v low="$lowest_new" \
        '$1 != "" && $1+0 > low+0 { print $2 }' | sort -u)"
    fi

    if [[ "$added" -eq 0 ]]; then
      note "  ✓ this branch adds no migration; the highest taken anywhere is $highest"
    elif [[ "$fail" -eq 0 ]]; then
      note "  ✓ $added new, clashing with nothing, none below ${applied:-any applied migration}"
    fi
    if [[ -n "$above" ]]; then
      note ""
      note "  Note, not a fault: these are numbered above this branch and have not merged."
      while read -r m; do [[ -n "$m" ]] && note "      $m"; done <<<"$above"
      note "  Migrations are applied in number order, so this pull request merges BEFORE"
      note "  them. If one of them merges first, come back and renumber this one — the"
      note "  check above will say so, because by then it will have actually run."
    fi
  fi
fi

# --- 3. No two decisions share an id -----------------------------------------
note "→ decision ids are unique"
ids="$(sed -n 's/^| \(D-[A-Za-z0-9-]*\) |.*/\1/p' docs/decisions.md)"
dupe_ids="$(printf '%s\n' "$ids" | sort | uniq -d)"
if [[ -n "$dupe_ids" ]]; then
  while read -r d; do
    [[ -n "$d" ]] || continue
    problem "$d appears $(printf '%s\n' "$ids" | grep -cx "$d") times in docs/decisions.md"
  done <<<"$dupe_ids"
else
  note "  ✓ $(printf '%s\n' "$ids" | grep -c . ) decisions, no id used twice"
fi

if [[ "$fail" -ne 0 ]]; then
  note ""
  note "Numbering clash. Two sessions work on this repository at once, so a number"
  note "is free only if it is free EVERYWHERE — check the open pull requests and the"
  note "remote branches, not just this one. New decisions take a dated id"
  note "(D-YYYY-MM-DD-short-name), which cannot clash at all."
  exit 1
fi

note ""
note "Numbering is clean."
