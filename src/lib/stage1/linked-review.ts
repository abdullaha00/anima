import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Check } from "typebox/value";
import { RUNS_ROOT } from "../cairn/config";
import { getStage2Job } from "../cairn/jobs";
import { Stage2AssessmentSchema } from "../cairn/types";
import { SCREENINGS_ROOT, screeningDirectory, readScreeningInput, readScreeningResult } from "./mortality-store";
import type { MortalityInput, MortalityResult } from "./mortality-schema";
import { readCoverage, type ScreeningCoverage } from "./coverage";

/**
 * Coverage kinds a patient's own pages may display. The strict default is a fresh live
 * collection; the demonstration also shows screenings run from saved snapshot files of the
 * synthetic cohort ("cached") and from authored fixtures. The tamper, identity and snapshot
 * hash checks apply to every kind.
 */
export const DISPLAY_COVERAGE_KINDS: readonly ScreeningCoverage["kind"][] = ["live", "collected", "cached", "authored"];

/**
 * Whether a Stage 2 run may appear on a patient's page. The screening it links to must be
 * for the same patient and the same frozen snapshot, and its coverage must be one of `accept`
 * (a fresh collection only, unless the caller says otherwise). Authored and cached examples
 * always remain in the screening research pages, even when IDs are reused.
 */
export async function patientRunAllowed(patientId: string, runId: string, declaredScreeningId?: string, accept: readonly ScreeningCoverage["kind"][] = ["live"]) {
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
    return input.patientId === patientId && input.snapshotHash === link.snapshotHash && accept.includes((await readCoverage(link.screeningId, input)).kind);
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

/** A finished screening with its verified input, result and coverage sidecar. */
export interface CompletedScreening {
  id: string;
  input: MortalityInput;
  result: MortalityResult;
  coverage: ScreeningCoverage;
  completedAt: string;
}

/**
 * Every completed screening on disk, newest first, keeping only the latest per patient.
 * One directory listing and one state file per screening; the full input, result and
 * coverage are read (and verified) only for the newest candidate of each patient. An
 * empty or missing screenings directory yields an empty map. Screenings whose stored files
 * fail verification are left out rather than shown.
 */
export async function latestScreeningsByPatient(patientId?: string): Promise<Map<string, CompletedScreening>> {
  const out = new Map<string, CompletedScreening>();
  let names: string[];
  try { names = await readdir(SCREENINGS_ROOT); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return out; throw e; }
  const candidates: { id: string; patientId: string; completedAt: string }[] = [];
  await Promise.all(names.filter(n => /^[a-f0-9-]{36}$/.test(n)).map(async id => {
    try {
      const state = JSON.parse(await readFile(path.join(screeningDirectory(id), "state.json"), "utf8")) as { status?: string; patientId?: string; completedAt?: string };
      if (!state.patientId || state.status === "running" || !state.completedAt) return;
      if (patientId && state.patientId !== patientId) return;
      candidates.push({ id, patientId: state.patientId, completedAt: state.completedAt });
    } catch { /* an unreadable or half-written screening is not this reader's problem */ }
  }));
  candidates.sort((a, b) => (a.completedAt === b.completedAt ? b.id.localeCompare(a.id) : a.completedAt < b.completedAt ? 1 : -1));
  const byPatient = new Map<string, typeof candidates>();
  for (const c of candidates) byPatient.set(c.patientId, [...(byPatient.get(c.patientId) ?? []), c]);
  await Promise.all([...byPatient].map(async ([patient, list]) => {
    for (const c of list) {
      try {
        const input = await readScreeningInput(c.id);
        const result = await readScreeningResult(c.id);
        if (result.patientId !== patient) continue;
        out.set(patient, { id: c.id, input, result, coverage: await readCoverage(c.id, input), completedAt: result.generatedAt });
        return;
      } catch { /* a screening that fails its stored-record checks is skipped; the next newest is tried */ }
    }
  }));
  return out;
}

/** The newest completed screening for one patient, if there is one. */
export async function latestScreeningFor(patientId: string): Promise<CompletedScreening | undefined> {
  return (await latestScreeningsByPatient(patientId)).get(patientId);
}
