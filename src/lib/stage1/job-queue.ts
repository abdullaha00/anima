import { mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { CAIRN_ROOT, assertPatientId } from "../cairn/config";
import { writeJsonAtomic } from "../cairn/json-files";
import { loadMortalityConfig, type MortalityConfig } from "./mortality-engine";

export const SCREENING_JOBS_ROOT = path.join(CAIRN_ROOT, "screening-jobs");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export interface ScreeningJob {
  id: string; patientId: string; status: "queued" | "running" | "completed" | "failed";
  phase: "queued" | "collecting" | "estimating" | "handoff" | "completed";
  createdAt: string; updatedAt: string; attempts: number; keys: string[];
  configuration: { config: MortalityConfig; prompt: string };
  stage2JobId?: string; error?: string;
}
export class ScreeningJobError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
function jobPath(id: string) {
  if (!UUID.test(id)) throw new ScreeningJobError("Invalid screening job ID", 400);
  return path.join(SCREENING_JOBS_ROOT, `${id}.json`);
}
export async function getScreeningJob(id: string): Promise<ScreeningJob | undefined> {
  try {
    const job: ScreeningJob = JSON.parse(await readFile(jobPath(id), "utf8"));
    if (job.id !== id || !["queued", "running", "completed", "failed"].includes(job.status) || assertPatientId(job.patientId) !== job.patientId) throw new Error("Invalid stored screening job");
    return job;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw e; }
}
export async function listScreeningJobs() {
  await mkdir(SCREENING_JOBS_ROOT, { recursive: true });
  const names = (await readdir(SCREENING_JOBS_ROOT)).filter(n => UUID.test(n.replace(/\.json$/, "")) && n.endsWith(".json"));
  const jobs = await Promise.all(names.map(n => getScreeningJob(n.slice(0, -5))));
  return jobs.filter((j): j is ScreeningJob => !!j).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function saveScreeningJob(job: ScreeningJob) {
  job.updatedAt = new Date().toISOString();
  await writeJsonAtomic(jobPath(job.id), job);
}
/** One host, local disk. Hold the worker lock while recovering and processing jobs. */
export async function screeningLock(name: "worker" | "queue", waitMs = 0): Promise<() => Promise<void>> {
  await mkdir(SCREENING_JOBS_ROOT, { recursive: true });
  const lockPath = path.join(SCREENING_JOBS_ROOT, `${name}.lock`);
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid }));
      return async () => { await handle.close(); await unlink(lockPath); };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        const lock = JSON.parse(await readFile(lockPath, "utf8"));
        if (Number.isSafeInteger(lock.pid) && lock.pid > 0) {
          try { process.kill(lock.pid, 0); }
          catch (err) { if ((err as NodeJS.ErrnoException).code === "ESRCH") { await unlink(lockPath).catch(() => {}); continue; } throw err; }
        }
      } catch (err) { if ((err as NodeJS.ErrnoException).code === "ENOENT") continue; /* a writer may still be filling the lock */ }
      if (Date.now() >= deadline) throw new ScreeningJobError(`Screening ${name} is busy`, 409);
      await new Promise(r => setTimeout(r, 25));
    }
  }
}
export async function enqueueScreening(patient: string, key?: string): Promise<ScreeningJob> {
  const patientId = assertPatientId(patient);
  if (key !== undefined && (!key.trim() || key.length > 200)) throw new ScreeningJobError("Idempotency key must contain 1–200 characters", 400);
  const configuration = await loadMortalityConfig("config/stage1/mortality.json", process.env.CAIRN_STAGE1_MODEL ? { model: process.env.CAIRN_STAGE1_MODEL } : {});
  const release = await screeningLock("queue", 3000);
  try {
    const jobs = await listScreeningJobs();
    const existing = key ? jobs.find(j => j.keys.includes(key)) : undefined;
    if (existing) {
      if (existing.patientId !== patientId) throw new ScreeningJobError("Idempotency key belongs to another patient", 409);
      return existing;
    }
    const active = jobs.find(j => j.patientId === patientId && ["queued", "running"].includes(j.status));
    if (active) { if (key) { active.keys.push(key); await saveScreeningJob(active); } return active; }
    if (jobs.filter(j => ["queued", "running"].includes(j.status)).length >= 100) throw new ScreeningJobError("Screening queue is full", 429);
    const now = new Date().toISOString();
    const job: ScreeningJob = { id: crypto.randomUUID(), patientId, status: "queued", phase: "queued", attempts: 0, keys: key ? [key] : [], createdAt: now, updatedAt: now, configuration };
    await saveScreeningJob(job); return job;
  } finally { await release(); }
}
export async function retryScreening(id: string) {
  const release = await screeningLock("queue", 3000);
  try {
    const job = await getScreeningJob(id);
    if (!job) throw new ScreeningJobError("Screening job not found", 404);
    if (job.status !== "failed") throw new ScreeningJobError("Only failed jobs can be retried", 409);
    if (job.attempts >= 3) throw new ScreeningJobError("Three job attempts used; inspect the failure before starting a new screening", 409);
    if ((await listScreeningJobs()).some(j => j.patientId === job.patientId && ["queued", "running"].includes(j.status))) throw new ScreeningJobError("This patient already has an active screening", 409);
    job.status = "queued"; job.error = undefined; await saveScreeningJob(job); return job;
  } finally { await release(); }
}
export function publicScreeningJob(job: ScreeningJob) {
  const { id, patientId, status, phase, createdAt, updatedAt, attempts, stage2JobId, error } = job;
  return { id, patientId, status, phase, createdAt, updatedAt, attempts, stage2JobId, error };
}
