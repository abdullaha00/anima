# Domain model and the ML seam

**Scope update, 12 September 2026:** [DATA.md](../DATA.md) now specifies Stage 1 all-cause mortality within three calendar months. The types and ranking endpoint below describe the existing indicator-based frontend, not the intended mortality model contract. The old restriction to within-tier ranking does not constrain the agreed new Stage 1 target. The separate, versioned screening result is now implemented in `src/lib/stage1/mortality-schema.ts` with horizon, estimate, threshold, missingness and provenance, and links escalations to the [Stage 2 queue](STAGE2.md). See [MORTALITY.md](MORTALITY.md); `modelRank` and Stage 2 `confidence` must not be used as mortality probabilities.

The contract between the frontend, the rules engine and whatever the ML pair produces
later. Get this right early and the two workstreams stop blocking each other.

## Principles

1. The UI depends on `Assessment`, never on how an assessment was produced.
2. An assessment always carries its evidence. A signal with no evidence is invalid.
3. Nothing in this model can express a probability of death for a patient. That is
   deliberate and is enforced by the type system as far as it can be.
4. A model may reorder. It may not invent, and it may not silently remove.

## Types

```ts
// src/lib/domain/types.ts

export type SignalFamily = 'general' | 'disease-specific' | 'service-use';

export interface Signal {
  /** Stable code, so a flag is auditable months later. e.g. 'GEN_FRAILTY' */
  id: string;
  /** What the clinician reads. e.g. 'Moderate to severe frailty' */
  label: string;
  family: SignalFamily;
  /** The published tool this indicator is shaped after. e.g. 'SPICT general indicator' */
  basis: string;
  /** The specific record entry that fired it, in words a clinician can check. */
  evidence: string;
  /** When the underlying record entry was made, if known. */
  recordedAt?: string;
}

export type ReviewTier =
  | 'review this week'
  | 'review this month'
  | 'consider at next contact'
  | 'no prompt';

export interface Assessment {
  patientId: string;
  signals: Signal[];
  tier: ReviewTier;
  alreadyOnRegister: boolean;
  hasPlan: boolean;
  /**
   * Optional ordering hint from a model. Lower sorts earlier.
   * NEVER rendered as a number, a percentage or a bar. It may only affect sort order
   * within a tier, and its presence must be disclosed in the UI.
   */
  modelRank?: number;
  /** e.g. 'model-suggested ordering, not validated against outcomes' */
  modelNote?: string;
}

export interface Patient {
  id: string;
  age?: number;
  sex?: string;
  conditions: string[];
  admissions: Admission[];
  imdQuintile?: number;
  frailtyCfs?: number;
  frailtyRecordedAt?: string;
  weightLossPct?: number;
  performanceStatus?: number;
  nyha?: number;
  mrcDyspnoea?: number;
  carePackageIncreasedAt?: string;
  onPalliativeRegister: boolean;
  hasAcpRecord: boolean;
  /** Free text the ML stage may consume. The rules engine ignores it. */
  narratives?: Narrative[];
}

export interface Admission {
  at: string;
  emergency: boolean;
  lengthOfStayDays?: number;
  summary?: string;
}

export interface Narrative {
  at: string;
  kind: 'consultation' | 'discharge' | 'referral' | 'other';
  text: string;
}
```

## The engine interface

```ts
// src/lib/scoring/index.ts

export interface SignalEngine {
  id: string;                         // 'rules' | 'model' | 'rules+model'
  assess(patient: Patient): Assessment;
}
```

`rulesEngine` is the default and ships. It is a direct port of `reference/cairn/signals.py`.
Keep the indicator table in one exported array so a doctor can edit thresholds without
reading control flow.

`modelEngine` wraps the rules engine:

```ts
export function modelEngine(rules: SignalEngine, opts: { endpoint: string; timeoutMs: number }): SignalEngine
```

It calls the rules engine first, then asks the model for an ordering hint, then merges.
Required behaviour:

- On timeout, non-200, malformed response or missing patient, return the rules assessment
  unchanged. Never fail the page.
- `signals` and `tier` always come from the rules engine. The model cannot add or remove a
  signal, and cannot change a tier.
- The model may set `modelRank` and `modelNote` only.
- If `modelRank` is present, the UI must display the disclosure that ordering is
  model-suggested and not validated.

Selection by environment variable, defaulting to rules:

```
SCORING_ENGINE=rules        # default, ships
SCORING_ENGINE=model        # only when the ML endpoint is up
MODEL_ENDPOINT=http://localhost:8000/score
MODEL_TIMEOUT_MS=1500
```

## The score endpoint contract

`POST /api/score` exists now as a stub returning 501 with a clear message, so the ML pair
has an obvious place to land.

Request:

```json
{
  "patients": [
    { "id": "NHS000128", "signalIds": ["GEN_FRAILTY", "DIS_HEART"], "tier": "review this week" }
  ]
}
```

Response:

```json
{
  "engine": "cairn-ml-0.1",
  "validated": false,
  "ranking": [{ "id": "NHS000128", "rank": 1, "note": "narrative mentions increasing breathlessness" }]
}
```

`validated` must be present and must be `false` until someone can point at an evaluation
against outcomes. The UI reads it and shows the disclosure accordingly. Since the
simulator carries no mortality or palliative outcome labels, `validated: true` is not
available today, and claiming it would be false.

## Why the model cannot change the tier

The tier drives what a clinician does this week. It is derived from named indicators with
visible evidence, so a clinician can disagree with it by looking at the evidence. A model
that moved someone into "review this week" for reasons that cannot be shown would break
the property that makes the whole product defensible. Ordering within a tier is a genuine
contribution and carries none of that risk.

If the ML work produces something stronger later, that is a product conversation with the
doctors, not a frontend change made quietly.

## Record model

Port `reference/cairn/record.py` faithfully. The enforced rules, which the UI surfaces:

| Rule | UI consequence |
|---|---|
| Every clinical field carries value, source, recordedBy, recordedAt | Each field shows its provenance line; a field with no source is marked and blocks signing |
| Required fields must be present before signing | Live readiness panel listing what is outstanding |
| Cairn cannot sign | The signature refusal, shown inline |
| Only a named clinician signs | Signature requires a typed name |
| A signed record is immutable | Fields become read-only; changes create a new version |
| Nothing unsigned is shared | Audience tabs render nothing until signed |
| Every action is audited | Audit trail panel, newest last |

Required before signature: what matters, clinical summary, preferences for care,
recommended interventions, CPR recommendation, capacity assessment, people involved.

## Audience views

Field-level allowlists, not styling variants. Deriving them from a table means a judge can
be shown the table.

| Audience | Fields |
|---|---|
| ambulance | cpr recommendation, preferences for care, not recommended, preferred place of care, plus the not-legally-binding note |
| out_of_hours | clinical summary, preferences, recommended and not recommended, place preferences |
| hospice | everything |
| gp | everything |
| family | what matters, place preferences, people involved, plus the consent note |
