# Stage 1 narrative feature extraction

The next-stage plan is [Three-month mortality implementation](MORTALITY-IMPLEMENTATION-PLAN.md): a full-record LLM baseline first, followed by a trained ML engine using the same mortality input/output contract.

This is the first executable part of the three-month mortality pipeline in `DATA.md`:

```text
Frozen snapshot → scoped narrative passages → LLM extraction → validated features + nullable vector
```

It does not fit or run a mortality model, choose an escalation threshold, enqueue Stage 2, or change simulator records. The initial ten feature definitions are engineering candidates to evaluate, not a clinically validated feature set. GP/community reviewers benefit from traceable descriptions of function, symptoms and support; whether those features improve mortality estimation still needs measurement against valid outcomes.

## Run

Install the repository dependencies with `npm ci`. Configure the chosen provider credential server-side in `.env.local`, for example `OPENAI_API_KEY`. The extractor uses the existing Pi `ModelRuntime`, just as Stage 2 does, but makes a bounded completion request with one submission tool and no filesystem, shell or action tools.

```bash
# Authored example: actual LLM call, no simulator access required.
npm run stage1:extract -- --snapshot test/fixtures/stage1-example.json

# Reuse a record directory already produced by the Stage 2 collector.
npm run stage1:extract -- --record-run .cairn/runs/RUN_ID

# Collect a fresh synthetic patient using the existing collector, then extract.
# Requires SIM_KEY in addition to the model provider credential.
npm run stage1:extract -- --patient SIM-000001

# Inspect exactly which passages would be sent, without calling the LLM.
npm run stage1:extract -- --snapshot test/fixtures/stage1-example.json --prepare-only

# Compare a different prompt/model/configuration in a separate output directory.
npm run stage1:extract -- --snapshot test/fixtures/stage1-example.json \
  --config config/stage1/default.json --prompt prompts/stage1/extract-v1.md \
  --model openai/gpt-5.6-sol --reasoning low --output-root .cairn/stage1-experiments
```

The CLI takes exactly one input option. `--snapshot` accepts an object with `patientId`, ISO `indexTime`, `provenance`, boolean `collectionPartial`, and `records` containing workspace resources. Unexpected top-level fields are rejected; training outcomes belong in a separate file. The committed example documents that it is authored. Each invocation gets a new run directory and preserves previous experiments.

## Configuration and tuning

Edit a copy of `config/stage1/default.json`. Unknown settings, duplicate feature IDs and out-of-range values fail before inference. CLI overrides take priority; model selection falls back through `CAIRN_STAGE1_MODEL`, `CAIRN_MODEL`, then the config. Reasoning can also be set with `CAIRN_STAGE1_REASONING`. Paths inside the config resolve relative to its file; `--prompt` resolves relative to the working directory.

| Setting | Default | What to evaluate |
|---|---|---|
| `features` | Ten named boolean assertions | Definitions, clinically relevant omissions, inter-reviewer agreement; changing these changes the ML input contract |
| `promptFile` | `prompts/stage1/extract-v1.md` | Negation, attribution, ambiguity, temporal language and counterevidence |
| `model` | `openai/gpt-5.6-sol` | Assertion correctness, latency and token use on the same frozen examples |
| `reasoning` | `low` | Accuracy/cost trade-off; `off` omits the explicit reasoning option, so provider defaults apply |
| `temperature` | `null` | Omit by default; set only when the selected provider/model supports temperature. No silent fallback |
| `maxOutputTokens` | 8,000 | Enough room for all features and citations; truncated responses fail |
| `lookbackDays` | 365 | Which dated passages are selected; historical context versus input volume |
| `currentEvidenceDays` | 30 | Maximum age of evidence supporting a current finding; this is a tunable engineering rule, not a clinical cut-off |
| `maxSources` | 100 | Maximum number of whole passages, newest first |
| `maxInputChars` | 60,000 | Budget for serialised source passages, not the entire prompt or a token count |
| `timeoutMs` | 120,000 | Wall-time cap per attempt, including abort on timeout |
| `maxAttempts` | 2 | Bounded retries with backoff; invalid submissions receive a validation correction |
| `version` | `narrative-features-v1.1` | Human-readable definition/configuration version |

The fixed extraction instructions always accompany the configurable guidance. Neither record text nor LLM output can enable extra tools. Provider support varies: the runtime can map reasoning levels to a model's supported levels, and unsupported temperature/request settings can fail. Requested settings, resolved model ID, prompt text, hashes, token usage and attempts are retained. Identical settings do not guarantee identical LLM output. There is currently no result cache or population scheduler; repeated invocations make new model calls.

## Shared contracts and artifacts

`src/lib/stage1/schema.ts` owns TypeBox configuration and submission schemas and their TypeScript types. Each prepared run exports these schemas as JSON in `schemas.json`, so a future Python consumer can validate the same contract. Stage 2 retains its separate assessment schema in `src/lib/cairn/types.ts`.

