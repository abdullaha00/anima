# Project state

Status: scope agreed; standard Next.js/TypeScript application scaffold created. Clinical functionality has not been implemented.

Last updated: 12 September 2026.

## Purpose

Build a clinician-facing tool that aggregates patient records and metrics to flag possible worsening infection despite antibiotic treatment. The intended use is to help a clinician recognise a concerning trajectory that may be difficult to see when evidence is scattered across consultations, prescriptions, laboratory results and care settings.

The hackathon prototype will demonstrate evidence assembly and explainable review flags using NHS-SIM synthetic records. It will not claim to predict death, diagnose sepsis, or provide a validated clinical risk score.

## Agreed use case

A patient has been prescribed antibiotics for an infection. Later records suggest persistent or worsening symptoms, repeat presentations, or concerning changes in recorded measurements. Relevant information may exist in different systems or at different times. A clinician needs a consolidated view to decide whether reassessment is necessary.

The chosen focus is infection worsening despite antibiotic treatment. Detecting an unrelated underlying illness initially mistaken for an infection is outside the initial scope.

Antibiotic exposure alone is not a reason to flag a patient. A prescription establishes that treatment was prescribed, not that the patient took it or that it was effective.

## Intended user and workflow

Primary user: a GP or hospital clinician reviewing patients with current or recent antibiotic prescriptions.

1. Open a review queue of patients with relevant antibiotic prescribing records.
2. See which patients have evidence meeting the prototype's review criteria, alongside data coverage and the last refresh time.
3. Open a patient to inspect a timeline combining prescribing, consultations, symptoms, results and care encounters.
4. Inspect each flag's supporting records, dates, explanation, contradictory evidence and missing information.
5. Record that the flag was reviewed, deferred or dismissed with a reason. The clinician decides what action to take through their normal workflow.

Review status belongs to the tool. It must not imply that treatment was given or that the patient's condition improved. The initial integration will read simulator records; it will not modify clinical records automatically.

## MVP

- A review queue with patient identifier, relevant antibiotic course information, latest evidence, flag summary, data freshness and review status.
- A consolidated patient timeline that preserves the originating service, resource identifier and clinical event date for every entry.
- A small, explicit set of configurable rules that identify candidate patterns for clinical review.
- A patient detail view explaining each flag through source evidence, changes over time and material data gaps.
- A reproducible demonstration with authored synthetic cases representing concerning trajectories, recovery and insufficient evidence.

Start with one end-to-end journey: antibiotic prescribing followed by a repeat consultation and additional dated evidence of possible deterioration. Expand to other patterns only after this journey works.

## Data and integration

Simulator origin: https://sim.animahacks.com/

Reference contracts:

- OpenAPI: https://sim.animahacks.com/api/openapi.json
- Handbook: https://sim.animahacks.com/docs/
- Interactive explorer: https://sim.animahacks.com/docs/explorer/

Authenticate using the team's bearer key. Keep the key in server-side environment configuration and out of the repository and browser bundle. A configured team key is required before inspecting actual team data.

Use the patient directory and scoped resource views as the initial integration surface:

```text
GET /api/sites/{site}/patients
GET /api/sites/{site}/view?patient=SIM-...&limit=...&offset=...
```

Read all relevant pages and respect service visibility. Use the same SIM patient identifier across services. Deduplicate shared records by their resource identity while retaining provenance and versions. The view is not a complete world export and does not expose hidden scheduled jobs.

| Input | Intended use | Verification needed |
|---|---|---|
| Antibiotic prescriptions and medication history | Identify candidate patients and establish prescribing context | Available medicine identifiers, antibiotic classification, dates, course duration and lifecycle fields |
| Consultations and clinical notes | Surface explicitly documented symptoms and their progression | Narrative structure, event dates, negation and historical versus current statements |
| Dated laboratory results | Display trends and supply evidence to agreed rules | Actual analytes, units, timestamps and missingness in selected records |
| Hospital attendances and discharge documents | Show repeat presentations and transitions between services | Cross-service visibility, encounter dates and links to the prescribing episode |
| Diagnoses, problems and allergies | Provide context for clinician review | Current versus historical status and completeness |
| Home observations | Optional supporting timeline evidence | Whether clinically relevant measurements exist; activity readings must not be treated as substitutes for vital signs |

Do not assume that vital signs, adherence, microbiology, antibiotic susceptibility or treatment response are available. Inspect the actual records before committing to any feature that depends on them. The local reference downloads describe contracts, not a verified patient cohort.

## Evidence and flagging design

