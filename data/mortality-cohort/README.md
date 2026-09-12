# Synthetic mortality cohort

This directory contains a **synthetic, pipeline-development-only** cohort captured from NHS-SIM on 2026-09-12.

## Cohort

- 100 unique patients
- 4 patients with medically related recorded deaths: cancer, pneumonia, sepsis and stroke
- 96 patients alive at the snapshot with at least two recorded conditions
- all 33 supplied high-comorbidity IDs are included
- `SIM-000009` was excluded because the recorded cause was a road traffic collision

The simulator currently exposes only four eligible deaths. This is not enough to fit or evaluate a reliable mortality model. Use this cohort to build the preprocessing, leakage controls and cross-validation pipeline while more outcomes are added.

## Files

| File | Purpose |
|---|---|
| `cohort-index.csv` | Human-readable cohort index, outcomes and fold assignment. Do not use outcome columns as features. |
| `labels.ndjson` | Machine-readable labels, kept separate from model inputs. |
| `asof-90d.ndjson` | **Recommended model input:** record as available 90 days before the matched index date. |
| `asof-60d.ndjson` | Secondary horizon for sensitivity analysis. |
| `asof-30d.ndjson` | Secondary horizon for sensitivity analysis. |
| `raw-records.ndjson` | Current raw audit snapshot, including the outcome. Never feed this file directly to a model. |
| `manifest.json` | Selection, provenance, coverage and limitations. |

Each NDJSON file has one JSON object per patient and joins on `patientId`.

## Cutoff policy

The common index date is 2026-09-05: the death date for cases and a calendar-matched pseudo-index date for controls. The primary cutoff is 90 days earlier (2026-06-07).

For strict model inputs, the collector:

1. removes the directory death outcome;
2. omits current directory conditions, needs and goals because they have no historical version timestamp;
3. includes only resources created on or before the cutoff; and
4. excludes a resource entirely if provenance says it changed after the cutoff, because the API cannot reconstruct its older payload.

Use 90 days for the primary experiment. Compare 60 and 30 days only as explicitly named horizon analyses; do not mix horizons in one split.

## Splitting

`fold` is 0–3, with one positive assigned to each fold. If testing the pipeline, use leave-one-positive-out grouped cross-validation and keep every row for a patient in the same fold. With four positives, metrics will be extremely unstable and must not be presented as clinical validation.

Living controls are only known to be alive at the snapshot and are therefore right-censored, not confirmed never to die.

## Rebuild

From the repository root:

```bash
node scripts/build-mortality-cohort.mjs
```

The collector reads `SIM_KEY`/`SIM_ORIGIN`, retries transient simulator errors, pulls GP, hospital, diagnostics, community, pharmacy, referrals, wearables and patient views, and deduplicates resources by resource ID.
