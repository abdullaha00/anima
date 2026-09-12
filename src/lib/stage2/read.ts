/**
 * Read Stage 2 record reviews for the screens.
 *
 * Stage 2 is the record-review pipeline in src/lib/cairn: a collector snapshots the whole
 * record, a read-only agent prepares an assessment, and a second agent verifies it. Its
 * results land under CAIRN_DATA_DIR (default .cairn), which is gitignored. For a demo that
 * has to run offline, a completed assessment can also be committed as
 * data/stage2/<patientId>.json; the freshest of the two is used.
 *
 * Server-only. Nothing here runs an agent; it only reads what the worker wrote.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Check } from "typebox/value";
import { JOBS_ROOT, RUNS_ROOT } from "@/lib/cairn/config";
import { Stage2AssessmentSchema, type Stage2Assessment, type Stage2Job } from "@/lib/cairn/types";

export interface RecordReview {
  assessment: Stage2Assessment;
  /** Where it came from: a worker run under .cairn, or a committed file under data/stage2 */
  source: "run" | "committed";
  runId?: string;
  completedAt: string;
}

export interface ReviewStatus {
  /** The latest completed review, if any */
  review?: RecordReview;
  /** A job that is queued or running right now, if any */
  pending?: Pick<Stage2Job, "id" | "status" | "createdAt" | "updatedAt">;
  /** The most recent failed job, if it is newer than the latest completed review */
  failed?: Pick<Stage2Job, "id" | "updatedAt" | "error">;
}

const COMMITTED_ROOT = path.join(process.cwd(), "data", "stage2");

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

async function listJson(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function asAssessment(value: unknown): Stage2Assessment | undefined {
  return Check(Stage2AssessmentSchema, value) ? (value as Stage2Assessment) : undefined;
}

/** The latest completed run for a patient under .cairn/runs, if any. */
async function latestRun(patientId: string): Promise<RecordReview | undefined> {
  let best: RecordReview | undefined;
  let runIds: string[] = [];
  try {
    runIds = await readdir(RUNS_ROOT);
  } catch {
    return undefined;
  }
  for (const runId of runIds) {
    const runFile = path.join(RUNS_ROOT, runId, "run.json");
    let run: { patientId?: string; status?: string; completedAt?: string; resultPath?: string };
    try {
      run = (await readJson(runFile)) as typeof run;
    } catch {
      continue;
    }
    if (run.patientId !== patientId || run.status !== "completed") continue;
    const resultPath = run.resultPath ?? path.join(RUNS_ROOT, runId, "analysis", "final.json");
    let assessment: Stage2Assessment | undefined;
    try {
      assessment = asAssessment(await readJson(resultPath));
    } catch {
      continue;
    }
    if (!assessment) continue;
    const completedAt = run.completedAt ?? assessment.generatedAt;
    if (!best || completedAt > best.completedAt) best = { assessment, source: "run", runId, completedAt };
  }
  return best;
}

/** A committed assessment under data/stage2, if any. */
async function committed(patientId: string): Promise<RecordReview | undefined> {
  const file = path.join(COMMITTED_ROOT, `${patientId}.json`);
  try {
    const assessment = asAssessment(await readJson(file));
    if (!assessment) return undefined;
    const st = await stat(file);
    return { assessment, source: "committed", completedAt: assessment.generatedAt || st.mtime.toISOString() };
  } catch {
    return undefined;
  }
}

/** Queued, running and failed jobs for a patient, newest first. */
async function jobsFor(patientId: string): Promise<Stage2Job[]> {
  const out: Stage2Job[] = [];
  for (const status of ["queued", "running", "failed"] as const) {
    for (const file of await listJson(path.join(JOBS_ROOT, status))) {
      try {
        const job = (await readJson(file)) as Stage2Job;
        if (job.patientId === patientId) out.push({ ...job, status });
      } catch {
        // an unreadable job file is not this screen's problem
      }
    }
  }
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Everything a screen needs to say about the record review for one patient. */
export async function getReviewStatus(patientId: string): Promise<ReviewStatus> {
  const [run, file, jobs] = await Promise.all([latestRun(patientId), committed(patientId), jobsFor(patientId)]);
  const review = [run, file].filter((r): r is RecordReview => !!r).sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))[0];
  const pending = jobs.find((j) => j.status === "queued" || j.status === "running");
  const lastFailed = jobs.find((j) => j.status === "failed");
  const failed = lastFailed && (!review || lastFailed.updatedAt > review.completedAt) ? lastFailed : undefined;
  return {
    review,
    pending: pending ? { id: pending.id, status: pending.status, createdAt: pending.createdAt, updatedAt: pending.updatedAt } : undefined,
    failed: failed ? { id: failed.id, updatedAt: failed.updatedAt, error: failed.error } : undefined,
  };
}

/** Patient ids that have a completed review, for the worklist. */
export async function reviewedPatientIds(): Promise<Map<string, Stage2Assessment["recommendation"]>> {
  const out = new Map<string, Stage2Assessment["recommendation"]>();
  const seen = new Map<string, string>();
  let runIds: string[] = [];
  try {
    runIds = await readdir(RUNS_ROOT);
  } catch {
    // no runs yet
  }
  for (const runId of runIds) {
    try {
      const run = (await readJson(path.join(RUNS_ROOT, runId, "run.json"))) as {
        patientId?: string;
        status?: string;
        completedAt?: string;
        recommendation?: Stage2Assessment["recommendation"];
      };
      if (run.status !== "completed" || !run.patientId || !run.recommendation) continue;
      const at = run.completedAt ?? "";
      if ((seen.get(run.patientId) ?? "") <= at) {
        seen.set(run.patientId, at);
        out.set(run.patientId, run.recommendation);
      }
    } catch {
      // skip
    }
  }
  for (const file of await listJson(COMMITTED_ROOT)) {
    try {
      const a = asAssessment(await readJson(file));
      if (a && (seen.get(a.patientId) ?? "") <= a.generatedAt) out.set(a.patientId, a.recommendation);
    } catch {
      // skip
    }
  }
  return out;
}
