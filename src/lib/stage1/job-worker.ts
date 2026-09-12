import { readFile } from "node:fs/promises";
import path from "node:path";
import { Check } from "typebox/value";
import { CAIRN_ROOT } from "../cairn/config";
import { collectPatientRecord } from "../cairn/collector";
import { writeJsonAtomic } from "../cairn/json-files";
import { hash } from "./input";
import { prepareMortalityInput, readFullCollection, writeEligibleRecord } from "./mortality-input";
import { MortalityInputSchema } from "./mortality-schema";
import { makeLlmMortalityEngine, runMortalityEngine, MORTALITY_INVARIANTS } from "./mortality-engine";
import { createScreening, linkScreening, readScreeningInput, readScreeningResult, saveScreeningResult, screeningDirectory } from "./mortality-store";
import { saveCoverage, readCoverage } from "./coverage";
import { SCREENING_JOBS_ROOT, getScreeningJob, listScreeningJobs, saveScreeningJob, screeningLock, type ScreeningJob } from "./job-queue";

const defaults = { collect: collectPatientRecord, estimate: runMortalityEngine, engine: makeLlmMortalityEngine, handoff: linkScreening };
export type ScreeningDependencies = typeof defaults;
async function update(job: ScreeningJob, patch: Partial<ScreeningJob>) {
  const release = await screeningLock("queue", 3000);
  try {
    const latest = await getScreeningJob(job.id);
    if (!latest) throw new Error("Screening job disappeared");
    const changed = { ...latest, ...patch }; await saveScreeningJob(changed); return changed;
  } finally { await release(); }
}
/** Call only with the worker lock held. Input/result checkpoints survive worker restarts. */
export async function processScreeningJob(job: ScreeningJob, dependencies: ScreeningDependencies = defaults) {
  job = await update(job, { status: "running", attempts: job.attempts + 1, error: undefined });
  const collection = path.join(CAIRN_ROOT, "screening-collections", job.id);
  const directory = screeningDirectory(job.id);
  try {
    // Finish initialization after a crash, but never replace an existing frozen record.
    let rawInput;
    try { rawInput = JSON.parse(await readFile(path.join(directory, "input.json"), "utf8")); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    if (rawInput) {
      if (!Check(MortalityInputSchema, rawInput) || rawInput.screeningId !== job.id || rawInput.patientId !== job.patientId || hash(rawInput.records) !== rawInput.snapshotHash) throw new Error("Frozen input failed verification");
      try { await readFile(path.join(directory, "record/eligible.json")); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; await writeEligibleRecord(directory, rawInput); }
    } else {
      job = await update(job, { phase: "collecting" });
      // The collector preserves each source response and a completed manifest.
      try { await readFullCollection(collection); }
      catch { await dependencies.collect(job.patientId, collection); }
      const source = await readFullCollection(collection);
      if (source.patientId !== job.patientId) throw new Error("Collected patient does not match the screening job");
      const input = prepareMortalityInput(source, job.id);
      await createScreening(input, { ...job.configuration, invariants: MORTALITY_INVARIANTS });
    }
    const input = await readScreeningInput(job.id);
    // Only this fresh-collection job path promotes a screening to the patient workspace.
    const coverage = await readCoverage(job.id, input);
    if (coverage.kind !== "live") await saveCoverage(input, "live", collection);
    let result;
    try { result = await readScreeningResult(job.id); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    if (!result || result.status === "failed") {
      job = await update(job, { phase: "estimating" });
      const { config, prompt } = job.configuration;
      const estimate = await dependencies.estimate(input, config, prompt, dependencies.engine(config.model));
      await writeJsonAtomic(path.join(directory, `attempts-${job.attempts}.json`), estimate.attempts);
      await saveScreeningResult(estimate.result); result = estimate.result;
    }
    if (result.status === "failed") throw new Error("Model estimation failed");
    let stage2JobId = result.stage2JobId ?? undefined;
    if (result.decision === "above_threshold") {
      job = await update(job, { phase: "handoff" });
      stage2JobId = (await dependencies.handoff(job.id)).id;
    }
    return await update(job, { status: "completed", phase: "completed", stage2JobId, error: undefined });
  } catch {
    // Full clinical/provider payloads must never leak into job/API errors.
    await writeJsonAtomic(path.join(SCREENING_JOBS_ROOT, "failures", `${job.id}-${job.attempts}.json`), { at: new Date().toISOString(), phase: job.phase, message: "Job failed; inspect the saved source manifest or model attempts locally." });
    return await update(job, { status: "failed", error: `Screening failed during ${job.phase}. Inspect saved source coverage or model attempts, then retry.` });
  }
}
export async function runScreeningWorkerOnce(requestedId?: string, dependencies: ScreeningDependencies = defaults) {
  const release = await screeningLock("worker");
  try {
    const jobs = await listScreeningJobs();
    // A prior worker's running state is recoverable only after acquiring its exclusive lock.
    for (const j of jobs.filter(j => j.status === "running")) await update(j, j.attempts >= 3
      ? { status: "failed", error: "Worker interrupted three times. Inspect saved checkpoints before starting a new screening." }
      : { status: "queued" });
    const job = (await listScreeningJobs()).find(j => j.status === "queued" && (!requestedId || j.id === requestedId));
    return job ? await processScreeningJob(job, dependencies) : undefined;
  } finally { await release(); }
}
