#!/usr/bin/env bash
#
# Finds, wakes, adopts or creates the "CostMatrix Staging" Supabase project, and
# waits until it is healthy. Run by .github/workflows/create-staging.yml.
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
#   ADOPT_PROJECT_REF            optional: use this existing project as staging
#                                instead of creating one
#   STAGING_NAME                 optional, defaults to "CostMatrix Staging"
#
# Writes ref, region and url to $GITHUB_OUTPUT (and echoes them).

set -euo pipefail

api="https://api.supabase.com"
name="${STAGING_NAME:-CostMatrix Staging}"
out="${GITHUB_OUTPUT:-/dev/null}"

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN is not set}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is not set}"

# Every response body lands here, so that a caller can still read it after a
# failed call — a 400's body is the only thing that explains the 400.
response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

# Supabase puts its explanation in .message. Show that first, in its own words,
# then the whole body, so an unfamiliar failure still explains itself.
say_body() {
  local msg
  msg="$(jq -r '.message // .msg // .error // .error_description // empty' "$response_file" 2>/dev/null || true)"
  if [[ -n "$msg" ]]; then
    echo "Supabase said: $msg"
  fi
  echo "Full response body:"
  cat "$response_file" 2>/dev/null || true
  echo
}

# curl against the Management API. Prints the body on stdout when the call
# succeeded; on any non-2xx reports the status and the body and returns 1,
# because a silent 403 here would otherwise look like "no projects found".
call() {
  local method="$1" path="$2" payload="${3:-}" status
  if [[ -n "$payload" ]]; then
    status="$(curl -sS -o "$response_file" -w '%{http_code}' -X "$method" "$api$path" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
      -H 'Content-Type: application/json' -d "$payload")"
  else
    status="$(curl -sS -o "$response_file" -w '%{http_code}' -X "$method" "$api$path" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")"
  fi
  if [[ "$status" != 2* ]]; then
    echo "::error::$method $path returned HTTP $status" >&2
    say_body >&2
    return 1
  fi
  cat "$response_file"
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

# --- the guard: never the production project ----------------------------------
# Checked before the first write, whichever way the ref was arrived at.
assert_not_production() {
  if [[ "$1" == "$SUPABASE_PROJECT_REF" ]]; then
    echo "::error::Refusing to continue: the staging ref resolved to the production project ($1)." >&2
    echo "Nothing has been changed. Check that the production project is not itself named \"$name\"," >&2
    echo "and that the ref given in \"Use this existing project instead\" is not production's." >&2
    exit 1
  fi
}

# What a project row says about itself, or empty if this account cannot see it.
row_for() { jq -r --arg ref "$1" 'first(.[] | select(.id == $ref)) // empty' <<<"$projects"; }

ref=""
status=""

# --- a project the owner named, if any ----------------------------------------
if [[ -n "${ADOPT_PROJECT_REF:-}" ]]; then
  adopted="$(row_for "$ADOPT_PROJECT_REF")"
  if [[ -z "$adopted" ]]; then
    echo "::error::No project with ref $ADOPT_PROJECT_REF is visible to this access token." >&2
    echo "The projects this account can see:" >&2
    jq -r '.[] | "  \(.name)  [\(.id)]  \(.status)"' <<<"$projects" >&2 || true
    exit 1
  fi
  ref="$ADOPT_PROJECT_REF"
  assert_not_production "$ref"
  status="$(jq -r '.status' <<<"$adopted")"
  region="$(jq -r '.region' <<<"$adopted")"
  echo "Using the project you named: $(jq -r '.name' <<<"$adopted") [$ref], status $status, region $region."
else
  # --- find the staging project, if it exists ---------------------------------
  staging="$(jq -r --arg name "$name" --arg org "$org" \
    'first(.[] | select(.name == $name and .organization_id == $org)) // empty' <<<"$projects")"
  if [[ -n "$staging" ]]; then
    ref="$(jq -r '.id' <<<"$staging")"
    assert_not_production "$ref"
    status="$(jq -r '.status' <<<"$staging")"
    region="$(jq -r '.region' <<<"$staging")"
    echo "Found \"$name\" already: ref $ref, status $status. Reusing it."
  fi
fi

# --- what to say when Supabase refuses to create one --------------------------
explain_create_failure() {
  local msg
  msg="$(jq -r '.message // empty' "$response_file" 2>/dev/null || true)"
  case "$msg" in
    *"free project"* | *"maximum limit"* | *"project limit"*)
      cat >&2 <<'TEXT'

What this means, in plain words
------------------------------
Supabase allows two *active* projects per person on the free plan, and there are
already two. It has refused to create a third. Nothing has been changed, and
nothing is broken.

Three ways forward. The workflow needs no change for any of them:

  1. Pause a project you are not using: Supabase dashboard -> that project ->
     Settings -> General -> Pause project. A paused project stops counting, so
     re-running this workflow will then create the staging project. Leave the
     production project running, of course.
  2. Delete a project you no longer need, the same way.
  3. Upgrade the organisation to a paid plan, which lifts the limit.

Or, if staging should be a project you already have (or one you create by hand
and call anything you like), re-run this workflow and put its project ref in the
"Use this existing project instead" box. It will then adopt that project and
create nothing.
TEXT
      echo "The projects on this account, so you can see which two hold the slots:" >&2
      jq -r '.[] | "  \(.name)  [\(.id)]  \(.status)"' <<<"$projects" >&2 || true
      echo >&2
      ;;
  esac
}

# --- create it if it is not there ---------------------------------------------
if [[ -z "$ref" ]]; then
  : "${SUPABASE_STAGING_DB_PASSWORD:?SUPABASE_STAGING_DB_PASSWORD is not set}"
  echo "Creating \"$name\" in organisation $org, region $region, on the free plan…"
  payload="$(jq -n \
    --arg name "$name" --arg org "$org" --arg region "$region" \
    --arg pass "$SUPABASE_STAGING_DB_PASSWORD" \
    '{name: $name, organization_id: $org, region: $region, db_pass: $pass, plan: "free"}')"
  if ! created="$(call POST /v1/projects "$payload")"; then
    explain_create_failure
    exit 1
  fi
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
    if call POST "/v1/projects/$ref/restore" '{}' >/dev/null; then
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
