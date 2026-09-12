#!/usr/bin/env bash
set -uo pipefail

ORIGIN="${SIM_ORIGIN:-https://sim.animahealth.com}"
INTERVAL="${WATCH_INTERVAL_SECONDS:-60}"
OUT="${WATCH_OUTPUT:-/tmp/anima-dying-patient-watch}"
PDS_PAGES_PER_PASS="${PDS_PAGES_PER_PASS:-20}" # 2,000 patients/minute; full 50k sweep in 25 passes.
PDS_PAGE_SIZE=100
TERMS=(
  "dying" "actively dying" "dead" "died" "deceased" "death" "date of death"
  "end of life" "end-of-life" "last days of life" "terminal" "terminally ill"
  "palliative" "hospice" "comfort care" "DNACPR" "DNR" "ReSPECT" "ADRT"
)
# Match explicit structured keys and clinical language, but not words such as "deadline".
MATCH_RE='(^|[^a-z])(dying|actively dying|dead|died|deceased|death|date of death|end[- ]of[- ]life|last days of life|terminal(ly ill)?|palliative|hospice|comfort care|dnacpr|do not attempt (cardiopulmonary )?resuscitation|respect form|adrt|advance decision)([^a-z]|$)'

if [[ -z "${SIM_KEY:-}" ]]; then
  echo "SIM_KEY is required. Example: SIM_KEY=... $0" >&2
  exit 2
fi
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }
mkdir -p "$OUT/pds-pages"
exec 9>"$OUT/watcher.lock"
flock -n 9 || { echo "A watcher is already running" >&2; exit 2; }

echo "Watching $ORIGIN every ${INTERVAL}s"
echo "Checks: OpenAPI structured fields, indexed patient fields, bulk clinical records, and rotating full PDS scan"
echo "PDS coverage: $((PDS_PAGES_PER_PASS * PDS_PAGE_SIZE)) patients/pass; evidence: $OUT"

# Print every scalar whose key path or value contains an explicit marker.
find_json_matches() {
  local input="$1"
  jq -c --arg re "$MATCH_RE" '
    paths(scalars) as $p
    | {path:($p | map(tostring) | join(".")), value:getpath($p)}
    | select(((.path + " " + (.value | tostring)) | test($re; "i")))
  ' "$input" 2>/dev/null
}

cursor="$(cat "$OUT/pds-cursor" 2>/dev/null || echo 0)"
[[ "$cursor" =~ ^[0-9]+$ ]] || cursor=0

