import { Type, type Static } from "typebox";

const Text = Type.String({ minLength: 1 });
export const FeatureDefinitionSchema = Type.Object({
  id: Type.String({ pattern: "^[a-z][a-z0-9_]{0,63}$" }),
  definition: Text,
}, { additionalProperties: false });

export const ExtractionConfigSchema = Type.Object({
  version: Text,
  model: Type.String({ pattern: "^[^/]+/.+$" }),
  reasoning: Type.Union([Type.Literal("off"), Type.Literal("minimal"), Type.Literal("low"), Type.Literal("medium"), Type.Literal("high"), Type.Literal("xhigh"), Type.Literal("max")]),
  temperature: Type.Union([Type.Null(), Type.Number({ minimum: 0, maximum: 2 })]),
  maxOutputTokens: Type.Integer({ minimum: 512, maximum: 32000 }),
  timeoutMs: Type.Integer({ minimum: 100, maximum: 300000 }),
  maxAttempts: Type.Integer({ minimum: 1, maximum: 3 }),
  lookbackDays: Type.Integer({ minimum: 1, maximum: 3650 }),
  currentEvidenceDays: Type.Integer({ minimum: 1, maximum: 3650 }),
  maxSources: Type.Integer({ minimum: 1, maximum: 1000 }),
  maxInputChars: Type.Integer({ minimum: 1000, maximum: 200000 }),
  promptFile: Text,
  features: Type.Array(FeatureDefinitionSchema, { minItems: 1, maxItems: 40 }),
}, { additionalProperties: false });
export type ExtractionConfig = Static<typeof ExtractionConfigSchema>;

export const FeatureExtractionSchema = Type.Object({
  features: Type.Array(Type.Object({
    id: Text,
    state: Type.Union([Type.Literal("present"), Type.Literal("absent"), Type.Literal("uncertain"), Type.Literal("conflicting"), Type.Literal("not_documented")]),
    temporality: Type.Union([Type.Literal("current"), Type.Literal("historical"), Type.Literal("unclear")]),
    explanation: Text,
    evidence: Type.Array(Type.Object({
      sourceId: Text,
      quote: Type.String({ minLength: 1, maxLength: 2000 }),
      supports: Type.Union([Type.Literal("present"), Type.Literal("absent"), Type.Literal("uncertain")]),
      speaker: Type.Union([Type.Literal("patient"), Type.Literal("clinician"), Type.Literal("family"), Type.Literal("unspecified")]),
    }, { additionalProperties: false })),
  }, { additionalProperties: false }), { minItems: 1 }),
}, { additionalProperties: false });
export type FeatureExtraction = Static<typeof FeatureExtractionSchema>;

// Deliberately scoped to workspace narrative records. Adapters report unsupported kinds.
export interface NarrativeSource {
  id: string;
  recordId: string;
  version: string | number | null;
  sourcePath: string;
  fieldPath: string;
  recordedAt: string;
  kind: string;
  recordStatus: string | null;
  text: string;
}

export interface ExtractionInput {
  schemaVersion: "stage1-input-v1";
  patientId: string;
  indexTime: string;
  provenance: string;
  sources: NarrativeSource[];
  coverage: {
    collectionPartial: boolean;
    failedSources: string[];
    safetyGateReasons: string[];
    excluded: Record<string, number>;
    limitations: string[];
  };
}
