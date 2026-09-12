import { Type, type Static } from "typebox";

const NonEmptyString = Type.String({ minLength: 1 });
const StringList = Type.Array(NonEmptyString);

export const EvidenceReferenceSchema = Type.Object({
  sourcePath: Type.String({
    minLength: 1,
    pattern: "^record(?:/[A-Za-z0-9._-]+)+\\.json$",
  }),
  recordId: Type.Optional(NonEmptyString),
  date: Type.Optional(NonEmptyString),
  detail: NonEmptyString,
});

export const Stage2AssessmentSchema = Type.Object({
  schemaVersion: Type.Literal("1.0"),
  patientId: NonEmptyString,
  generatedAt: NonEmptyString,
  humanReviewRequired: Type.Literal(true),
  clinicalDecisionSupportOnly: Type.Literal(true),
  recommendation: Type.Union([
    Type.Literal("proceed"),
    Type.Literal("do_not_proceed"),
    Type.Literal("already_managed"),
    Type.Literal("insufficient_evidence"),
  ]),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  summary: NonEmptyString,
  summaryEvidence: Type.Array(EvidenceReferenceSchema, { minItems: 1 }),
  evidenceForReview: Type.Array(
    Type.Object({
      signal: NonEmptyString,
      significance: NonEmptyString,
      evidence: Type.Array(EvidenceReferenceSchema, { minItems: 1 }),
    }),
  ),
  falsePositiveReview: Type.Object({
    verdict: Type.Union([
      Type.Literal("no_clear_false_positive"),
      Type.Literal("clear_false_positive"),
      Type.Literal("uncertain"),
    ]),
    alternativeExplanations: StringList,
    reasonsConversationMayBeInappropriate: StringList,
    reasonsNotToOfferFalseReassurance: StringList,
    evidence: Type.Array(EvidenceReferenceSchema, { minItems: 1 }),
  }),
  existingPlanning: Type.Object({
    status: Type.Union([
      Type.Literal("none_found"),
      Type.Literal("mentioned_not_active"),
      Type.Literal("active_and_implemented"),
      Type.Literal("unclear"),
    ]),
    details: StringList,
    evidence: Type.Array(EvidenceReferenceSchema, { minItems: 1 }),
  }),
  patientAndFamily: Type.Object({
    patientWishes: StringList,
    familyWishes: StringList,
    legalAndCarePlanningRecords: StringList,
    contactPreferences: StringList,
    uncertainties: StringList,
    evidence: Type.Array(EvidenceReferenceSchema, { minItems: 1 }),
  }),
  careBaseline: Type.Object({
    residence: NonEmptyString,
    functionAndMobility: NonEmptyString,
    currentClinicalSupport: StringList,
    familyAndCarerSupport: StringList,
    gaps: StringList,
    evidence: Type.Array(EvidenceReferenceSchema, { minItems: 1 }),
  }),
  careTeam: Type.Array(
    Type.Object({
      role: NonEmptyString,
      name: Type.Optional(NonEmptyString),
      organisation: Type.Optional(NonEmptyString),
      meetingPriority: Type.Union([
        Type.Literal("core"),
        Type.Literal("optional"),
      ]),
      ownership: NonEmptyString,
      reason: NonEmptyString,
      evidence: Type.Array(EvidenceReferenceSchema, { minItems: 1 }),
    }),
  ),
  meeting: Type.Object({
    proposedOwner: NonEmptyString,
    urgency: NonEmptyString,
    formatAndAccessibility: NonEmptyString,
    objectives: StringList,
    briefingNotes: Type.Array(
      Type.Object({
        note: NonEmptyString,
        evidence: Type.Array(EvidenceReferenceSchema, { minItems: 1 }),
      }),
    ),
    agenda: StringList,
  }),
  communications: Type.Array(
    Type.Object({
      audience: NonEmptyString,
      channel: NonEmptyString,
      draft: NonEmptyString,
      cautions: StringList,
      evidence: Type.Array(EvidenceReferenceSchema, { minItems: 1 }),
    }),
  ),
  immediateActions: Type.Array(
    Type.Object({
      action: NonEmptyString,
      owner: NonEmptyString,
      urgency: NonEmptyString,
      reason: NonEmptyString,
      evidence: Type.Array(EvidenceReferenceSchema, { minItems: 1 }),
    }),
  ),
  dataQuality: Type.Object({
    coverageSummary: NonEmptyString,
    missingSources: StringList,
    failedSources: StringList,
    contradictions: StringList,
    evidence: Type.Array(EvidenceReferenceSchema, { minItems: 1 }),
  }),
  verification: Type.Object({
    performed: Type.Boolean(),
    verdict: Type.Union([
      Type.Literal("pending"),
      Type.Literal("confirmed"),
      Type.Literal("revised"),
      Type.Literal("escalate_uncertainty"),
    ]),
    falsePositiveChecks: StringList,
    changesFromPrimary: StringList,
  }),
});

export type EvidenceReference = Static<typeof EvidenceReferenceSchema>;
export type Stage2Assessment = Static<typeof Stage2AssessmentSchema>;

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface Stage2Job {
  id: string;
  patientId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  /** Optional immutable Stage 1 reference; existing patient-ID-only callers remain valid. */
  screeningId?: string;
  screeningIds?: string[];
  idempotencyKeys?: string[];
  runDirectory?: string;
  resultPath?: string;
  error?: string;
}

export interface CollectionRequest {
  name: string;
  relativePath: string;
  endpoint: string;
  query?: Record<string, string | number>;
  parser:
    | "clock"
    | "directory"
    | "workspace"
    | "fhir-bundle"
    | "fhir-patient"
    | "patient-items";
  paginateItems?: boolean;
}

export interface CollectionResult {
  name: string;
  relativePath: string;
  endpoint: string;
  status: "ok" | "failed";
  attempts: number;
  collectedAt: string;
  error?: string;
}

export interface RecordManifest {
  schemaVersion: "1.0";
  patientId: string;
  collectedAt: string;
  simulatorOrigin: string;
  sources: CollectionResult[];
  coverage: {
    successful: number;
    failed: number;
    failedSources: string[];
  };
  deduplication: {
    uniqueResourceCount: number;
    resourcesWithDuplicateVisibility: number;
  };
  safetyGate: {
    forceInsufficientEvidence: boolean;
    reasons: string[];
  };
}
