# Enriched synthetic mortality cohort

This is a deterministic, pipeline-development-only augmentation of the preserved data/mortality-cohort/ snapshot. The augmentation is INVENTED SYNTHETIC DATA, not a live simulator observation and not a clinical label. The builder makes no API calls and does not mutate the simulator.

## Cohort

- 100 unique patients
- 5 simulator-recorded deaths, including SIM-000009 (road-traffic collision) retained as ineligible
- 34 invented synthetic authored deaths from the four supplied compact plan artifacts
- 39 observed deaths in the combined audit, of which 38 are medically eligible
- 61 living controls

SIM-000009 has an observed death but receives no mortality model label (label: null) because the cause is non-medical. The 34 authored deaths receive labelSource: authored-synthetic-mortality-v2; the five simulator-recorded outcomes are separately identified in labels.ndjson.

## Files

| File | Purpose |
|---|---|
| cohort-index.csv | Human-readable roles, label provenance, index dates and audit-only outcome metadata. |
| labels.ndjson | Machine-readable labels and provenance, kept separate from model inputs. |
| raw-records.ndjson | Combined audit records, including outcomes and generator/provenance markers; never feed directly to a model. |
| asof-90d.ndjson | Recommended model input with per-patient 90-day cutoffs. |
| asof-60d.ndjson | Model input at the 60-day horizon. |
| asof-30d.ndjson | Model input at the 30-day horizon. |
| pilot-authored-deaths-asof-15d.ndjson | Three-row 15-day-cutoff pilot for SIM-000499, SIM-000472, and SIM-000464; invented synthetic data for pipeline development only. |
| all-authored-deaths-asof-15d.ndjson | All 34 authored synthetic death targets at a 15-day cutoff; excludes simulator-recorded deaths and living controls. Synthetic pipeline-development data only. |
| manifest.json | Deterministic source, selection, provenance, coverage and validation metadata. |

The standard cohort NDJSON files have one row per patient and join on the top-level patientId. Controls use deterministic matched dates drawn round-robin from the sorted observed death dates; cases use their own death dates. Therefore each horizon has per-patient cutoffs rather than one shared cutoff. The clearly named pilot file contains exactly the three documented authored-death patients at death date minus 15 days. The all-authored 15-day file contains exactly all 34 authored synthetic death targets and no simulator-recorded deaths or living controls; it is synthetic-only and must not be treated as observed clinical evidence.

## Model-input leakage policy

For each row, resources are retained only when their createdAt and all event timestamps are on or before that patient's horizon cutoff. A resource with a later provenance change is excluded because the base API snapshot cannot reconstruct its historical payload. Model inputs remove outcomes, generator/audit/source/provenance markers, internal top-level resource IDs, and resource-level patientId; the row-level patientId remains only as a join key. Clinical coding IDs nested in measurement/problem data remain because they describe the clinical value rather than the resource identity.

## Validation and rebuild

From the repository root:

    node scripts/build-enriched-mortality-cohort.mjs
    node scripts/build-enriched-mortality-cohort.mjs --validate

The deterministic validation checks exact role counts, uniqueness, all 34 authored targets, exact pilot IDs/order/row count, exact all-authored 15-day membership and scope, 15-day cutoff dates, cross-file links, no post-cutoff events, absence of model-visible outcome/provenance/generator fields, valid NDJSON and bounded resource counts. The preserved data/mortality-cohort/ directory is read-only input and is not rewritten.