First version: transparent rules over normalized, dated evidence. Candidate rule themes include repeat presentations after prescribing, explicitly documented worsening symptoms, and changes in available measurements. These are design themes, not approved clinical criteria.

Exact thresholds, time windows, combinations of evidence and any urgency labels remain undecided and require clinical review. During the hackathon, any illustrative rule must be labelled as a demonstration rule. Do not present an unvalidated numerical score as a probability of deterioration or death.

An LLM may extract structured statements from notes and produce a concise summary. Every extracted statement must retain its source and distinguish current findings, historical findings, negation and uncertainty. Unsupported statements must not become rule inputs. The rule evaluation should remain inspectable independently of the generated prose.

Each flag should include:

- The rule identifier and version, with a plain-language reason.
- Supporting resource identifiers, source services, event dates and the relevant values or excerpts.
- What changed relative to earlier available evidence.
- Conflicting evidence, unavailable inputs and the last successful data refresh.
- Review status and its history, kept separate from the underlying patient records.

Missing information remains unknown. No flag means only that the available evidence did not meet the implemented criteria; it must not be displayed as reassurance that the patient is safe. Duplicate or stale records must not multiply evidence or silently appear current.

## Boundaries

- No autonomous diagnosis, antibiotic selection or changes, dosing advice, or treatment recommendations.
- No autonomous patient messaging, emergency escalation, or changes to clinical records.
- No claims of validated clinical performance or prediction of fatal outcomes.
- No population-wide conclusions from the synthetic dataset.
- No training of a mortality prediction model in the MVP: suitable outcomes and representative labelled training data have not been established.

The prototype supports review of evidence. It does not replace clinical assessment.

## Evaluation and demonstration

Create an explicit scenario set with expected rule outputs and known supporting evidence:

| Scenario | Expected prototype behaviour |
|---|---|
| Prescribed antibiotics followed by documented worsening and corroborating dated evidence | Produce the intended review flag and cite the correct records |
| Prescribed antibiotics followed by documented recovery | Avoid a flag based solely on prescribing or historical symptoms |
| Sparse follow-up or missing measurements | Show insufficient evidence and data gaps without inventing findings |
| Relevant evidence split between GP and hospital | Assemble a coherent timeline without double-counting shared records |
| Negated or historical symptoms, conflicting notes, duplicated or stale results | Preserve context and avoid unsupported flag inputs |

Measure expected flags detected, unexpected flags, source-citation accuracy, extraction accuracy, chronology and deduplication correctness, and handling of missing data. Report the scenario count and limitations with every result. Success on authored scenarios demonstrates implementation behaviour, not real-world clinical sensitivity or specificity.

Demo story: show the fragmented source records, open the combined timeline, explain why the demonstration rule fired, then show an ordinary recovery case and an insufficient-data case.

## Delivery plan

1. Configure team access and inspect a small set of records to establish field coverage.
2. Agree an antibiotic-identification method and a minimal normalized evidence schema.
3. Define and clinically review the first demonstration rules and authored scenarios.
4. Build a read-only data adapter with pagination, provenance, freshness and deduplication.
5. Implement rule evaluation and the queue/timeline interface.
6. Add source-grounded note extraction and summaries if useful after the structured flow works.
7. Evaluate the scenario set and prepare the end-to-end demonstration.

## Open decisions

- Team key and available patient cohort.
- Clinical reviewer and exact demonstration criteria.
- Reliable antibiotic classification and handling of uncertain course dates.
- Persistence for review status and refresh strategy. The application stack is Next.js App Router, React, TypeScript, Tailwind CSS and ESLint, managed with npm.
- Whether the simulator has enough suitable cases or needs separately authored fixtures.
- Whether LLM extraction is needed for the first demo and which model to use.

## Repository state

Working directory: `anima/` inside the Anima Hackathon workspace.

The initial repository content is this `state.md` and the standard Next.js application template, with commit message `init`. Downloaded handbook files, API contracts and generated reference indexes remain local and are excluded through Git's local exclude configuration. Their earlier unpublished commit must not be pushed.

GitHub repository creation and publishing are pending. No public repository URL has been verified.

## Application foundation

The objective is a full application implementing the scope above. The current scaffold is the official Next.js starter, not a completed clinical dashboard. It includes App Router under `src/app`, strict TypeScript, Tailwind CSS, ESLint, static assets and an npm lockfile. The starter page and layout are ready to be replaced by the clinician workflow.

Run `npm install` then `npm run dev` to develop locally. Run `npm run lint`, `npm run typecheck`, and `npm run build` to validate changes. See `DEVELOPMENT.md` for commands and structure. No patient data, API integration, credentials, clinical rules, authentication or persistence are included yet.
