import { createHash } from "node:crypto";
import { open, readFile, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { JOBS_ROOT, assertPatientId } from "./config";
import { ensureDirectory, writeJsonAtomic } from "./json-files";
import type { JobStatus, Stage2Job } from "./types";

export const JOB_STATUSES: JobStatus[] = [
  "queued",
  "running",
  "completed",
  "failed",
];

export class QueueCapacityError extends Error {}
export class IdempotencyConflictError extends Error {}

export function jobStatusDirectory(status: JobStatus): string {
  return path.join(JOBS_ROOT, status);
}

export function stage2JobPath(status: JobStatus, id: string): string {
  return path.join(jobStatusDirectory(status), `${id}.json`);
}

function idempotencyDirectory(): string {
  return path.join(JOBS_ROOT, "idempotency");
}

export async function ensureJobDirectories(): Promise<void> {
  await Promise.all([
    ...JOB_STATUSES.map((status) => ensureDirectory(jobStatusDirectory(status))),
    ensureDirectory(idempotencyDirectory()),
  ]);
}

export async function readStage2Job(filePath: string): Promise<Stage2Job> {
  return JSON.parse(await readFile(filePath, "utf8")) as Stage2Job;
}

async function acquireEnqueueLock(): Promise<() => Promise<void>> {
  const lockPath = path.join(JOBS_ROOT, "enqueue.lock");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${process.pid}\n`, "utf8");
      return async () => {
        await handle.close();
        await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const metadata = await stat(lockPath).catch(() => undefined);
      if (metadata && Date.now() - metadata.mtimeMs > 30_000) {
        await unlink(lockPath).catch(() => undefined);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("Timed out waiting for the Stage 2 enqueue lock");
}

async function jobsIn(status: "queued" | "running"): Promise<Stage2Job[]> {
  const directory = jobStatusDirectory(status);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
  return Promise.all(files.map((file) => readStage2Job(path.join(directory, file))));
}

export async function enqueueStage2Job(
  inputPatientId: string,
  options: { idempotencyKey?: string; screeningId?: string } = {},
): Promise<Stage2Job> {
  const patientId = assertPatientId(inputPatientId);
  const screening = options.screeningId ? await (await import("../stage1/mortality-store")).readScreeningResult(options.screeningId) : undefined;
  if (screening && (screening.patientId !== patientId || screening.decision !== "above_threshold")) throw new Error("Screening must match the patient and require escalation");
  const idempotencyKey = options.idempotencyKey?.trim();
  if (idempotencyKey !== undefined && (idempotencyKey.length === 0 || idempotencyKey.length > 200)) {
    throw new Error("Idempotency-Key must contain 1 to 200 characters");
  }

  await ensureJobDirectories();
  const release = await acquireEnqueueLock();
  try {
    if (idempotencyKey) {
      const digest = createHash("sha256").update(idempotencyKey).digest("hex");
      const mappingPath = path.join(idempotencyDirectory(), `${digest}.json`);
      try {
        const mapping = JSON.parse(await readFile(mappingPath, "utf8")) as {
          jobId: string;
          patientId: string;
          screeningId?: string;
        };
        if (mapping.patientId !== patientId) {
          throw new IdempotencyConflictError(
            "Idempotency-Key was already used for another patient",
          );
        }
        const existing = await getStage2Job(mapping.jobId);
        if (existing) {
          if ((mapping.screeningId ?? existing.screeningId) !== options.screeningId) throw new IdempotencyConflictError("Idempotency-Key was already used for another screening");
          return existing;
        }
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== "ENOENT" &&
          error instanceof IdempotencyConflictError
        ) {
          throw error;
        }
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    if (options.screeningId) {
      try {
        const link = JSON.parse(await readFile(path.join(JOBS_ROOT, "screening-links", `${options.screeningId}.json`), "utf8"));
        const existing = await getStage2Job(link.jobId);
        if (existing && existing.patientId === patientId) {
          if (idempotencyKey) await writeJsonAtomic(path.join(idempotencyDirectory(), `${createHash("sha256").update(idempotencyKey).digest("hex")}.json`), { jobId: existing.id, patientId, screeningId: options.screeningId });
          return existing;
        }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }

    const [queued, running] = await Promise.all([
      jobsIn("queued"),
      jobsIn("running"),
    ]);
    // Job-embedded keys also recover an interruption after job write but before mapping write.
    const all = [...queued, ...running];
    if (idempotencyKey) for (const status of ["completed", "failed"] as const) {
      for (const file of (await readdir(jobStatusDirectory(status))).filter(f => f.endsWith(".json"))) {
        const job = await readStage2Job(path.join(jobStatusDirectory(status), file));
        if (job.idempotencyKeys?.includes(idempotencyKey)) all.push(job);
      }
    }
    let existingPatientJob = idempotencyKey ? all.find(job => job.idempotencyKeys?.includes(idempotencyKey)) : undefined;
    if (existingPatientJob && (existingPatientJob.patientId !== patientId || existingPatientJob.screeningId !== options.screeningId)) {
      throw new IdempotencyConflictError("Idempotency-Key conflicts with an existing job");
    }
    for (const job of existingPatientJob ? [] : all) {
      if (job.patientId !== patientId || !["queued", "running"].includes(job.status)) continue;
      if (!screening && !job.screeningId) { existingPatientJob = job; break; }
      if (screening && job.screeningId) {
        const original = await (await import("../stage1/mortality-store")).readScreeningResult(job.screeningId);
        if (original.snapshotHash === screening.snapshotHash && original.indexTime === screening.indexTime) { existingPatientJob = job; break; }
      }
    }
    if (existingPatientJob) {
      // Do not rewrite a running job (the worker owns it); append associations to a sidecar.
      if (options.screeningId) await writeJsonAtomic(path.join(JOBS_ROOT, "screening-links", `${options.screeningId}.json`), { jobId: existingPatientJob.id, screeningId: options.screeningId });
      if (idempotencyKey) await writeJsonAtomic(path.join(idempotencyDirectory(), `${createHash("sha256").update(idempotencyKey).digest("hex")}.json`), { jobId: existingPatientJob.id, patientId, screeningId: options.screeningId });
      return existingPatientJob;
    }

    const configuredCapacity = Number(process.env.CAIRN_QUEUE_CAPACITY ?? 100);
    const capacity =
      Number.isSafeInteger(configuredCapacity) && configuredCapacity > 0
        ? configuredCapacity
        : 100;
    if (queued.length + running.length >= capacity) {
      throw new QueueCapacityError("Stage 2 queue is at capacity");
    }

    const now = new Date().toISOString();
    const job: Stage2Job = {
      id: crypto.randomUUID(),
      patientId,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      ...(options.screeningId ? { screeningId: options.screeningId, screeningIds: [options.screeningId] } : {}),
      ...(idempotencyKey ? { idempotencyKeys: [idempotencyKey] } : {}),
    };
    await writeJsonAtomic(stage2JobPath("queued", job.id), job);
    if (options.screeningId) await writeJsonAtomic(path.join(JOBS_ROOT, "screening-links", `${options.screeningId}.json`), { jobId: job.id, screeningId: options.screeningId });
    if (idempotencyKey) {
      const digest = createHash("sha256").update(idempotencyKey).digest("hex");
      await writeJsonAtomic(path.join(idempotencyDirectory(), `${digest}.json`), {
        jobId: job.id,
        patientId,
        screeningId: options.screeningId,
        createdAt: now,
      });
    }
    return job;
  } finally {
    await release();
  }
}

export async function getStage2Job(id: string): Promise<Stage2Job | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  await ensureJobDirectories();
  for (const status of JOB_STATUSES) {
    try {
      return await readStage2Job(stage2JobPath(status, id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return undefined;
}
