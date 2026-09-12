# Three-month mortality pipeline

Implemented 12 September 2026: a full-record LLM estimate, deterministic demo threshold, durable Stage 2 handoff and clinician research view. The LLM estimate is unvalidated and uncalibrated. This does not establish predictive accuracy or patient benefit.

## Run

Use the existing local credentials (`OPENAI_API_KEY` for the default model; `SIM_KEY` for live collection). Secrets stay server-side. The fictional examples below are authored software fixtures, separate from cached simulator records.

```bash
npm run stage1:screen -- --snapshot test/fixtures/mortality-example.json
# Use the Stage 2 job ID printed by screening:
CAIRN_MODEL=openai/gpt-5.6-sol CAIRN_THINKING=low npm run stage2:worker -- --job JOB_ID

npm run stage1:screen -- --snapshot test/fixtures/mortality-insufficient.json
npm run stage1:screen -- --patient SIM-000001
npm run stage1:screen -- --record-run .cairn/runs/COLLECTED_RUN_ID
npm run stage1:screen -- --snapshot INPUT.json --scoring-only
```

Open `/screening` in the running app. All model runs appear independently of the older rule-based worklist. Each detail page shows the interval, estimate or abstention, threshold, partial coverage, expandable exact source quotes, engine fingerprints, Stage 2 status and verified recommendation/owner. These are proposed actions; no booking, patient contact, signing or treatment change is performed by screening.

The existing `/api/score`, frontend indicator types, extractor feature output and `Stage2AssessmentSchema` retain their meanings and shapes. Stage 2 confidence is not a mortality estimate. The UI and result files are the research read path; screening is currently invoked by CLI, not an unauthenticated web mutation.

## Configuration and fixed boundaries

The active defaults are `openai/gpt-5.6-sol` with low reasoning for mortality screening, narrative extraction and both Stage 2 passes. Historical examples below retain their original model provenance.

`config/stage1/mortality.json` controls model, reasoning effort, nullable temperature, output-token limit, timeout, bounded attempts, full-input character budget, prompt file, threshold and threshold basis. CLI overrides: `--config`, `--model`, `--reasoning`, `--prompt`, `--threshold`. `CAIRN_STAGE1_MODEL`/`CAIRN_MODEL` can select the model. Prompt paths resolve relative to the configuration file, while CLI prompt paths resolve from the current directory. The default threshold is **0.20 for demonstration only**. Use JSON `threshold: null` to disable the decision. `--scoring-only` keeps the decision but skips automatic queueing.

`STAGE1_ENGINE=llm_record` is currently the available engine. `tabular_ml` is reserved in the engine-independent contract and covered using a test double, not an installed trained model. Selecting an unavailable engine fails explicitly; there is no hidden fallback.

Contracts live in `src/lib/stage1/mortality-schema.ts`. Export them for Python with:

```bash
node --import tsx scripts/export-mortality-schemas.ts
```

The committed `schemas/*.schema.json` files are generated from TypeBox. Structural validation alone does not enforce all clinical time/identity invariants: callers must also preserve identity, check the snapshot hash, enforce `(indexTime, horizonEnd]`, calculate three calendar months in UTC with month-end clamping, and require null estimates for every non-scored status. `validateMortalityResult` enforces result semantics in TypeScript. Probability zero is never substituted for refusal, timeout or missing data.

Inputs accept the existing extractor snapshot envelope, with an optional `patient` directory entry, or an existing collector directory. Full raw patient-specific records are retained, including structured fields and narrative; this is not restricted to the ten narrative features. Other-patient data, future timestamps/versions, recognised outcome fields and ambiguous duplicate copies are withheld. The full eligible collected snapshot may still have incomplete service coverage. Undocumented historical availability requires independent audit before training; arbitrary outcome facts embedded in prose cannot be eliminated by field filtering alone.

If the full eligible input exceeds the budget, the engine abstains without truncating it. A missing identity or missing clinical resources gates the call. Explicit already-deceased status is ineligible; ambiguous deceased status abstains. Patient text has no authority over the task and only a structured submission tool is available to the mortality engine. Exact scalar quotes and record-relative JSON pointers are validated; this proves source presence, not correctness of clinical reasoning.

## Artifacts and recovery

Each run is stored under `.cairn/screenings/SCREENING_ID/`: `input.json`, `configuration.json`, `prompt.md`, `schemas.json`, `attempts.json`, `result.json`, state and the derived `record/` directory. Inputs retain source paths, excluded-content counts and SHA-256 hashes; attempts retain accepted/rejected structured submissions and token/latency metadata, without raw reasoning. The configurable prompt and non-overridable submission instructions are both fingerprinted. These local patient/model artifacts remain gitignored.

Above-threshold results use the stable idempotency key `screening:SCREENING_ID`. Recover interruption between scoring and handoff without another model call:

