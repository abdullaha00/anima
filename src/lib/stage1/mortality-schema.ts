import { Type, type Static } from "typebox";
import { Check } from "typebox/value";

const Text = Type.String({ minLength: 1 });
const Hash = Type.String({ pattern: "^[a-f0-9]{64}$" });
const Id = Type.String({ pattern: "^SIM-[0-9]{6}$" });
const UUID = Type.String({ pattern: "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$" });
const Time = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$" });
export const MortalityEvidenceSchema = Type.Object({
  recordId: Text,
  sourcePath: Type.Literal("record/eligible.json"),
  pointer: Type.String({ pattern: "^/", description: "RFC 6901 JSON pointer relative to the raw record value, e.g. /data/text or /conditions/0. No /value prefix and no doubled leading slash. Point to a scalar, not an array or object." }),
  quote: Type.String({ minLength: 1, maxLength: 2000 }),
  interpretation: Text,
}, { additionalProperties: false });
export const MortalityInputSchema = Type.Object({
  schemaVersion: Type.Literal("mortality-input-v1"), screeningId: UUID, patientId: Id,
  indexTime: Time, horizonEnd: Time, snapshotHash: Hash, provenance: Text,
  records: Type.Array(Type.Object({ id: Text, sourcePaths: Type.Array(Text), value: Type.Unknown() }, { additionalProperties: false })),
  coverage: Type.Object({
    partial: Type.Boolean(), failedSources: Type.Array(Text), excluded: Type.Record(Type.String(), Type.Integer({ minimum: 0 })),
    limitations: Type.Array(Text), safetyGateReasons: Type.Array(Text),
  }, { additionalProperties: false }),
  eligibility: Type.Object({
    status: Type.Union([Type.Literal("eligible"), Type.Literal("ineligible"), Type.Literal("uncertain")]),
    reasons: Type.Array(Text),
  }, { additionalProperties: false }),
}, { additionalProperties: false });
export type MortalityInput = Static<typeof MortalityInputSchema>;

export const MortalitySubmissionSchema = Type.Object({
  status: Type.Union([Type.Literal("scored"), Type.Literal("abstained")]),
  deathProbability3m: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
  explanation: Text,
  supportingEvidence: Type.Array(MortalityEvidenceSchema),
  contradictoryEvidence: Type.Array(MortalityEvidenceSchema),
  limitations: Type.Array(Text),
  reason: Type.Union([Text, Type.Null()], { description: "MUST be null when status is scored. Only for abstained: a specific reason why an estimate cannot be produced. Put clinical rationale in explanation instead." }),
}, { additionalProperties: false });
export type MortalitySubmission = Static<typeof MortalitySubmissionSchema>;

export const MortalityResultSchema = Type.Object({
  schemaVersion: Type.Literal("mortality-result-v1"), screeningId: UUID, patientId: Id,
  indexTime: Time, horizonEnd: Time, snapshotHash: Hash, generatedAt: Time,
  status: Type.Union([Type.Literal("scored"), Type.Literal("abstained"), Type.Literal("ineligible"), Type.Literal("failed")]),
  deathProbability3m: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
  explanation: Text, supportingEvidence: Type.Array(MortalityEvidenceSchema), contradictoryEvidence: Type.Array(MortalityEvidenceSchema),
  limitations: Type.Array(Text), reason: Type.Union([Text, Type.Null()]),
  coverage: MortalityInputSchema.properties.coverage,
  engine: Type.Object({
    id: Type.Union([Type.Literal("llm_record"), Type.Literal("tabular_ml")]), model: Text,
    configHash: Hash, promptHash: Hash,
    validation: Type.Union([Type.Literal("unvalidated"), Type.Literal("synthetic_evaluation")]),
    calibrated: Type.Boolean(), evaluationReference: Type.Union([Text, Type.Null()]),
  }, { additionalProperties: false }),
  threshold: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
  thresholdBasis: Text,
  decision: Type.Union([Type.Literal("above_threshold"), Type.Literal("below_threshold"), Type.Literal("not_assessed")]),
  stage2JobId: Type.Union([UUID, Type.Null()]),
}, { additionalProperties: false });
export type MortalityResult = Static<typeof MortalityResultSchema>;

export function parseTime(value: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) throw new Error("Time must be a valid canonical UTC ISO timestamp");
  return ms;
}

export function threeMonthsAfter(indexTime: string): string {
  const d = new Date(parseTime(indexTime));
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 3);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

export function validateMortalityResult(value: unknown, input?: MortalityInput): MortalityResult {
  if (!Check(MortalityResultSchema, value)) throw new Error("Invalid mortality result schema");
  const r = value as MortalityResult;
  parseTime(r.generatedAt);
  if (threeMonthsAfter(r.indexTime) !== r.horizonEnd) throw new Error("Incorrect three-month horizon");
  if (input && ["patientId", "screeningId", "indexTime", "horizonEnd", "snapshotHash"].some(k => r[k as keyof MortalityResult] !== input[k as keyof MortalityInput])) throw new Error("Result identity, time or snapshot mismatch");
  if (r.status === "scored" ? r.deathProbability3m === null || r.reason !== null : r.deathProbability3m !== null || !r.reason) throw new Error("Invalid scored/abstention semantics");
  const expected = r.status !== "scored" || r.threshold === null ? "not_assessed" : r.deathProbability3m! >= r.threshold ? "above_threshold" : "below_threshold";
  if (r.decision !== expected) throw new Error("Threshold decision mismatch");
  if (r.stage2JobId && r.decision !== "above_threshold") throw new Error("Only above-threshold results can link Stage 2");
  if (r.engine.validation === "unvalidated" && (r.engine.calibrated || r.engine.evaluationReference !== null)) throw new Error("Unvalidated engines cannot claim calibration/evaluation");
  if (r.engine.validation === "synthetic_evaluation" && !r.engine.evaluationReference) throw new Error("Evaluated engines require an evaluation reference");
  return r;
}
