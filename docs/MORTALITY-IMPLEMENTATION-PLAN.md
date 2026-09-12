# Three-month mortality pipeline: implementation plan

Agreed direction: deliver a running LLM baseline first, then develop a trained ML engine behind the same input/output contract. Implementation update (12 September 2026): milestones 1–3 now have a running demonstration; see [MORTALITY.md](MORTALITY.md) for commands, examples and limits. The bounded outcome re-audit has not established a labelled cohort, so model fitting/evaluation and ML promotion in milestones 4–5 remain pending. No mortality accuracy or calibration is established.

## Fixed boundaries

Preserve the existing collector record format, the Stage 1 extractor's feature output, and `Stage2AssessmentSchema` as the final conversation-review output. The current frontend `Assessment` is an indicator/ranking contract and cannot represent mortality; do not overload `modelRank`, a review tier, or Stage 2 `confidence` with a death estimate.

There is not yet a mortality input/output schema to preserve. Define and freeze that contract before adding the first engine, then make every engine implement it. Existing external contracts remain compatible; a new screening result is an additional artifact, not a reinterpretation of an existing field.

```text
Existing collector → immutable record snapshot → fixed MortalityInput
                                                   ↓
                                     configurable Stage 1 engine
                                     ├─ full-record LLM baseline
                                     └─ extracted + structured features → trained ML
                                                   ↓
                                         fixed MortalityResult
                                                   ↓
                                  deterministic threshold + durable handoff
                                                   ↓
                                  existing Stage 2 primary + verifier
                                                   ↓
                                    unchanged Stage2AssessmentSchema
```

## Milestone 1 — freeze the mortality contract

Add a shared TypeBox/JSON Schema contract in the Stage 1 module, with TypeScript types and an exported schema for Python. Separate engine estimation from code that applies the threshold. Both the LLM and later tabular engine must satisfy the same contract tests.

**Input:** schema version, screening ID, canonical patient ID, simulation `indexTime`, exact `horizonEnd`, immutable snapshot reference/hash, and record manifest/coverage. The logical input is the full eligible record; a snapshot reference avoids copying the record through every job message. Feature-engineering choices stay inside each engine.

**Output:** schema version, screening/patient IDs, snapshot hash, index/horizon, status (`scored`, `abstained`, `ineligible`, `failed`), nullable `deathProbability3m`, engine/model/prompt/config versions, validation/calibration status, supporting and contradictory source references, missingness/limitations, and nullable error/abstention reasons. A shared wrapper adds the configured threshold, decision (`above_threshold`, `below_threshold`, `not_assessed`) and eventual Stage 2 job linkage. Explanations from an ML model must be labelled model attribution/inference rather than asserted clinical causes.

Rules: probability is finite and in [0,1] only for `scored`; other statuses require null and `not_assessed`. A model refusal or timeout cannot become probability zero. Do not require an outcome estimate when records cannot support one. An existing care plan does not imply low mortality. Stage 2 recommendations and confidence retain their current meaning.

Calculate three calendar months in UTC, preserving time of day and clamping month-end dates. Define the event interval as `(indexTime, horizonEnd]`. Known deaths at or before index time are ineligible for prospective screening, with identity/record uncertainty routed for clarification. For evaluation, count a negative only with verified survival through the horizon; unknown follow-up remains unlabelled/censored.

**Done when:** fixtures validate engine-independent input/output, patient matching, null/error states, horizon boundaries (including leap years/month ends), immutable snapshot references, and TypeScript/Python schema parity. No engine can change identifiers or the prediction interval supplied by the caller.

## Milestone 2 — runnable full-record LLM baseline

Reuse the Stage 1 Pi provider runtime, configurable prompt loading, bounded attempts/timeouts, source validation and artifact writing. Introduce an engine interface such as `estimate(input, config)` and an `llm_record` implementation. Keep the current feature extractor for the later ML path; do not force this baseline through its ten narrative features.

Supply the LLM with all patient-specific clinical content available in the snapshot at `indexTime`: demographics, structured conditions, medications, observations/lab series, encounters, narratives, discharge records, support/context and existing planning. Preserve raw units, dates, resolved/active conflicts, versions and provenance. Reuse collector parsing, then enforce inference-specific availability checks. Separate non-patient capacity context from patient evidence. Outcome labels, future event records, post-index edits, previous model predictions and answer keys must not enter the input.

“Full record” means the complete eligible collected snapshot, not a claim that every service record was retrieved. Record omitted, failed, unsupported and ambiguous sources. If the eligible record exceeds the model's input budget, explicitly abstain with a context-size reason; do not silently truncate or call a summary the full record. More elaborate chunking can be evaluated later.

The prompt asks for the probability of all-cause death during the exact interval, supporting/contradictory evidence and reasons to abstain. It does not ask the LLM to decide whether palliative care is appropriate; Stage 2 handles that question. Patient text remains untrusted data. Require structured submission and validate citations against the frozen record. Quote validity does not prove clinical reasoning correctness.

Persist the numerical output as **an unvalidated LLM estimate**. Do not claim it is a calibrated mortality probability, or calibrate it using the model's own answers. Save raw structured submissions, repair failures, model/config/prompt fingerprints, latency and token usage so later engines can be compared fairly. Keep credentials and raw reasoning traces out of logs.