```bash
npm run stage1:screen -- --resume SCREENING_ID
```

This also returns an already-completed linked job without creating another. If estimation itself was interrupted before a result was saved, start a new screening from its frozen `--record-run .cairn/screenings/SCREENING_ID`; the old incomplete run remains auditable. The UI reports pending/unavailable states. This recovery command applies to direct CLI runs. Durable jobs now have a continuously running Stage 1 worker, checkpoint recovery and explicit failed-job retries; see the integrated backend section below.

Stage 2 uses the same eligible snapshot. Its record files are derived from verified input, and its linkage records the snapshot hash. It does not receive the numerical Stage 1 estimate. Same-patient queued/running reviews coalesce only when snapshot hash and index time match; every screening keeps a sidecar association. Patient-only Stage 2 jobs still work. Worker recovery requeues interrupted reviews; `--job` processes only the specified queued job. A failed completed job is retained for inspection rather than silently retried by another screening trigger.

## Verified examples

These are individual development runs with `openai/gpt-5-mini`, low reasoning, and a 0.20 demo threshold; repeated model calls can differ. None has an observed mortality label.

| Example | Screening ID | Result | Stage 2 |
| --- | --- | --- | --- |
| Authored advanced-cancer case with reversible-illness and family/patient counterevidence | `e65b23fa-28dc-4c33-8861-cca632262d25` | 0.75, above threshold | Job `f18c5ea2-4a9b-4c74-a131-a3c1d58972e7` completed primary + verifier: `proceed`, verification `confirmed`, proposed owner GP |
| Authored sparse administrative note | `2373ae13-a8a3-4e35-b19f-9c91b79ca216` | Abstained, null estimate | None |
| Previously authorised cached fictional SIM-000001, 54 clinical resources plus directory | `a7dfb28a-5b3b-4ce1-9a9e-39bdc49b38ba` | 0.03, below threshold | None |

The authored high case and cached SIM-000001 reuse an identifier but are **different snapshots**, not a change in one person's measured prognosis. The list displays input provenance to distinguish them. The first two high-case attempts/runs were rejected for malformed citation pointers and scored-result `reason` fields; failed runs remain on disk. Prompt/schema descriptions were clarified without weakening validation. Stage 2 also needed submission repairs; subsequent code now reports precise schema errors and tells the model to omit unknown optional values. Quote matching and a verifier do not establish clinical truth.

## Outcome data and the remaining ML work

The read-only re-audit is saved at `data/exports/mortality-pipeline-probe-20260912`; its reproducible field inventory is `analysis/risk_prediction/mortality-audit-20260912.json`:

```bash
python3 scripts/audit-mortality-labels.py data/exports/mortality-pipeline-probe-20260912 \
  --output analysis/risk_prediction/mortality-audit-20260912.json
```

The bounded views contain 1,690 unique resources and 410 exact patient IDs. Four keyword probes (`palliative`, `deceased`, `dying`, `hospice`) timed out despite bounded retries. Candidate `followUp` text describes arrangements, not verified survival. This is incomplete coverage, not proof that the evolving simulator has no mortality labels.

`mortality-outcomes.ts` defines a separate independently adjudicated registry and tested label function: death during `(indexTime, horizonEnd]` is 1; verified survival through the horizon is 0; inadequate follow-up stays null/censored; deaths at/before index time are ineligible; conflicting observations and patient mismatches fail. A verified death after the horizon proves survival through it. Registry entries must cite their source and adjudicator. No model answer, Stage 2 recommendation or selected future-death ID supplies ground truth.

Still required once usable outcomes are available: cohort assembly and availability audit; deterministic structured features plus the existing narrative extractor; patient-separated train/validation/test and temporal/template checks; train-only preprocessing; prevalence/logistic/boosting comparisons; threshold selection and held-out sensitivity, precision/workload, abstention and calibration; then a versioned ML artifact and shadow comparison on the same snapshots. No fitted model, training metrics or clinical performance is claimed now.

## Verification and service value

Focused tests cover calendar boundaries, label censoring, exact patient scope, future data, duplicate/conflicting records, citation errors, model failure/timeout, threshold boundaries, cross-engine contract compatibility using test doubles, frozen-record tampering, idempotent linkage and interrupted handoff recovery. The existing app regression suite remains applicable. JSON Schema also validated the saved input/result files with Python `jsonschema`. Live examples and browser checks exercise success, below-threshold, abstained and failed displays. Production verification uses `npm run build -- --webpack` because the local default Turbopack build previously hit an environmental restriction.

The intended users are GPs and oncology/community teams dealing with fragmented records and unclear ownership of goals-of-care preparation. The implemented path assembles cited evidence and proposes an owner/team for human review, supporting the project's community-care and digital-information aims. Measure evidence and ownership correctness, reviewer workload and preparation time before claiming an improvement. No NHS clinical validation, avoided admission, measured time saving or novelty comparison is supplied by this demonstration.

