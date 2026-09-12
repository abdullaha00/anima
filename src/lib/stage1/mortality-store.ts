import { mkdir, mkdtemp, rename, rm, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { Check } from "typebox/value";
import { CAIRN_ROOT } from "../cairn/config";
import { writeJsonAtomic } from "../cairn/json-files";
import { hash } from "./input";
import { MortalityInputSchema, validateMortalityResult, type MortalityInput, type MortalityResult } from "./mortality-schema";
import { writeEligibleRecord } from "./mortality-input";

export const SCREENINGS_ROOT = path.join(CAIRN_ROOT, "screenings");
export function screeningDirectory(id: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new Error("Invalid screening ID");
  return path.join(SCREENINGS_ROOT, id);
}
export async function createScreening(input: MortalityInput, configuration: unknown) {
  await mkdir(SCREENINGS_ROOT, { recursive: true });
  const directory = screeningDirectory(input.screeningId);
  const staging = await mkdtemp(path.join(SCREENINGS_ROOT, `.initializing-${input.screeningId}-`));
  try {
    await writeJsonAtomic(path.join(staging, "input.json"), input);
    await writeJsonAtomic(path.join(staging, "configuration.json"), configuration);
    await writeEligibleRecord(staging, input);
    await writeJsonAtomic(path.join(staging, "state.json"), { status: "running", patientId: input.patientId, startedAt: new Date().toISOString() });
    await rename(staging, directory); // Existing non-empty frozen runs cannot be replaced.
  } finally { await rm(staging, { recursive: true, force: true }); }
  return directory;
}
export async function readScreeningInput(id: string): Promise<MortalityInput> {
  const directory = screeningDirectory(id);
  const resolved = await realpath(directory); const root = await realpath(SCREENINGS_ROOT);
  if (resolved !== path.join(root, id)) throw new Error("Screening must not be a symlink");
  const input: unknown = JSON.parse(await readFile(path.join(directory, "input.json"), "utf8"));
  if (!Check(MortalityInputSchema, input)) throw new Error("Stored input schema invalid");
  const data = input as MortalityInput;
  if (data.screeningId !== id || hash(data.records) !== data.snapshotHash) throw new Error("Stored screening snapshot hash mismatch");
  const eligible: unknown = JSON.parse(await readFile(path.join(directory, "record/eligible.json"), "utf8"));
  if (hash(eligible) !== hash(data.records.map(r => r.value))) throw new Error("Frozen record changed after screening");
  return data;
}
export async function readScreeningResult(id: string): Promise<MortalityResult> {
  const input = await readScreeningInput(id);
  return validateMortalityResult(JSON.parse(await readFile(path.join(screeningDirectory(id), "result.json"), "utf8")), input);
}
export async function saveScreeningResult(result: MortalityResult) {
  validateMortalityResult(result, await readScreeningInput(result.screeningId));
  const directory = screeningDirectory(result.screeningId);
  await writeJsonAtomic(path.join(directory, "result.json"), result);
  await writeJsonAtomic(path.join(directory, "state.json"), { status: result.status, patientId: result.patientId, completedAt: result.generatedAt });
}
export async function linkScreening(id: string) {
  const result = await readScreeningResult(id);
  if (result.decision !== "above_threshold") throw new Error("Only above-threshold screenings can enqueue Stage 2");
  const { enqueueStage2Job } = await import("../cairn/jobs");
  const job = await enqueueStage2Job(result.patientId, { screeningId: id, idempotencyKey: `screening:${id}` });
  await saveScreeningResult({ ...result, stage2JobId: job.id });
  return job;
}
export async function listScreenings(): Promise<{ id: string; patientId?: string; provenance?: string; status: string; result?: MortalityResult }[]> {
  let names: string[];
  try { names = await readdir(SCREENINGS_ROOT); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
  return Promise.all(names.filter(n => /^[a-f0-9-]{36}$/.test(n)).sort().map(async id => {
    try {
      const state = JSON.parse(await readFile(path.join(screeningDirectory(id), "state.json"), "utf8"));
      if (state.status === "running") return { id, patientId: state.patientId, status: "running" };
      const result = await readScreeningResult(id);
      const input = await readScreeningInput(id);
      return { id, patientId: result.patientId, provenance: input.provenance, status: result.status, result };
    } catch { return { id, status: "unavailable" }; }
  }));
}
