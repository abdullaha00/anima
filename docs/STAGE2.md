# Stage 2 worker

Stage 2 is independent of Stage 1. Its only required input is a canonical synthetic patient ID such as `SIM-000001`.

## Architecture

- Next.js `POST /api/stage2/jobs` writes a durable queued job.
- A separate persistent Node process polls the queue and runs the Pi SDK.
- The collector snapshots the complete patient record into structured JSON.
- A read-only primary agent prepares the assessment.
- A separate read-only verification agent checks the record again, focusing on false positives and already-active plans.
- Next.js `GET /api/stage2/jobs/{jobId}` returns status and the final result.

Next.js and the worker must run on the same self-hosted machine, or mount the same persistent `CAIRN_DATA_DIR`. This filesystem queue is intentionally the simplest deployment. Move the queue and artifacts to durable object/database storage before deploying Next.js and the worker on separate hosts or serverless infrastructure.

## Configuration

Copy `.env.example` to `.env.local` and set:

- `SIM_KEY`: simulator team bearer key.
- `OPENAI_API_KEY`: model credential used by Pi (or use another provider configured in Pi).
- `CAIRN_MODEL`: optional `provider/model` SDK override, for example `openai/gpt-5.6-sol`.
- `CAIRN_THINKING`: optional thinking override (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`).
- `CAIRN_TRIGGER_TOKEN`: bearer token protecting the HTTP trigger/status endpoints in every environment.
- `CAIRN_TRIGGER_RATE_LIMIT`: accepted POST triggers per minute per Next.js process; defaults to 30.
- `CAIRN_QUEUE_CAPACITY`: maximum queued plus running jobs; defaults to 100.
- `CAIRN_DATA_DIR`: persistent artifact root; defaults to `.cairn`.
- `CAIRN_AGENT_TIMEOUT_MS`: timeout for each agent pass; defaults to 20 minutes.

No retention cleanup runs. Jobs, source snapshots, agent event logs, primary assessments and verified final assessments are retained indefinitely under `.cairn/`, which is gitignored.

## Run directly from the CLI

```bash
npm run stage2 -- SIM-000001
```

The command performs collection and both agent passes immediately.

## Queue and worker

Start the persistent worker:

```bash
npm run stage2:worker
```

Enqueue from another terminal:

```bash
npm run stage2:enqueue -- SIM-000001
```

Run at most one worker against a given filesystem queue. On restart, the worker recovers jobs left in `running`. To process one queued job and exit:

```bash
npm run stage2:worker -- --once
```

For a daemon, run `npm run stage2:worker` under systemd, Docker Compose, ECS, or another process supervisor rather than backgrounding it from Next.js.

## HTTP trigger

```bash
curl -X POST http://localhost:3000/api/stage2/jobs \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $CAIRN_TRIGGER_TOKEN" \
  -H 'idempotency-key: screening-event-123' \
  -d '{"patientId":"SIM-000001"}'

curl http://localhost:3000/api/stage2/jobs/JOB_ID \
  -H "authorization: Bearer $CAIRN_TRIGGER_TOKEN"
```

The POST returns `202 Accepted`. It does not run the agent inside the Next.js request. Reusing an `Idempotency-Key` returns the original job, and an already queued/running job for the same patient is coalesced. Authentication fails closed if `CAIRN_TRIGGER_TOKEN` is missing.

## Artifact layout

```text
.cairn/
  jobs/{queued,running,completed,failed}/<job-id>.json
  runs/<run-id>/
    run.json
    record/
      manifest.json
      clock/simulation.json
      patient/{directory,pds,pds-fhir}.json
      sites/<site>/{patient-resources,service-context,view-metadata}.json
      nhs/*.json
      direct/*.json
      index/{deduplicated-resources,provenance}.json
    analysis/{primary,final}.json
    logs/{pipeline,primary-events,verification-events}.jsonl
```

Site resources are exact-filtered on patient ID. The consolidated index deduplicates resources by `id`, while provenance preserves every source location. Empty data remains empty; failed retrievals are explicit placeholders and are listed in `record/manifest.json`. GET requests use bounded exponential retries. The collector never calls simulator mutation/action endpoints.

## Operational boundaries

- Both agents receive only `read`, `grep`, `find`, `ls`, and the structured submission tool.
- They cannot use shell, edit, or write tools.
- Ambient Pi extensions, skills, templates, context files, themes and appended prompts are disabled; Pi's configured model/auth remains the default.
- Submitted citations are constrained to existing JSON under the run's `record/` directory, and cited record IDs are checked against those files.
- Deterministic collection safety gates force `insufficient_evidence` when identity or patient-specific clinical evidence is absent.
- Stage 2 drafts actions and communications only; it does not schedule meetings, contact patients, or modify clinical records.
- Results include mandatory `humanReviewRequired=true` and `clinicalDecisionSupportOnly=true` fields and must not be treated as autonomous clinical decisions.

## Validation

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Offline fixtures cover cross-patient filtering, unknown response shapes, citations, pass semantics, safety gates, terminal-state recovery, enqueue coalescing/capacity and API authentication.