Artifacts are written atomically below `.cairn/stage1/<run-id>/` (gitignored):

- `input.json`: immutable selected passages, resource IDs/versions, field paths, dates, coverage and exclusions.
- `config.json`: effective configuration, actual prompt text and fixed extraction instructions.
- `schemas.json`: machine-readable configuration and submission schemas.
- `features.json`: validated findings, expanded citations, input/config hashes, completion state and attempt metadata. Failed submissions are retained for inspection and clearly marked rejected; they are never promoted into feature values.
- `vector.json`: feature IDs mapped to `1`, `0` or `null`, with patient/time/hash metadata and completion state.
- `run.json`: prepared, completed, partial, unavailable or failed state. Fresh collection also lives under `collection/`.

`1` means documented present and current; `0` means explicitly absent and current. Historical, uncertain, conflicting and undocumented findings map to `null`. The richer states remain in `features.json` and must be used to distinguish kinds of missingness during model development. A failed/unavailable result must never be treated as a negative screen. `partial` means the extractor returned validated features but coverage/filtering limits remain; `completed` is completion of this extraction, not proof of a complete health record.

Every non-missing finding requires an exact substring quotation from a supplied source. Current present/absent findings additionally require a matching supporting citation within `currentEvidenceDays`. Conflicting findings require opposing evidence. IDs must exactly match the configured feature list, without duplicates or extra fields. These checks establish structural and source correctness; they cannot establish that a quotation logically entails the feature or that the LLM correctly understood it.

## Input boundaries

The adapter reuses the collector's manifest/source files instead of its first-copy-wins index, allowing it to withhold conflicting copies. It checks exact `patientId`, record dates and versions, future edits, nested patient/date boundaries, and source path containment. Identical shared records are deduplicated. Whole passages exceeding the input budget are omitted with explicit counts; text is not silently truncated.

This first extractor supports selected narrative fields in workspace encounters, consultations, hospital notes, discharge summaries, EHR records, referrals, conversations, messages and hospital attendances. It deliberately does not interpret FHIR-only resources, numeric labs, coded condition lists or administrative state as narrative features. Structured feature calculation will be a separate step. Collection is reused, but the input schema can also be produced by a frozen offline exporter.

Time checks cannot prove that every embedded statement existed at a historical index date. A mortality training set needs independently audited feature availability and outcome/follow-up provenance. The three-month outcome window is separate from both the narrative lookback and current-evidence window.

## Example runs, 12 September 2026

Both examples used real calls to `openai/gpt-5-mini` with low reasoning. No mortality estimates were generated and no external clinical actions were performed.

**Authored example:** final run `cb7e1fe9-f878-4190-91d1-2ea50299252e` processed four passages after excluding a different patient's record and a future record. It returned current functional decline, mobility limitation, assistance with daily activities, persistent breathlessness and a documented potentially reversible contributor. It preserved conflicting carer accounts, explicit negatives for reduced intake/weight loss, uncertainty about disease progression and missing falls information. One non-exact citation was rejected; a second submission passed. This is a development demonstration, not an independent extraction benchmark.

**Cached simulator patient SIM-000001:** final run `b2876f66-48c4-48fb-803f-45ea648e0ded` processed 34 passages from a partial cached export (54 source resources; 43 unsupported kinds excluded). An initial run, retained at `7350558d-7baf-4ddc-8dfa-308df912237a`, incorrectly called January walking fatigue a current September finding. That finding prompted the configurable deterministic recency check and a regression test. The final run made no current binary assertions: persistent breathlessness was uncertain because only a presenting complaint was recorded, and the other nine feature definitions were not established. One schema-invalid submission was rejected before acceptance. This demonstrates restraint and repair, not independently measured improvement; fresh cases are needed to evaluate the revised extractor. The cache was not refreshed from the live simulator for this example.

## Verification and next work

Run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build`. Focused Stage 1 tests cover patient/time isolation, duplicate/conflicting copies, outcome-field exclusion, exact quotes, missingness, stale evidence, current versus historical vectors, source containment, configuration validation, retries and timeout failure states. The CLI examples exercise actual provider requests; tests inject a deterministic completion function and do not consume model tokens.

Verification on 12 September: 132 repository tests passed, including 14 Stage 1 tests; TypeScript checks passed. The default build encountered a sandbox font-download failure and then a Turbopack local-port restriction. `npm run build -- --webpack` completed successfully with network access. The language guard was scoped to frontend copy and rendered/browser output so it no longer treats research, worker contracts and server adapter strings as displayed clinical claims.

Next: freeze independently authored/adjudicated assertion cases, measure extraction correctness and abstention by feature (including negation and unseen wording), then tune prompts/configuration on development cases and evaluate once on a held-out set. Measure latency and full token usage alongside accuracy. Build structured feature calculation and the three-month outcome dataset separately, then fit the ML model and connect its screening result to Stage 2. The extractor adds traceability to the existing coordination workflow; it does not establish novelty or clinical benefit on its own.
