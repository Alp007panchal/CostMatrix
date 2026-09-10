#!/usr/bin/env bash
#
# Makes a freshly migrated staging project usable: fetches its API keys, creates
# the first login, makes that person the master administrator with
# supabase/bootstrap.sql, and loads data/seed into the library.
#
# Run by .github/workflows/create-staging.yml, after `supabase db push`.
#
# Safe to run again: the login is reused if it exists, bootstrap.sql changes
# nothing the second time, and the importers report a second run as unchanged.
#
# Reads:
#   SUPABASE_ACCESS_TOKEN        a Supabase personal access token (sbp_…)
#   SUPABASE_STAGING_DB_PASSWORD the staging database password
#   STAGING_REF                  the staging project ref
#   STAGING_REGION               the staging project region, e.g. eu-west-1
#   ADMIN_EMAIL                  the first master administrator's email address
#   ADMIN_NAME                   their name as it appears in the app
#   COMPANY_NAME                 the in-house company to create
#   SEED_LIBRARY                 "true" to load data/seed, anything else to skip
#
# Writes the publishable (anon) key to $GITHUB_OUTPUT. The secret key and the
# database password are masked and never written anywhere.

set -euo pipefail

api="https://api.supabase.com"
out="${GITHUB_OUTPUT:-/dev/null}"

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is not set}"
: "${SUPABASE_STAGING_DB_PASSWORD:?SUPABASE_STAGING_DB_PASSWORD is not set}"
: "${STAGING_REF:?STAGING_REF is not set}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL is not set}"

region="${STAGING_REGION:-eu-west-1}"
admin_name="${ADMIN_NAME:-Master Administrator}"
company_name="${COMPANY_NAME:-Staging Company}"
url="https://$STAGING_REF.supabase.co"

# --- API keys -----------------------------------------------------------------
# Projects created recently return publishable/secret keys; older ones anon and
# service_role. Accept either naming.
keys="$(curl -sS "$api/v1/projects/$STAGING_REF/api-keys" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")"

anon_key="$(jq -r 'first(.[] | select(.name == "anon" or .name == "publishable") | .api_key) // empty' <<<"$keys")"
secret_key="$(jq -r 'first(.[] | select(.name == "service_role" or .name == "secret") | .api_key) // empty' <<<"$keys")"

if [[ -z "$anon_key" || -z "$secret_key" ]]; then
  echo "::error::Could not read the project's API keys. Key names found: $(jq -r '[.[].name] | join(", ")' <<<"$keys")" >&2
  exit 1
fi
# Mask the secret key so it cannot appear in the log even by accident.
echo "::add-mask::$secret_key"
echo "Read the project's API keys."

# --- the first login ----------------------------------------------------------
# Created with a random password that is masked and never printed: the owner sets
# their own with "Forgot password" on the preview URL. So no password for this
# project exists anywhere outside this job.
admin_password="$(openssl rand -base64 24)"
echo "::add-mask::$admin_password"

create_status="$(curl -sS -o /tmp/mkuser.json -w '%{http_code}' -X POST "$url/auth/v1/admin/users" \
  -H "apikey: $secret_key" -H "Authorization: Bearer $secret_key" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$ADMIN_EMAIL" --arg p "$admin_password" \
        '{email: $e, password: $p, email_confirm: true}')")"

if [[ "$create_status" == 2* ]]; then
  echo "Created the login for $ADMIN_EMAIL."
else
  # Already there from an earlier run is the expected case; anything else is not.
  if grep -qi 'already been registered\|already exists\|email_exists' /tmp/mkuser.json; then
    echo "A login for $ADMIN_EMAIL already exists. Reusing it."
  else
    echo "::error::Creating the login failed (HTTP $create_status):" >&2
    cat /tmp/mkuser.json >&2
    exit 1
  fi
fi

admin_uid="$(curl -sS "$url/auth/v1/admin/users?per_page=1000" \
  -H "apikey: $secret_key" -H "Authorization: Bearer $secret_key" \
  | jq -r --arg e "$ADMIN_EMAIL" 'first(.users[] | select((.email | ascii_downcase) == ($e | ascii_downcase)) | .id) // empty')"

if [[ -z "$admin_uid" ]]; then
  echo "::error::The login for $ADMIN_EMAIL was not found after creating it." >&2
  exit 1
fi
echo "Master administrator will be $ADMIN_EMAIL."

# --- a database connection ----------------------------------------------------
# Direct connections (db.<ref>.supabase.co) are IPv6-only on newer projects and
# GitHub's runners have no IPv6, so the pooler is tried first. The pooler host's
# numbering differs between projects, hence the candidates.
enc_password="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' \
  "$SUPABASE_STAGING_DB_PASSWORD")"

db_url=""
for candidate in \
  "postgresql://postgres.$STAGING_REF:$enc_password@aws-0-$region.pooler.supabase.com:5432/postgres" \
  "postgresql://postgres.$STAGING_REF:$enc_password@aws-1-$region.pooler.supabase.com:5432/postgres" \
  "postgresql://postgres:$enc_password@db.$STAGING_REF.supabase.co:5432/postgres"
do
  if psql "$candidate" -q -c 'select 1' >/dev/null 2>&1; then
    db_url="$candidate"
    echo "Connected through ${candidate#*@}" | sed 's/:5432.*//'
    break
  fi
done

if [[ -z "$db_url" ]]; then
  echo "::error::Could not connect to the staging database on any known host." >&2
  echo "The project is up (migrations were applied), so this is the connection string alone." >&2
  echo "Supabase dashboard → Project Settings → Database → Connection string shows the right one;" >&2
  echo "tell me what it looks like (host and port only, never the password) and I will add it." >&2
  exit 1
fi

# --- the master administrator -------------------------------------------------
# supabase/bootstrap.sql is the owner's own script, with three values to fill in
# at the top. Filling them by substitution keeps one copy of the script rather
# than a second, parameterised one that could drift from it.
python3 - "$ADMIN_EMAIL" "$admin_name" "$company_name" <<'PY'
import sys, pathlib
email, name, company = sys.argv[1], sys.argv[2], sys.argv[3]
src = pathlib.Path('supabase/bootstrap.sql').read_text()
for placeholder, value in (("you@yourcompany.com", email),
                           ("Your Name", name),
                           ("Your Company Ltd", company)):
    if placeholder not in src:
        raise SystemExit(
            f"bootstrap.sql no longer contains {placeholder!r}: "
            "update scripts/staging/bootstrap-staging.sh to match it.")
    src = src.replace(placeholder, value.replace("'", "''"), 1)
pathlib.Path('/tmp/bootstrap-staging.sql').write_text(src)
PY

psql "$db_url" -v ON_ERROR_STOP=1 -f /tmp/bootstrap-staging.sql
echo "$ADMIN_EMAIL is the master administrator of $company_name."

# --- the library --------------------------------------------------------------
if [[ "${SEED_LIBRARY:-true}" == "true" ]]; then
  echo "Loading data/seed into the staging library…"
  psql "$db_url" -v ON_ERROR_STOP=1 -v admin_uid="$admin_uid" -f supabase/seed-from-csv.sql
  echo "Library loaded."
else
  echo "Skipping the library seed, as asked."
fi

echo "anon_key=$anon_key" >>"$out"
