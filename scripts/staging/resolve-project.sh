#!/usr/bin/env bash
#
# Finds, wakes or creates the "CostMatrix Staging" Supabase project, and waits
# until it is healthy. Run by .github/workflows/create-staging.yml.
#
# Safe to run again: an existing project of that name is reused, a paused one is
# woken, and a healthy one is left alone. It never touches the production project
# — that is asserted below, before anything is written.
#
# Reads:
#   SUPABASE_ACCESS_TOKEN        a Supabase personal access token (sbp_…)
#   SUPABASE_PROJECT_REF         the PRODUCTION ref: read for its organisation and
#                                region, and used as the ref this must never equal
#   SUPABASE_STAGING_DB_PASSWORD the database password for a newly created project
#   STAGING_NAME                 optional, defaults to "CostMatrix Staging"
#
# Writes ref, region and url to $GITHUB_OUTPUT (and echoes them).

set -euo pipefail

api="https://api.supabase.com"
name="${STAGING_NAME:-CostMatrix Staging}"
out="${GITHUB_OUTPUT:-/dev/null}"

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is not set}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is not set}"

# curl against the Management API. Fails the script on any non-2xx, printing the
# body, because a silent 403 here would otherwise look like "no projects found".
call() {
  local method="$1" path="$2" body="${3:-}"
  local response status
  if [[ -n "$body" ]]; then
    response="$(curl -sS -w '\n%{http_code}' -X "$method" "$api$path" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
      -H 'Content-Type: application/json' -d "$body")"
  else
    response="$(curl -sS -w '\n%{http_code}' -X "$method" "$api$path" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")"
  fi
  status="$(tail -n1 <<<"$response")"
  body="$(sed '$d' <<<"$response")"
  if [[ "$status" != 2* ]]; then
    echo "::error::$method $path returned HTTP $status" >&2
    echo "$body" >&2
    return 1
  fi
  printf '%s' "$body"
}

projects="$(call GET /v1/projects)"

# --- the production project, for its organisation and region -----------------
prod="$(jq -r --arg ref "$SUPABASE_PROJECT_REF" '.[] | select(.id == $ref)' <<<"$projects")"
if [[ -z "$prod" ]]; then
  echo "::error::No project with ref $SUPABASE_PROJECT_REF is visible to this access token." >&2
  echo "Check SUPABASE_PROJECT_REF, and that the token belongs to the right Supabase account." >&2
  exit 1
fi
org="$(jq -r '.organization_id' <<<"$prod")"
region="$(jq -r '.region' <<<"$prod")"
echo "Production project $SUPABASE_PROJECT_REF is in organisation $org, region $region."

# --- find the staging project, if it exists -----------------------------------
staging="$(jq -r --arg name "$name" --arg org "$org" \
  'first(.[] | select(.name == $name and .organization_id == $org)) // empty' <<<"$projects")"

if [[ -n "$staging" ]]; then
  ref="$(jq -r '.id' <<<"$staging")"
  status="$(jq -r '.status' <<<"$staging")"
  echo "Found \"$name\" already: ref $ref, status $status. Reusing it."
else
  ref=""
fi

# --- the guard: never the production project ----------------------------------
# Checked before the first write, and again after creation.
assert_not_production() {
  if [[ "$1" == "$SUPABASE_PROJECT_REF" ]]; then
    echo "::error::Refusing to continue: the staging ref resolved to the production project ($1)." >&2
    echo "Nothing has been changed. Check that the production project is not itself named \"$name\"." >&2
    exit 1
  fi
}
[[ -n "$ref" ]] && assert_not_production "$ref"

# --- create it if it is not there ---------------------------------------------
if [[ -z "$ref" ]]; then
  : "${SUPABASE_STAGING_DB_PASSWORD:?SUPABASE_STAGING_DB_PASSWORD is not set}"
  echo "Creating \"$name\" in organisation $org, region $region, on the free plan…"
  created="$(call POST /v1/projects "$(jq -n \
    --arg name "$name" --arg org "$org" --arg region "$region" \
    --arg pass "$SUPABASE_STAGING_DB_PASSWORD" \
    '{name: $name, organization_id: $org, region: $region, db_pass: $pass, plan: "free"}')")"
  ref="$(jq -r '.id' <<<"$created")"
  [[ -n "$ref" && "$ref" != "null" ]] || { echo "::error::The create call returned no project ref." >&2; exit 1; }
  assert_not_production "$ref"
  echo "Created $ref."
  status="COMING_UP"
fi

# --- wake it if Supabase has paused it ----------------------------------------
# A free-plan project pauses after a week or so of inactivity, and then every
# later step would fail with a connection error. Restoring is one call, but it is
# the least settled part of the Management API, so a failure here prints what to
# press instead of stopping the whole arrangement.
case "$status" in
  INACTIVE | PAUSED | PAUSE_FAILED)
    echo "The project is paused ($status). Asking Supabase to restore it…"
    if call POST "/v1/projects/$ref/restore" '{}' >/dev/null 2>&1; then
      echo "Restore requested."
    else
      echo "::error::Could not restore the project through the API." >&2
      echo "Open https://supabase.com/dashboard/project/$ref, press \"Restore project\"," >&2
      echo "wait until it reports healthy, then run this workflow again." >&2
      exit 1
    fi
    ;;
esac

# --- wait until healthy -------------------------------------------------------
# Polls the list endpoint rather than a per-project one: it is the same call that
# already worked above, so it cannot fail for a different reason here.
echo "Waiting for $ref to come up (up to 15 minutes)…"
healthy=""
for _ in $(seq 1 90); do
  status="$(call GET /v1/projects | jq -r --arg ref "$ref" 'first(.[] | select(.id == $ref) | .status) // "UNKNOWN"')"
  echo "  status: $status"
  case "$status" in
    ACTIVE_HEALTHY) healthy="yes"; break ;;
    INIT_FAILED | RESTORE_FAILED | REMOVED)
      echo "::error::The project reports $status. Look at https://supabase.com/dashboard/project/$ref" >&2
      exit 1 ;;
  esac
  sleep 10
done

if [[ -z "$healthy" ]]; then
  echo "::error::$ref did not become healthy within 15 minutes (last status: $status)." >&2
  echo "This is usually slowness rather than failure: check the dashboard, then run the workflow again." >&2
  echo "It will reuse this project rather than create a second one." >&2
  exit 1
fi

url="https://$ref.supabase.co"
echo "Ready: $ref ($url)"
{
  echo "ref=$ref"
  echo "region=$region"
  echo "url=$url"
} >>"$out"
