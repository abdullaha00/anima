import { open, readFile, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { JOBS_ROOT, RUNS_ROOT } from "./config";
import {
  ensureJobDirectories,
  jobStatusDirectory,
  readStage2Job,
  stage2JobPath,
} from "./jobs";
import { errorMessage, writeJsonAtomic } from "./json-files";
import { runStage2Pipeline } from "./pipeline";
import type { Stage2Job } from "./types";

export async function acquireWorkerLock(): Promise<() => Promise<void>> {
  await ensureJobDirectories();
  const lockPath = path.join(JOBS_ROOT, "worker.lock");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(
        `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
        "utf8",
      );
      return async () => {
        await handle.close();
        await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const lock = JSON.parse(await readFile(lockPath, "utf8")) as { pid?: unknown };
      if (typeof lock.pid === "number") {
        try {
          process.kill(lock.pid, 0);
          throw new Error(`Another Stage 2 worker is running with PID ${lock.pid}`);
        } catch (processError) {
          if ((processError as NodeJS.ErrnoException).code !== "ESRCH") {
            throw processError;
          }
        }
      }
      await unlink(lockPath);
    }
  }
  throw new Error("Unable to acquire the Stage 2 worker lock");
}

export async function recoverInterruptedJobs(): Promise<number> {
  await ensureJobDirectories();
  const files = (await readdir(jobStatusDirectory("running"))).filter((file) =>
    file.endsWith(".json"),
  );
  for (const file of files) {
    const runningPath = path.join(jobStatusDirectory("running"), file);
    const job = await readStage2Job(runningPath);
    if (job.status === "completed" || job.status === "failed") {
      await rename(runningPath, path.join(jobStatusDirectory(job.status), file));
      continue;
    }
    const recovered: Stage2Job = {
      ...job,
      status: "queued",
      updatedAt: new Date().toISOString(),
      error: "Recovered after worker interruption",
    };
    await writeJsonAtomic(runningPath, recovered);
    await rename(runningPath, path.join(jobStatusDirectory("queued"), file));
  }
  return files.length;
}

export async function claimNextJob(): Promise<Stage2Job | undefined> {
  await ensureJobDirectories();
  const files = (await readdir(jobStatusDirectory("queued")))
    .filter((file) => file.endsWith(".json"))
    .sort();

  for (const file of files) {
    const queuedPath = path.join(jobStatusDirectory("queued"), file);
    const runningPath = path.join(jobStatusDirectory("running"), file);
    try {
      await rename(queuedPath, runningPath);
      const job = await readStage2Job(runningPath);
      const claimed: Stage2Job = {
        ...job,
        status: "running",
        attempts: job.attempts + 1,
        updatedAt: new Date().toISOString(),
        error: undefined,
      };
      await writeJsonAtomic(runningPath, claimed);
      return claimed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return undefined;
}

export async function processStage2Job(job: Stage2Job): Promise<Stage2Job> {
  const runningPath = stage2JobPath("running", job.id);
  try {
    const run = await runStage2Pipeline(job.patientId, job.id);
    const completed: Stage2Job = {
      ...job,
      status: "completed",
      updatedAt: new Date().toISOString(),
      runDirectory: run.runDirectory,
      resultPath: path.join(run.runDirectory, "analysis", "final.json"),
      error: undefined,
    };
    await writeJsonAtomic(runningPath, completed);
    await rename(runningPath, stage2JobPath("completed", job.id));
    return completed;
  } catch (error) {
    const failed: Stage2Job = {
      ...job,
      status: "failed",
      updatedAt: new Date().toISOString(),
      runDirectory: path.join(RUNS_ROOT, job.id),
      error: errorMessage(error),
    };
    await writeJsonAtomic(runningPath, failed);
    await rename(runningPath, stage2JobPath("failed", job.id));
    return failed;
  }
}