## Sol low migration check

The requested default is now `openai/gpt-5.6-sol` with `low` reasoning in both Stage 1 configurations and the shared Stage 2 defaults. Explicit CLI/environment overrides remain available. The existing Pi runtime resolves this model to `openai-responses`; no endpoint, prompt or output-schema changes were needed. The backend retains explicit cache-write token metadata for subsequent mortality attempts, alongside input/output/cache-read counts. See the [official GPT-5.6 guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6) for supported reasoning and API behaviour.

On the unchanged authored fixtures, mortality screening `250ce162-cf3e-4fac-8d62-2b102c236e3a` returned a schema-valid unvalidated 0.78 estimate in one attempt (16.6 seconds), and sparse screening `4af135b1-3ac0-48c2-a2a6-ea4afeb68067` abstained in one attempt (7.1 seconds). The narrative extractor run `c713239a-0d6a-4899-a262-a5c646d03ad7` passed its submission checks on the first attempt (10.9 seconds), retaining the authored fixture's partial-data flag. These smoke checks establish working software paths, not mortality accuracy or a statistically meaningful comparison of models. The full regression suite passed 152 tests, along with lint, typecheck and the webpack production build.

Stage 2 job `05501539-1e9d-49a0-932c-b908c9d32a03` completed both Sol low passes on the same authored snapshot; final recommendation `proceed`, verifier verdict `confirmed`. The primary pass made one accepted submission. No external clinical action was performed.

## Integrated local backend (12 September 2026)

The initial integration used `origin/main` at `ce9af37`; the review branch also incorporates `9ff84ca`, including the front-end team’s ReSPECT form. Screening links and preparation actions sit below the existing care-team panel, followed by the unchanged personal-details, ReSPECT-field and signature components. Public mortality input/result schemas and `Stage2AssessmentSchema` are unchanged. Both model stages use `openai/gpt-5.6-sol` with `low` reasoning by default.

Start the Next.js app and both workers against the same persistent local directories:

```bash
npm run dev -- --port 3100
npm run stage1:worker
npm run stage2:worker
```

Configure server-only `SIM_KEY`, `OPENAI_API_KEY` and `CAIRN_TRIGGER_TOKEN` in `.env.local`. The authenticated API is available in every environment:

- `POST /api/stage1/jobs`, Bearer token, body `{"patientId":"SIM-000001"}`. Optional `Idempotency-Key`. Returns 202 and a polling Location.
- `GET /api/stage1/jobs/{id}`, Bearer token. Returns job status and, on completion, the unchanged mortality result.
- `POST /api/stage1/jobs/{id}`, Bearer token, body `{"action":"retry"}`. Explicitly retries a failed job, up to three job attempts.

`CAIRN_DEMO_ACTIONS=true` explicitly enables the screening and clinician forms using Cairn's existing **demo clinician identity**. This is for the local fictional demonstration; it is not production authentication. It defaults to false in `.env.example`. The HTTP APIs always require the Bearer token. The UI never receives that token. A production service needs verified clinician sessions/roles and deployment access control before enabling these forms.

The worker collects a fresh record, freezes input/configuration, estimates, saves the result and hands above-threshold cases to the existing Stage 2 queue. A single worker lock prevents competing execution on one host. Interrupted jobs resume from saved checkpoints; a handoff retry reuses the estimate and idempotent Stage 2 association. Failed estimates remain failures, never zero-risk results. Initialization uses an atomic directory rename. This is a local-disk backend, not a multi-host distributed queue. Keep `CAIRN_DATA_DIR` and `CAIRN_STATE_DIR` persistent; the web app and workers must use the same repository/configuration. Run the workers under a process supervisor for unattended operation.

The CLI remains compatible. Additional commands:

```bash
npm run stage1:enqueue -- --patient SIM-000001 --key example-run-1
npm run stage1:worker -- --once
npm run stage1:enqueue -- --retry JOB_ID
npm run screening:batch -- --patients SIM-000001,SIM-000003,SIM-000005,SIM-000006,SIM-000010 --stage2
```

A batch saves raw collections, immutable screening inputs/results and `.cairn/batches/{id}/report.json`. Reusing `--id UUID` preserves its per-patient idempotency keys. The collector already performs bounded retries; this is not a second collector.

### Coverage and patient safety at integration boundaries

A hash-bound `coverage.json` sidecar distinguishes authored fixtures, cached snapshots without service verification, saved collections and fresh live collections. The UI gives the source-return count separately from version/date/conflicting-copy exclusions. All 27 sources returning does not prove every service or record is represented. An empty failed-source list in an old fixture does not establish complete coverage.

