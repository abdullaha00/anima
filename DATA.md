# Overview

Use data from the Anima simulated environment to estimate a patient's probability of death within the next three months. Stage 1 applies a screening threshold to that estimate. Stage 2 then traverses the health record to assess whether a goals-of-care or palliative-care conversation is appropriate, identifies the responsible care team, and prepares the discussion. An elevated estimate triggers review; it does not establish that a patient is dying or that treatment should be limited.

# Stage 1 - ML
- **Target: all-cause death within three months of the screening time.** Conversation-review appropriateness is a separate Stage 2 evaluation target, not the Stage 1 training label.
- Interpret three months as **three calendar months**, using UTC simulation time. Preserve the time of day and clamp to the final day of the destination month when necessary. Store the exact screening time (`indexTime`) and horizon end (`horizonEnd`); do not silently substitute 90 days.
- **Positive label (`1`):** a verified death event occurs after `indexTime` and on or before `horizonEnd`. Patients already deceased at screening are outside this prospective cohort.
- **Negative label (`0`):** verified survival through `horizonEnd`. A missing death record or incomplete follow-up is unknown, not a negative. Retain follow-up/censoring information and exclude unascertained outcomes from a simple binary training/evaluation set, reporting exclusions.
- LLM preprocessing extracts structured features from free text, retaining source references, dates, negation, uncertainty and missingness. Combine them with available structured data. Features must have been available by `indexTime`; future death events and later record edits belong outside the predictor inputs.
- **Output:** an estimated three-month mortality probability, plus an escalation flag obtained by applying a versioned threshold. Retain patient ID, screening ID, `indexTime`, `horizonEnd`, model/extractor versions, threshold, feature provenance and data-quality status. When the model cannot assess a patient, return an explicit unavailable/abstain result with a reason, not a zero probability or a reassuring negative flag.
- Choose the threshold on validation data to favour sensitivity while measuring precision, false positives and reviewer workload. Freeze it before testing on patient-separated data and, where possible, later times and unseen templates. Assess calibration before interpreting model scores as reliable probabilities. Stage 2 and human review provide further scrutiny but cannot be assumed to catch every error.

## Stage 1 implementation and Stage 2 handoff

A full-record LLM baseline now implements this inference target as an unvalidated demonstration; a trained outcome model is still pending. Existing Python conversation-review and explicit-request classifiers use different labels. The ten selected future-death scenarios are authored selections, not observed three-month outcomes. Preserve their original reports and do not relabel their scores as mortality probabilities.

The configurable LLM narrative extractor is now implemented in `src/lib/stage1/` with a CLI, shared TypeBox schemas, source/time validation and nullable feature output. See [Stage 1 extraction](docs/STAGE1.md) for settings, examples and measured development failures. The full-record LLM mortality engine, fixed input/output schemas, deterministic demo threshold and durable Stage 2 handoff are also implemented. See [Mortality pipeline](docs/MORTALITY.md). Structured feature calculation, outcome-based model fitting and clinically justified threshold selection remain unfinished.

The pulled Stage 2 pipeline accepts a canonical `patientId` through `POST /api/stage2/jobs` and runs collection, primary assessment and independent verification. Its output schema is `Stage2AssessmentSchema` in `src/lib/cairn/types.ts`; `confidence` describes the Stage 2 assessment and is not the Stage 1 mortality probability. `already_managed` and `do_not_proceed` concern the conversation workflow, not proof of survival or a negative mortality label.

Stage 1 persists the screening result, enqueues above-threshold patients with a stable screening-event idempotency key, and retains the job ID. Stage 2 jobs optionally reference a frozen screening snapshot, with durable associations for coalesced jobs. The assessment schema is unchanged. Stage 2 can remain independently runnable by patient ID. An active care plan does not change a mortality label; Stage 2 assesses whether additional planning is needed.

The frontend currently implements rule-based indicators and an optional within-tier ranking contract; `/api/score` returns 501. Its existing prohibition on forecasts describes that implementation and is superseded as a product requirement by this Stage 1 target. The separate mortality contract and full-record LLM inference now feed a threshold-triggered Stage 2 handoff and the `/screening` clinician research view. See `docs/DOMAIN.md` and `docs/STAGE2.md` for the existing interfaces.