while true; do
  pass_started="$(date +%s)"
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  found=0
  had_error=0
  : > "$OUT/matches.ndjson"

  if ! curl --fail --silent --show-error --max-time 10 \
      "$ORIGIN/healthz" -o "$OUT/health.json"; then
    echo "[$timestamp] simulator unavailable; check inconclusive, retrying next minute" >&2
    sleep "$INTERVAL"
    continue
  fi

  # 1. Detect documented structured fields such as deceasedBoolean, deceasedDateTime,
  # dateOfDeath or a new death/palliative resource/action—even before patients are indexed.
  if curl --fail --silent --show-error --max-time 30 \
      "$ORIGIN/api/openapi.json" -o "$OUT/openapi.json"; then
    if find_json_matches "$OUT/openapi.json" > "$OUT/openapi-matches.ndjson" \
        && [[ -s "$OUT/openapi-matches.ndjson" ]]; then
      echo "[$timestamp] MATCH: death/palliative marker in OpenAPI schema"
      jq -c '{source:"openapi", match:.}' "$OUT/openapi-matches.ndjson" >> "$OUT/matches.ndjson"
      found=1
    fi
  else
    echo "[$timestamp] OpenAPI request failed" >&2
    had_error=1
  fi

  # 2. Inspect the raw directory shape and get the current population size, then search
  # every field documented as indexed: name, ID, conditions, needs and goals.
  population_total=50000
  if curl --fail --silent --show-error --max-time 30 \
      "$ORIGIN/api/sites/gp/patients" \
      -H "Authorization: Bearer $SIM_KEY" -o "$OUT/patient-directory-page.json"; then
    population_total="$(jq -r '.total // 50000' "$OUT/patient-directory-page.json")"
    if find_json_matches "$OUT/patient-directory-page.json" > "$OUT/patient-directory-matches.ndjson" \
        && [[ -s "$OUT/patient-directory-matches.ndjson" ]]; then
      echo "[$timestamp] MATCH: structured marker in raw patient directory"
      jq -c '{source:"patient-directory", match:.}' "$OUT/patient-directory-matches.ndjson" \
        >> "$OUT/matches.ndjson"
      found=1
    fi
  else
    echo "[$timestamp] patient directory request failed" >&2
    had_error=1
  fi
  [[ "$population_total" =~ ^[1-9][0-9]*$ ]] || population_total=50000

  : > "$OUT/patient-search-matches.ndjson"
  for term in "${TERMS[@]}"; do
    safe_term="$(printf '%s' "$term" | tr -cs '[:alnum:]' '_')"
    response="$OUT/search-$safe_term.json"
    if curl --get --fail --silent --show-error --max-time 30 \
        "$ORIGIN/api/sites/gp/patients" \
        -H "Authorization: Bearer $SIM_KEY" \
        --data-urlencode "q=$term" -o "$response"; then
      total="$(jq -r '.total // 0' "$response")"
      if (( total > 0 )); then
        echo "[$timestamp] MATCH: indexed search q=\"$term\" returned $total patient(s)"
        jq -c --arg query "$term" '.items[] | {source:"patient-search", query:$query, patient:.}' \
          "$response" >> "$OUT/patient-search-matches.ndjson"
        found=1
      fi
    else
      echo "[$timestamp] patient search failed for q=\"$term\"" >&2
      had_error=1
    fi
  done
  cat "$OUT/patient-search-matches.ndjson" >> "$OUT/matches.ndjson"

  # 3. Scan global seeded clinical records. This catches narrative terms in notes,
  # discharge summaries and attendances, which /patients full-text search does not index.
  for endpoint in \
      sites/gp/documents \
      sites/hospital/documents \
      sites/hospital/attendances \
      nhs/mesh \
      nhs/scr; do
    safe_endpoint="$(printf '%s' "$endpoint" | tr '/' '_')"
    response="$OUT/bulk-$safe_endpoint.json"
    if curl --fail --silent --show-error --max-time 30 \
        "$ORIGIN/api/$endpoint" -H "Authorization: Bearer $SIM_KEY" -o "$response"; then
      if find_json_matches "$response" > "$OUT/bulk-$safe_endpoint-matches.ndjson" \
          && [[ -s "$OUT/bulk-$safe_endpoint-matches.ndjson" ]]; then
        echo "[$timestamp] MATCH: clinical content in /api/$endpoint"
        jq -c --arg endpoint "/api/$endpoint" \
          '{source:"clinical-bulk", endpoint:$endpoint, match:.}' \
          "$OUT/bulk-$safe_endpoint-matches.ndjson" >> "$OUT/matches.ndjson"
        found=1
      fi
    else
      echo "[$timestamp] bulk endpoint /api/$endpoint failed" >&2
      had_error=1
    fi
  done

  # 4. Rotate through every PDS patient, not just searchable text. This catches standard
  # FHIR active:false, deceasedBoolean/deceasedDateTime, dateOfDeath, and undocumented
  # structured fields. Twenty concurrent pages = 2,000 patients/pass with modest load.
  rm -f "$OUT/pds-pages"/*.json "$OUT/pds-pages"/*.error
  pids=()
  offsets=()
  for ((i=0; i<PDS_PAGES_PER_PASS; i++)); do
    offset=$(( (cursor + i * PDS_PAGE_SIZE) % population_total ))
    offsets+=("$offset")
    (
      curl --get --fail --silent --show-error --max-time 15 \
        "$ORIGIN/api/nhs/pds/Patient" \
        -H "Authorization: Bearer $SIM_KEY" \
        --data-urlencode "_count=$PDS_PAGE_SIZE" \
        --data-urlencode "_offset=$offset" \
        -o "$OUT/pds-pages/$offset.json" \
        || touch "$OUT/pds-pages/$offset.error"
    ) &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do wait "$pid" || true; done

  for offset in "${offsets[@]}"; do
    response="$OUT/pds-pages/$offset.json"
    if [[ -f "$OUT/pds-pages/$offset.error" || ! -s "$response" ]]; then
      had_error=1
      continue
    fi
    # active:false is structured evidence worth flagging even if no death wording exists.
    jq -c --arg re "$MATCH_RE" --argjson offset "$offset" '
      .entry[].resource
      | select(
          .active == false
          or ([
            paths(scalars) as $p
            | select(((($p | map(tostring) | join(".")) + " " + (getpath($p) | tostring)) | test($re; "i")))
          ] | length > 0)
        )
      | {source:"pds-full-scan", offset:$offset, patient:.}
    ' "$response" >> "$OUT/pds-matches.ndjson.tmp"
  done
  if [[ -s "$OUT/pds-matches.ndjson.tmp" ]]; then
    sort -u "$OUT/pds-matches.ndjson.tmp" > "$OUT/pds-matches.ndjson"
    rm -f "$OUT/pds-matches.ndjson.tmp"
    cat "$OUT/pds-matches.ndjson" >> "$OUT/matches.ndjson"
    echo "[$timestamp] MATCH: structured death/inactive field found by full PDS scan"
    found=1
  else
    rm -f "$OUT/pds-matches.ndjson.tmp"
  fi
  cursor=$(( (cursor + PDS_PAGES_PER_PASS * PDS_PAGE_SIZE) % population_total ))
  printf '%s\n' "$cursor" > "$OUT/pds-cursor"

  if (( found )); then
    echo "[$timestamp] UPDATE DETECTED. Evidence saved to $OUT/matches.ndjson"
    exit 0
  elif (( had_error )); then
    echo "[$timestamp] check inconclusive: some requests failed; next PDS offset=$cursor"
  else
    echo "[$timestamp] no death-related update; checked indexed fields, clinical bulk data, and PDS batch; next PDS offset=$cursor"
  fi
  # Keep minute cadence: request time counts toward the interval. If a pass itself
  # exceeds one minute, begin the next pass immediately rather than sleeping again.
  elapsed=$(( $(date +%s) - pass_started ))
  sleep_for=$(( INTERVAL - elapsed ))
  (( sleep_for > 0 )) && sleep "$sleep_for"
done
