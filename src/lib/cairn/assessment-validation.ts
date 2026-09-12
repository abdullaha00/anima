import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type {
  EvidenceReference,
  RecordManifest,
  Stage2Assessment,
} from "./types";

function sameStrings(left: string[], right: string[]): boolean {
  const normalize = (values: string[]) => [...new Set(values)].sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function containsObjectId(value: unknown, expected: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsObjectId(item, expected));
  }
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  if (object.id === expected) return true;
  return Object.values(object).some((child) => containsObjectId(child, expected));
}

function allEvidence(assessment: Stage2Assessment): EvidenceReference[] {
  return [
    ...assessment.summaryEvidence,
    ...assessment.evidenceForReview.flatMap((item) => item.evidence),
    ...assessment.falsePositiveReview.evidence,
    ...assessment.existingPlanning.evidence,
    ...assessment.patientAndFamily.evidence,
    ...assessment.careBaseline.evidence,
    ...assessment.careTeam.flatMap((item) => item.evidence),
    ...assessment.meeting.briefingNotes.flatMap((item) => item.evidence),
    ...assessment.communications.flatMap((item) => item.evidence),
    ...assessment.immediateActions.flatMap((item) => item.evidence),
    ...assessment.dataQuality.evidence,
  ];
}

export async function validateSubmittedAssessment(options: {
  assessment: Stage2Assessment;
  pass: "primary" | "verification";
  runDirectory: string;
  patientId: string;
  generatedAt: string;
}): Promise<void> {
  const { assessment, pass, runDirectory, patientId, generatedAt } = options;
  if (assessment.patientId !== patientId) {
    throw new Error(`Assessment patientId must be ${patientId}`);
  }
  if (assessment.generatedAt !== generatedAt) {
    throw new Error(`Assessment generatedAt must be ${generatedAt}`);
  }
  if (
    pass === "primary" &&
    (assessment.verification.performed || assessment.verification.verdict !== "pending")
  ) {
    throw new Error("Primary pass must set verification to performed=false, verdict=pending");
  }
  if (
    pass === "verification" &&
    (!assessment.verification.performed || assessment.verification.verdict === "pending")
  ) {
    throw new Error("Verification pass must be performed and use a final verdict");
  }

  const manifestPath = path.join(runDirectory, "record", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RecordManifest;
  if (!sameStrings(assessment.dataQuality.failedSources, manifest.coverage.failedSources)) {
    throw new Error(
      "dataQuality.failedSources must exactly match record/manifest.json",
    );
  }
  if (
    manifest.safetyGate.forceInsufficientEvidence &&
    assessment.recommendation !== "insufficient_evidence"
  ) {
    throw new Error(
      `Collection safety gate requires insufficient_evidence: ${manifest.safetyGate.reasons.join("; ")}`,
    );
  }

  const evidence = allEvidence(assessment);
  if (assessment.recommendation !== "insufficient_evidence" && evidence.length === 0) {
    throw new Error("An actionable recommendation requires cited evidence");
  }
  if (
    assessment.recommendation === "proceed" &&
    assessment.evidenceForReview.length === 0
  ) {
    throw new Error("A proceed recommendation requires at least one deterioration signal");
  }
  if (
    assessment.recommendation === "do_not_proceed" &&
    (assessment.falsePositiveReview.verdict !== "clear_false_positive" ||
      assessment.falsePositiveReview.evidence.length === 0)
  ) {
    throw new Error(
      "A do_not_proceed recommendation requires a clear false-positive verdict with evidence",
    );
  }
  if (
    assessment.recommendation === "already_managed" &&
    (assessment.existingPlanning.status !== "active_and_implemented" ||
      assessment.existingPlanning.evidence.length === 0)
  ) {
    throw new Error(
      "An already_managed recommendation requires evidence of an active implemented plan",
    );
  }

  const recordRoot = await realpath(path.join(runDirectory, "record"));
  const parsedFiles = new Map<string, unknown>();
  for (const citation of evidence) {
    if (
      path.isAbsolute(citation.sourcePath) ||
      citation.sourcePath.includes("\\") ||
      !citation.sourcePath.startsWith("record/") ||
      !citation.sourcePath.endsWith(".json")
    ) {
      throw new Error(`Invalid evidence path: ${citation.sourcePath}`);
    }
    const candidate = path.resolve(runDirectory, citation.sourcePath);
    const resolved = await realpath(candidate).catch(() => undefined);
    if (!resolved || (resolved !== recordRoot && !resolved.startsWith(`${recordRoot}${path.sep}`))) {
      throw new Error(`Evidence path does not exist under record/: ${citation.sourcePath}`);
    }
    let document = parsedFiles.get(resolved);
    if (document === undefined) {
      document = JSON.parse(await readFile(resolved, "utf8")) as unknown;
      parsedFiles.set(resolved, document);
    }
    if (citation.recordId && !containsObjectId(document, citation.recordId)) {
      throw new Error(
        `Evidence recordId ${citation.recordId} was not found in ${citation.sourcePath}`,
      );
    }
  }
}