# Stage 2 - Agent
- Tool access to record
- Reviews the evidence behind the Stage 1 escalation and whether a conversation is appropriate; it does not verify the future mortality outcome.
- Once confident it identifies to key members of patients care team to involve in the meeting.      
    - This prioritises speed, core members only so the meeting can happen fast
    - Determining ownership is crucial. The patient may be in hospital, at home, care home etc. In the NHS there is no centralised ownership of these decisions. A rare disease pt with a tertiary specialist needs to have the convo with them. A patient with low mobility and QDS care needs a home visit from GP or community care team.
    - It needs to identify the current care baseline support of the patient, this matters a lot, if a patient lives with family or has exisiting carers then it is much easier
    - It should identify the key signals that led to the palliative discussion being required.
    - Identifies any previous opinions or decisions from patient or family regarding end of life. ADRT, DNR etc must be identified and respected. 
    - Prepares notes for the meeting
    - Letter/communications to patient and family drafted...very sensitive and respectful...not scary.
    - Suggest next immediate actions.
    - It should also verify clear false positives or patients who already have a proper palliative/EoL plan in place/in action, ADRT that is ACTIVELY being respected/acted upon (still need to plan the actual palliative initiation for patients if they ADRT but its not being acted upon). Basically patients where it is obvious that a palliative plan would be inappropriate.

# Data availability

## Live simulator inventory (verified 2026-09-12)

The public API currently reports **50,000 synthetic patients** (`GET /api/sites/gp/patients`, `total`; results are paged in groups of 30). This is the available screening cohort, but it is **not 50,000 labelled mortality outcomes or palliative-care evaluation cases**. The patient schema now has an authored synthetic `death` outcome (`date`, `cause`, `synthetic`, `source`), projected by PDS as `deceasedDateTime`. A complete 50,000-patient directory sweep on 2026-09-12 found only **five** deaths: four medically related deaths and one road-traffic collision. A same-time 50,000-patient PDS sweep returned zero `deceasedDateTime` values despite those five directory outcomes, so the PDS death projection is currently inconsistent and must not be used as the mortality inventory. There are still no native palliative-care, hospice, ADRT or DNACPR/ReSPECT outcome labels. The four eligible mortality outcomes and any authored events are useful for pipeline development only; they do not establish clinical mortality accuracy. Clinician-labelled conversation appropriateness evaluates Stage 2 separately.

A team key creates an isolated world over the shared fictional population. Patient-specific additions and workflow changes remain in that world. Site views can contain the same resource in several sites and can also contain non-patient resources; deduplicate by resource `id` and filter on exact `patientId` before counting.

RULE: if data was missing or failed previously still try again, they are likely transient failures.

## Where patient data lives

| Data needed by this system | Primary API/source | Typical representation / notes |
|---|---|---|
| Demographics and age | `GET /api/sites/{site}/patients?q=...`; `GET /api/nhs/pds?patient=...`; read-only `/api/nhs/pds/Patient/{id}` | Patient ID, name, birth date, local IDs; PDS is a simplified adapter/FHIR subset. Derive age relative to simulation time. |
| Conditions and active/resolved problems | Patient directory `conditions`; GP `view` | Directory conditions are strings. GP `problem` resources add status, code and onset; contradictions between the two must be retained. |
| GP consultation narratives | GP `view` | `consultation` resources. New examples can be authored with `save_consultation`. |
| Patient goals and personal context | Patient directory `goals` and `needs`; GP consultations; patient/GP conversations | Goals/needs are structured string arrays; richer social context is usually embedded in text. |
| Carer/family involvement | Directory `needs`; consultations, messages, hospital notes, community records | Not a single normalized relationship table; extract mentions and distinguish patient wishes from relatives' wishes. |
| Contact preferences | PDS/Patient data where present; patient/GP `conversation`; consultations | Often narrative or implied by channel/reply rather than a canonical preference field. |
| Hospital attendance, acuity and presenting complaint | `GET /api/sites/hospital/attendances`; hospital `view` | `hospital-attendance` resources contain stage, acuity, location, arrival and `presentingComplaint`. The dedicated endpoint is not patient-filtered server-side, so filter its returned resources locally. |
| Hospital notes | Hospital `view`; `GET /api/sites/hospital/documents` | `hospital-note` resources have draft/signed stages, sections and addenda. Documents endpoint is not patient-filtered server-side. |
| Discharge summaries | Hospital/GP `view`; hospital and GP `/documents` | `discharge-summary` with reason, course, diagnoses, medication changes, results, follow-up and GP actions. |
| Prescriptions | Pharmacy/hospital/patient `view`; `/api/nhs/eps`; `/api/nhs/eps-tracker` | `prescription` / simplified `MedicationRequest`; copies across sites are the same underlying resource. |
| Tasks | GP and relevant site `view`; `/api/nhs/gp-connect` | `task` / simplified `Task`, including status, priority, owner and due date. |
| Referrals | Referrals and originating site `view`; `/api/nhs/ers` | `referral` resources / simplified e-RS output. |
| Messages between services | Relevant site views; `/api/nhs/mesh`; messaging workspaces | `message` / simplified `Communication`; patient-facing threads are `conversation` resources with entries. |
| Community plans/packages and visits | Community `view` | Community-owned care/visit/task records; `schedule_visit` can add an authored visit. There is no guaranteed dedicated normalized “care package” object for every patient. |
| Beds, discharge barriers and capacity context | Hospital/community/pharmacy `view` | Patient-specific `bed` plus non-patient `capacity` resources. Keep contextual capacity separate from patient evidence. |
| Wearable observations | Wearables `view` | Device/observation data where a patient has it; absence is common and should be represented as missing, not normal. |
| Longitudinal synthetic blood results | Diagnostics `view`; simplified diagnostics adapters | Generated `blood-result`/`DiagnosticReport` records. In the checked deployment the historical synthetic blood series was returned by `/api/nhs/radiology`, despite being blood data; do not rely only on endpoint naming. `/api/nhs/pathology` is for delayed workflow results and can be empty. |
| Radiology/pathology reports | Diagnostics `view`; `/api/nhs/pathology`; `/api/nhs/radiology` | Simplified, non-certified projections; adapters may cap workflow output at 100. Inspect payload kind/description. |
| Appointments | `GET /api/sites/{site}/appointments?date=YYYY-MM-DD`; `/api/nhs/appointments` | Site calendar needs a UTC date; adapter can filter by patient. |
| Allergies | GP `view` | `allergy` resources, active/inactive. |
| Shared-care summaries | `/api/nhs/scr` and shared records in site views | Simplified Shared Care Record projection; may be absent. |
| Organisation/service context | `/api/catalogue`, `/api/nhs/ods`, `/api/nhs/dos` | Service discovery, fictional organisations and directory-of-services data; generally not patient evidence. |