**Done when:** one CLI/job processes a frozen record into a valid `MortalityResult` using a real model call; demos also exercise insufficient evidence, contradictory information, already-deceased identity, prompt injection and oversized context. Fixture expectations verify software behaviour, not clinical mortality accuracy.

## Milestone 3 — connect the result to the existing workflow

Apply the threshold in deterministic code, outside both engines. Start with an explicitly labelled, configurable demo threshold; its clinical performance remains unknown until outcome-based evaluation. Display the actual threshold and provenance in the internal screening result. Preserve scoring-only operation for experiments.

Above-threshold runs can enqueue through `enqueueStage2Job`. Keep patient-ID-only Stage 2 operation compatible. Add an optional screening reference or a separate linkage artifact, validate the matching patient/snapshot, and persist job IDs. Repeated identical triggers must not create duplicate jobs; if an existing same-patient job is coalesced, retain every screening-to-job association and do not overwrite the original screening input. Recover safely if a process stops between result persistence and queue creation.

Keep the existing two-pass Stage 2 assessment. It reviews whether a timely conversation is appropriate, whether a plan is active, and who owns the action. Its “do not proceed” or “already managed” result is not a negative mortality outcome. Let the primary pass assess source evidence before exposing the numerical estimate where practical, to reduce anchoring. The verifier checks claims, counterevidence and workflow relevance; it cannot validate the future mortality event.

For consistency, initially let Stage 2 reuse the same immutable snapshot. If it refreshes the record, retain both snapshots and identify what changed after screening. Never overwrite the historical screening input. Final recommendations still use the unchanged Stage 2 output schema.

The existing `/api/score` ranking contract remains compatible. Add a separate asynchronous screening entry point/CLI rather than making its existing consumers interpret a new shape. A frontend adapter reads the new screening result, permits additional model-flagged patients beyond the old rule-only gate, and retains rule indicators as context. Show loading, abstained, failed and partial states explicitly. Present demo estimates with engine/validation provenance to clinicians; do not copy them into patient communications automatically.

**Done when:** a synthetic patient goes from record to estimate to threshold decision to one durable Stage 2 job and a cited final assessment. A second case exercises restraint. The UI's existing record/signing/sharing contracts still pass regression tests. Automated scheduling, patient contact and treatment decisions remain outside this milestone.

## Milestone 4 — create the outcome dataset and train the ML alternative

Re-audit the evolving simulator for death event dates and last verified follow-up. Freeze patient index snapshots before outcomes. Link deaths in the three-month interval to label 1 and verified survival through the horizon to label 0; retain unknown/censored cases and report exclusions. The ten previously selected future-death IDs are authored selections, not a labelled mortality cohort. Neither direct LLM estimates nor Stage 2 decisions are ground truth.

When valid labels are available, combine the implemented LLM narrative features with deterministic age, diagnoses, longitudinal lab levels/trends, acute-use counts and missingness. Freeze feature definitions, extraction model/prompt/configuration, units, timing rules and preprocessing. Retain feature-level provenance and distinguish historical, conflicting and undocumented values. Independently evaluate extraction before relying on its output.

Start with a prevalence/simple baseline and regularised logistic regression, then compare gradient boosting. Fit preprocessing on training data only. Use patient-separated splits and additional temporal/template separation where available. Select thresholds on validation data and evaluate held-out sensitivity, precision, false-positive reviewer workload, abstention, calibration/Brier score and uncertainty. Include unlabelled/excluded populations in coverage reporting. Compare with `llm_record` on exactly the same frozen cases without tuning on test results.

If outcomes remain unavailable, continue the LLM workflow demo and authored pipeline tests, explicitly labelled as such. Do not manufacture survival labels, fit to the LLM's guesses or promote synthetic scenario performance as clinical validation.

**Done when:** a versioned model/preprocessing artifact and model card reproduce held-out results, and a Python adapter emits exactly the fixed `MortalityResult` contract. This is an evaluated simulator model when labels are synthetic; real NHS validation is a separate requirement.

## Milestone 5 — swap engines without changing callers

Make engine choice configuration, for example `STAGE1_ENGINE=llm_record|tabular_ml`. Both consume the same snapshot and produce the same result shape. Initially run ML in shadow mode on the same cases, reporting discrepancies, abstention and resource costs. Choose the operating threshold using validation evidence and reviewer capacity, then freeze it before final evaluation. Promote a model based on the agreed evaluation results rather than assuming tabular ML must outperform the LLM baseline.

No changes should be needed to the queue caller, result reader, clinician decision flow or Stage 2 assessment schema. Engine failures must remain explicit; any fallback must record the actual engine used and its validation status rather than disguising one model as another.

## Immediate implementation order

1. Mortality input/output schema and invariant tests.
2. Full-record eligibility/serialization adapter, using the existing collector.
3. Configurable `llm_record` engine and a real example saved to disk.
4. Deterministic threshold and durable Stage 2 linkage, followed by one complete demo journey.
5. Outcome audit, feature dataset and the ML comparison behind the frozen contract.

Milestones 1–3 deliver an operating demonstration. Milestones 4–5 address measured predictive performance and interchangeable implementations. No mortality accuracy, calibration, preparation-time saving, avoided admission or patient benefit is claimed merely because the pipeline runs.
