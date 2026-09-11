#!/usr/bin/env bash
#
# Prints a working psql connection string for the staging database, and nothing
# else, so the caller can do: db_url="$(./scripts/staging/db-url.sh)"
#
# Direct connections (db.<ref>.supabase.co) are IPv6-only on newer Supabase
# projects and GitHub's runners have no IPv6, so the pooler is tried first. The
# pooler host's numbering differs between projects, hence the candidates.
#
# Reads: STAGING_REF, STAGING_REGION, SUPABASE_STAGING_DB_PASSWORD
#
# Progress goes to stderr; the URL is the only thing on stdout, and it contains
# the password, so never echo it in a workflow step.

set -euo pipefail

: "${STAGING_REF:?STAGING_REF is not set}"
: "${SUPABASE_STAGING_DB_PASSWORD:?SUPABASE_STAGING_DB_PASSWORD is not set}"
region="${STAGING_REGION:-eu-west-1}"

enc_password="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' \
  "$SUPABASE_STAGING_DB_PASSWORD")"

for candidate in \
  "postgresql://postgres.$STAGING_REF:$enc_password@aws-0-$region.pooler.supabase.com:5432/postgres" \
  "postgresql://postgres.$STAGING_REF:$enc_password@aws-1-$region.pooler.supabase.com:5432/postgres" \
  "postgresql://postgres:$enc_password@db.$STAGING_REF.supabase.co:5432/postgres"
do
  if psql "$candidate" -q -c 'select 1' >/dev/null 2>&1; then
    # Host only, no password, so the log says which route worked.
    echo "Connected through $(sed 's/.*@//; s/:5432.*//' <<<"$candidate")" >&2
    printf '%s' "$candidate"
    exit 0
  fi
done

echo "::error::Could not connect to the staging database on any known host." >&2
echo "Supabase dashboard → Project Settings → Database → Connection string shows the right one;" >&2
echo "tell me what it looks like (host and port only, never the password) and I will add it." >&2
exit 1