Every workspace resource has common metadata useful for evidence citation: `id`, optional `patientId`, `kind`, `title`, `status`, `owner`, `visibleTo`, `priority`, `createdAt`, optional `dueAt`, kind-specific `data`, `version`, and often `provenance`.

## SIM-000001 volume snapshot

Counts below are **logical entries**, deduplicated by resource ID where the same record is visible in multiple sites. They were read from a fresh isolated team world on 2026-09-12. “Structured value” means an item inside the patient-directory record, not a separate clinical resource.

| Category | Verified count | Detail |
|---|---:|---|
| Demographic patient records | 1 | Birth date `1952-05-12`; derive age from the simulation clock. |
| Conditions | 2 structured values | Heart failure; CKD. Active/resolved GP problem-resource count could not be completed (see API issue below). |
| GP consultation narratives | Not verified | GP full view failed upstream during this audit. |
| Patient goals | 3 structured values | Understand next step; avoid unnecessary travel; stay at home with a clear contact for help. |
| Other structured needs/personal context | 2 structured values | Home visit; carer involvement. |
| Carer/family involvement | 1 structured need, plus uncounted narrative mentions | “Carer involvement”; daughter references live in narrative records and should be counted separately after extraction. |
| Contact preferences | 1 patient conversation containing 2 entries | One outbound email and one inbound SMS; patient says an afternoon appointment works. This is evidence, not a normalized preference field. |
| Hospital attendances | 1 | Breathlessness, acuity 2, waiting room. |
| Presenting complaints | 1 | `Breathlessness` on that attendance (not an additional episode). |
| Patient-specific bed records | 1 | Occupied acute medical bed; barrier is medicines and home monitoring. |
| Hospital notes | Not verified | Hospital full view failed upstream during this audit. |
| Discharge summaries | 2 | Monitoring handover plus cardiology monitoring handover. |
| Prescriptions | 1 | Furosemide discharge supply; EPS and EPS Tracker expose the same `r-3`, so count once. |
| Tasks | 1 | Arrange post-discharge monitoring (`r-2`). |
| Referrals | 0 | e-RS returned zero. |
| Inter-service messages | 2 | Respiratory oxygen-review message (`r-6`) and discharge/medication-handover message (`r-7`). The second is visible in several sites but counts once. |
| Patient-facing conversations | 1 resource / 2 message entries | Appointment-confirmation thread. Keep this separate from inter-service messages. |
| Community care plans/packages | 0 verified dedicated records | Community view contained the shared message and bed, but no separate care-plan/package resource. |
| Wearable observations | 0 | Wearables view was empty. |
| Longitudinal synthetic blood reports | 36 reports | 6 panels × 6 time points: FBC, U&E, HbA1c, LFT, CRP and lipids. Each report contains multiple analytes, so “36 reports” is not “36 scalar measurements.” |
| Appointments | 1 | Booked GP practice follow-up. |
| Shared Care Record entries | 0 | SCR adapter returned zero. |

