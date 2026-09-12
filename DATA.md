# Overview

This describes how we use data input from wide range of sources in the anima simulated environment to create initially a signal, using ML methods, that flags a patient is likely to die and needs a conversation about palliative care with their team. This then triggers a second stage, an agent traverses the health record and verifies this is an appropriate decision. It then identifies key members of care team who need to be involved and organises and prepares a discussion.

# Stage 1 - ML
- LLM preprocessing to generates features from free text.
- Then a ML model to output a signal 
- Define a threshold for escalation
- We lean towards sensitivity over specificity, minimise FN, Stage 2 + human review will catch FP.

# Stage 2 - Agent
- Tool access to record
- Verifies the Stage 1 output
- Once confident it identifies to key members of patients care team to involve in the meeting.      
    - This prioritises speed, core members only so the meeting can happen fast
    - Determining ownership is crucial. The patient may be in hospital, at home, care home etc. In the NHS there is no centralised ownership of these decisions. A rare disease pt with a tertiary specialist needs to have the convo with them. A patient with low mobility and QDS care needs a home visit from GP or community care team.
    - It needs to identify the current care baseline support of the patient, this matters a lot, if a patient lives with family or has exisiting carers then it is much easier
    - It should identify the key signals that led to the palliative discussion being required.
    - Identifies any previous opinions or decisions from patient or family regarding end of life. ADRT, DNR etc must be identified and respected. 
    - Prepares notes for the meeting
    - Suggest next immediate actions.

# Data availability

## Live simulator inventory (verified 2026-09-12)

The public API currently reports **50,000 synthetic patients** (`GET /api/sites/gp/patients`, `total`; results are paged in groups of 30). This is the available screening cohort, but it is **not 50,000 labelled palliative-care evaluation cases**. There are no native mortality, palliative-care, hospice, ADRT, DNACPR/ReSPECT, or death-outcome labels. THESE ARE COMING DONT WORRY, the simulation is being updated with dying patients/dead.!! Performance claims therefore require an authored and clinician-labelled subset.

A team key creates an isolated world over the shared fictional population. Patient-specific additions and workflow changes remain in that world. Site views can contain the same resource in several sites and can also contain non-patient resources; deduplicate by resource `id` and filter on exact `patientId` before counting.

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

A four-week advance was attempted in the isolated audit world, but the deployment returned HTTP 502 before the first clock mutation completed. No before/after growth statistic is claimed here. Re-run when the service is healthy, snapshot all sites before and after, exact-filter `patientId`, deduplicate IDs, and compare both resource count and resource version/status changes. Because there is no death/prognosis ground truth, time advancement tests workflow behavior and delayed results—not mortality-prediction accuracy.

## Evaluation-volume recommendation

Use the 50,000-patient directory for high-recall screening and retrieval/load tests. For quality evaluation, author a stratified labelled set in isolated worlds (clear positive, clear negative and difficult/contradictory cases), freeze raw API snapshots, and have clinicians label whether a **goals-of-care/palliative-care conversation review** is appropriate. Report patient-level sensitivity, specificity/precision, abstention and evidence-citation accuracy separately; do not treat simulator prevalence as clinical prevalence.