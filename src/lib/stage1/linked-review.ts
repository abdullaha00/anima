import { readFile } from "node:fs/promises";
import path from "node:path";
import { Check } from "typebox/value";
import { RUNS_ROOT } from "../cairn/config";
import { getStage2Job } from "../cairn/jobs";
import { Stage2AssessmentSchema } from "../cairn/types";
import { readScreeningInput, readScreeningResult } from "./mortality-store";
import { readCoverage } from "./coverage";

/** Authored/cached examples stay in screening research pages, even if IDs are reused. */
export async function patientRunAllowed(patientId: string, runId: string, declaredScreeningId?: string) {
  try {
    let link;
    try { link = JSON.parse(await readFile(path.join(RUNS_ROOT, runId, "screening-link.json"), "utf8")); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") return false;
      const job = await getStage2Job(runId);
      return !declaredScreeningId && !job?.screeningId; // Legacy direct Stage 2 reviews remain supported.
    }
    if (declaredScreeningId && link.screeningId !== declaredScreeningId) return false;
    const input = await readScreeningInput(link.screeningId);
    return input.patientId === patientId && input.snapshotHash === link.snapshotHash && (await readCoverage(link.screeningId, input)).kind === "live";
  } catch { return false; }
}
export async function verifiedLinkedReview(screeningId: string) {
  const input = await readScreeningInput(screeningId);
  const result = await readScreeningResult(screeningId);
  if (!result.stage2JobId || result.decision !== "above_threshold") throw new Error("This screening has no linked review");
  const job = await getStage2Job(result.stage2JobId);
  if (!job || job.status !== "completed" || job.patientId !== input.patientId) throw new Error("Linked review is not complete");
  const link = JSON.parse(await readFile(path.join(RUNS_ROOT, job.id, "screening-link.json"), "utf8"));
  if (link.snapshotHash !== input.snapshotHash) throw new Error("Review snapshot does not match screening");
  const linkedInput = await readScreeningInput(link.screeningId);
  if (linkedInput.patientId !== input.patientId || linkedInput.indexTime !== input.indexTime || linkedInput.snapshotHash !== input.snapshotHash) throw new Error("Review belongs to a different screening input");
  const assessment: unknown = JSON.parse(await readFile(path.join(RUNS_ROOT, job.id, "analysis/final.json"), "utf8"));
  if (!Check(Stage2AssessmentSchema, assessment) || assessment.patientId !== input.patientId) throw new Error("Invalid linked assessment");
  return { input, result, job, assessment, coverage: await readCoverage(screeningId, input) };
}