This gives **47 separately retrievable logical records/resources** for this patient if the patient record, discharge summaries, attendance, bed, prescription, task, 2 inter-service messages, patient conversation, 36 blood reports and appointment are counted once. It becomes **52 top-level evidence items** if the two conditions and three goals inside the directory record are flattened, or **54** if its two needs are flattened too. It becomes larger again if conversation entries and blood analytes are flattened. Always state the counting unit in evaluation reports.

### Audit limitation

During the count, full `gp`, `hospital`, and `diagnostics` site-view calls repeatedly returned HTTP 502, including with `limit=1`. Therefore consultation, problem-status, hospital-note and raw diagnostics-view counts are deliberately marked unverified rather than guessed. The smaller dedicated endpoints and NHS-shaped adapters continued to work. A production collector should use retries/backoff, cache raw snapshots, and report partial coverage explicitly.

## Simulation time and longitudinal evaluation

`GET /api/clock` reads the isolated world's clock and up to 100 recent visible events. `POST /api/clock` accepts `paused`, `speed` (0–3600), and `advanceMinutes` (0–10,080). Thus a deterministic time skip is at most **one week per call**; pause and call repeatedly to test longer ranges. Advancing executes due jobs, but it does not guarantee that every patient acquires new natural-history records or outcomes.

A four-week advance was attempted in the isolated audit world, but the deployment returned HTTP 502 before the first clock mutation completed. No before/after growth statistic is claimed here. Re-run when the service is healthy, snapshot all sites before and after, exact-filter `patientId`, deduplicate IDs, and compare both resource count and resource version/status changes. The small authored death set supplies outcome ground truth, but advancing time still changes an isolated world and must not be treated as a substitute for a frozen retrospective cohort.

## Evaluation-volume recommendation

Use the 50,000-patient directory for retrieval/load tests and screening runs where input coverage permits. For **Stage 1**, assemble index-time snapshots linked to verified three-month death/survival outcomes, retain label provenance and follow-up, and report sensitivity, precision, false-positive workload, abstention and calibration on frozen evaluation data. Explicitly distinguish authored simulator outcomes from observed clinical outcomes; the four medically related deaths cannot support a stable held-out estimate. For **Stage 2**, author a stratified set in isolated worlds (clear positive, clear negative and difficult/contradictory cases), freeze raw API snapshots, and have clinicians label whether a **goals-of-care/palliative-care conversation review** is appropriate. Measure evidence and ownership correctness separately from Stage 1 mortality performance. Do not treat simulator prevalence as clinical prevalence.

## Synthetic mortality model cohort (2026-09-12)

A reproducible 100-patient pipeline-development cohort is in [`data/mortality-cohort/`](data/mortality-cohort/):

- **4 cases** with medically related recorded deaths (cancer, pneumonia, sepsis and stroke);
- **96 living controls** with significant current medical history, including all 33 supplied high-comorbidity IDs;
- `SIM-000009` excluded because its recorded death was caused by a road traffic collision;
- a separate [`cohort-index.csv`](data/mortality-cohort/cohort-index.csv) and [`labels.ndjson`](data/mortality-cohort/labels.ndjson);
- leakage-controlled model inputs at 30, 60 and 90 days before the common matched index date; and
- the uncut [`raw-records.ndjson`](data/mortality-cohort/raw-records.ndjson) for audit only, never direct model input.

Use [`asof-90d.ndjson`](data/mortality-cohort/asof-90d.ndjson) as the primary model input. Cases use their death date as the index date; controls use the same calendar-matched pseudo-index date. Current directory conditions, needs, goals and the death field are omitted from model inputs because the API cannot reconstruct their historical state. Resources created after the cutoff, or changed after it, are also excluded. See the cohort [README](data/mortality-cohort/README.md) and [`manifest.json`](data/mortality-cohort/manifest.json) for exact selection, coverage and limitations. Rebuild with `node scripts/build-mortality-cohort.mjs`.

With only four positive outcomes, use the four provided folds only to debug a leave-one-positive-out training pipeline. Do not claim model quality, clinical validation or generalisability from this cohort. Living controls are right-censored (alive at snapshot), not guaranteed never to die.

## Enriched synthetic mortality cohort