Authored examples reuse simulator IDs. They remain visible in the screening research view but cannot supply the live patient's Stage 2 review or clinician workflow. The patient reader requires a matching patient/snapshot and fresh-collection provenance for screening-derived reviews. Existing direct Stage 2 and committed demo assessments remain compatible. Source paths and evidence identifiers are preserved when display wording is softened.

### Clinician decision and follow-through

For a completed fresh linked review, open the screening detail and the existing care-team workspace. Assemble/amend the team, then accept, amend or dismiss the review with a reason. Accept/amend requires a named professional owner, preparation action and due date. The action is stored separately from a meeting outcome, with screening ID, snapshot hash, Stage 2 job ID, actor and revision in the audit.

Stale submissions are refused. Amendment updates the same preparation action; dismissal blocks an unfinished action without deleting its history. A completed action cannot be silently reopened. The patient record page displays preparation actions and supports explicit completed/blocked status. The worklist's existing owner/waiting-on display includes these actions. Persistence is read back before the decision form reports success.

These are **Cairn preparation tasks**, not simulator bookings, simulator task writes or sent communications. Those external integrations remain a separate step with explicit clinician approval. Neither an outcome nor a signed care record is fabricated by accepting a screening.

### Verification run

Fresh batch `fc8fac0f-9742-461d-b8a6-4d7f3e6591ed` completed five screenings: SIM-000001, SIM-000003, SIM-000005, SIM-000006 and SIM-000010. All returned 27/27 attempted sources; eligible record counts were 100, 93, 87, 110 and 79. Unvalidated estimates were 8%, 0.15%, 0.15%, 5.5% and 0.1%. All were below the unchanged 20% provisional threshold, so no automatic Stage 2 jobs were expected.

A **separate routing test**, screening `221d0d41-abe9-449a-9e17-0af99425500e`, used an explicitly overridden 1% demo threshold with a fresh SIM-000001 record. Its estimate was 7%. Linked Stage 2 job `435b9a8b-e668-424b-b45c-6160a0ebc340` completed both Sol-low passes; verification revised the recommendation, and the final result supported clinician review while challenging generic care-plan documents as evidence. The default threshold was not changed. This proves routing behaviour, not a useful clinical operating point. The browser workflow saved an explicitly labelled fictional preparation action under the existing demo clinician.

The fresh collection audit found 478 distinct patient-scoped resources across five patients and 11 `followUp` fields, all requiring interpretation/adjudication. These are follow-up plans, not verified survival observations. No mortality labels were generated. Audit the retained collections with `scripts/audit-mortality-labels.py --collection DIRECTORY [--collection DIRECTORY ...] --output FILE`. The conditional ML milestone remains dependent on independently verified death events and survival through the three-calendar-month horizon; do not train on model guesses.

Final integration checks: 165 tests passed, including job idempotency/recovery, record tampering, authored/live isolation, owner validation, stale clinician forms, amendment/dismissal and evidence-identifier preservation. `npm run lint`, `npm run typecheck` and `npm run build -- --webpack` passed. The browser-created job completed; the running API returned 401 without credentials and 200 with the server-side token. A browser save and a fresh patient-page read verified the fictional preparation action and audit, with no meeting outcome created.


## Front-end review handoff

The review branch is `codex/mortality-pipeline-integration`, based on shared main through `9ff84ca` (ReSPECT form). Review the branch against `main`; the merge retains the front-end team's six-section record layout and wording fixes.

The integration points are intentionally small: the shell links to `/screening`; `RecordReview` links a verified Stage 2 review back to its screening; the ReSPECT page renders the existing team and form plus `PreparationSection`; and `CaseState` gains optional `screeningReviews` and `preparationSteps`. The three-month input/result and Stage 2 assessment contracts have not changed. Authored fixtures cannot populate a live patient’s review or ReSPECT drafts through the screening reader. The existing rule-based worklist remains distinct from the all-screenings research list.

Start review at `src/app/screening/`, `src/components/screening/`, and `src/lib/stage1/`. The UI's local-demo server actions and the Bearer-authenticated job API both call the same queue. Existing cases need no migration for the added optional fields. Keep the clinician confirmation and source checks when restyling these controls. Preparation actions are separate from both ReSPECT signatures and simulator writes.

The branch includes authored test fixtures and the runbook, but no newly collected simulator snapshots, credentials, model-call logs or local case state. Historical run IDs in this guide refer to local verification artifacts and will not produce populated screens on a fresh checkout. Configure server-side credentials and use the documented CLI or fresh-screening button to generate review data. The summary of earlier live checks is retained as development evidence, not a bundled clinical dataset.

Post-merge verification against `9ff84ca`: 167 tests, lint, typecheck and the production webpack build passed. The merged ReSPECT page was also checked in the browser: the linked screening, owned preparation action, personal details, form sections and signatures render together.