The preserved `data/mortality-cohort/` snapshot is augmented separately in [`data/mortality-cohort-enriched/`](data/mortality-cohort-enriched/). This is **invented synthetic data** for pipeline development, not a live simulator observation, clinical outcome set or validation cohort. The enriched cohort has exactly 100 unique patients: **5 simulator-recorded deaths**, **34 invented authored deaths**, and **61 living controls**. The 39 observed deaths include `SIM-000009`, whose road-traffic-collision cause is retained for audit but marked ineligible; 38 deaths are medically eligible labels.

The builder [`scripts/build-enriched-mortality-cohort.mjs`](scripts/build-enriched-mortality-cohort.mjs) reads the preserved snapshot and embeds the four supplied compact plan artifacts. It performs no API calls and does not mutate the simulator or the preserved cohort. Authored compact events are converted to simulator-shaped resources, then each `asof-{30,60,90}d.ndjson` file applies a per-patient cutoff based on the death date or a deterministic matched control date. Model inputs keep only the row-level `patientId` join key and strip outcomes, generator/audit/source/provenance markers, internal resource IDs and resource-level patient IDs. Run the deterministic checks with:

```bash
node scripts/build-enriched-mortality-cohort.mjs
node scripts/build-enriched-mortality-cohort.mjs --validate
```

See the enriched `README.md` and `manifest.json` for label provenance, target coverage, leakage policy, resource bounds and limitations. The original mortality cohort remains unchanged.

## Historical Stage 2 candidate cohort

Before mortality outcomes were added, the following synthetic patients were selected as high-recall inputs for exercising Stage 2. This remains a test-prioritisation list, **not a mortality prediction or clinical label**.

| Rank | Patient ID | Selection signals |
|---:|---|---|
| 1 | `SIM-000001` | Heart failure and CKD; acute breathlessness (acuity 2); worsening oxygen requirement; urgent post-discharge monitoring; occupied acute bed; furosemide supply. The strongest current deterioration case. |
| 2 | `SIM-000017` | Approximately 96 years old; CKD and asthma; repeated active problems and hospital follow-up; older-person medicine supported discharge with an unacknowledged handover. |
| 3 | `SIM-000011` | Approximately 91; heart failure and hypertension; repeated active disease/hospital-follow-up entries; recent hospital episode and unresolved follow-up task. |
| 4 | `SIM-000036` | Approximately 87; heart failure and asthma; substantial longitudinal problem burden and previous hospital follow-up; urgent rehabilitation discharge handover. |
| 5 | `SIM-000006` | Approximately 83; explicitly coded frailty; acute reduced mobility requiring an AMU bed; previous hospital follow-up and recent renal review. |
| 6 | `SIM-000050` | Approximately 76; CKD, hypertension and arthritis; extensive active-problem/hospital-follow-up history; urgent respiratory assessment discharge. |
| 7 | `SIM-000047` | Approximately 90; CKD, hypertension and arthritis; extensive active-problem history and previous hospital contact; recent hospital handover. |
| 8 | `SIM-000007` | Current inpatient episode for chest discomfort at acuity 2, with repeated previous hospital-follow-up entries. Younger and less chronically unwell, but useful as an acute-event case. |
| 9 | `SIM-000049` | Heart failure and hypertension; repeated active disease and hospital-follow-up entries; recent cardiology monitoring episode. |
| 10 | `SIM-000026` | Approximately 93; diabetes and hypertension; repeated active problems/hospital follow-up; recent respiratory assessment episode. |

Useful alternates are `SIM-000052` (four recorded comorbidities including heart failure, but contradictory GP status) and `SIM-000015` (three comorbidities, carer involvement and recent urgent hospital correspondence).

Only `SIM-000001` currently has a convincing cluster of acute deterioration signals. The remainder are intentionally weaker, high-recall cases and should test whether Stage 2 distinguishes genuine escalation evidence from age or comorbidity alone.


## Current implementation checkpoint

The full-record LLM baseline, durable Stage 1 job/API, automatic threshold routing into the existing two-pass Stage 2 worker, and clinician-reviewed preparation actions are implemented. Input/output contracts remain fixed. The default is GPT-5.6 Sol with low reasoning. See [the integration runbook and fresh batch evidence](docs/MORTALITY.md#integrated-local-backend-12-september-2026). Five fresh patients returned all 27 attempted sources; none crossed the provisional 20% threshold. A separate 1% routing test exercised the full handoff without changing that default. Model estimates remain unvalidated; the fresh sample did not provide verified mortality/survival labels for ML training.
