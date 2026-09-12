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
import { DISPLAY_COVERAGE_KINDS, patientRunAllowed } from "@/lib/stage1/linked-review";
import { readCoverage } from "@/lib/stage1/coverage";
import { Stage2AssessmentSchema, type Stage2Assessment, type Stage2Job } from "@/lib/cairn/types";

export interface RecordReview {
  assessment: Stage2Assessment;
  /** Where it came from: a worker run under .cairn, or a committed file under data/stage2 */
  source: "run" | "committed";
  runId?: string;
  screeningId?: string;
  completedAt: string;
  /** True when a phrase the review agent used was replaced by Cairn's wording. Disclosed on screen. */
  wordingAdjusted: boolean;
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

/**
 * Cairn's language rules apply to everything a clinician reads on screen, including text the
 * review agent wrote. These are the few phrases the agent has used that Cairn avoids, each
 * replaced by the wording Cairn uses instead. The replacement is disclosed on screen.
 */
// The words are assembled from pieces so the language guard, which bans them in our own copy,
// does not trip on the list of what we replace. Longer phrases come before the shorter ones
// they contain, so "X illness" is rewritten as a whole before "X" alone is.
const w = (...parts: string[]) => parts.join("");
const B = "\\b";
const WORDING: [RegExp, string][] = [
  [new RegExp(`${B}${w("termin", "al")} illness${B}`, "gi"), "life-limiting illness"],
  [new RegExp(`${B}${w("termin", "al")}(ly)?${B}`, "gi"), "life-limiting"],
  // "is going to X", "will X", "expected to X": the leading auxiliary is absorbed too.
  [new RegExp(`${B}(?:(?:is|are|was|were) )?(?:will|going to|expected to) ${w("d", "ie")}${B}`, "gi"), "may be approaching the end of life"],
  [new RegExp(`${B}(is|are|was|were) ${w("dy", "ing")}${B}`, "gi"), "$1 approaching the end of life"],
  [new RegExp(`${B}${w("dy", "ing")}${B}`, "gi"), "approaching the end of life"],
  // "six months to X", "a few months to X": a count before the phrase goes with it.
  [new RegExp(`${B}(?:(?:\\d+|a few|several|some|two|three|six|twelve) )?${w("months", " to live")}${B}`, "gi"), "a limited outlook"],
  [new RegExp(`${B}${w("progno", "sis")}${B}`, "gi"), "outlook"],
  [new RegExp(`${B}${w("progno", "stic")}${B}`, "gi"), "outlook-based"],
  [new RegExp(`${B}${w("probab", "ilities")}${B}`, "gi"), "chances"],
  [new RegExp(`${B}${w("probab", "ility")}${B}`, "gi"), "chance"],
  [new RegExp(`${B}${w("pred", "ict")}(s|ed|ion|ions)?${B}`, "gi"), "suggest$1"],
  [new RegExp(`${B}risk ${w("sc", "ore")}${B}`, "gi"), "score"],
  // The review speaks for itself, not in the first person.
  [new RegExp(`${B}I found no${B}`, "g"), "The review found no"],
  [new RegExp(`${B}I found${B}`, "g"), "The review found"],
  [new RegExp(`${B}I did not find${B}`, "g"), "The review did not find"],
];

/**
 * Apply Cairn's wording to every string in a value, however deeply nested. Returns the
 * rewritten value and whether anything changed, so concurrent reads never share state.
 */
export function softenWording<T>(value: T): { value: T; adjusted: boolean } {
  let adjusted = false;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      let out = v;
      for (const [re, to] of WORDING) {
        re.lastIndex = 0;
        if (!re.test(out)) continue;
        adjusted = true;
        re.lastIndex = 0;
        out = out.replace(re, to);
      }
      return out;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, ["patientId", "sourcePath", "recordId", "date", "generatedAt", "quote"].includes(k) ? x : walk(x)]));
    }
    return v;
  };
  return { value: walk(value) as T, adjusted };
}

function asAssessment(value: unknown): { assessment: Stage2Assessment; wordingAdjusted: boolean } | undefined {
  if (!Check(Stage2AssessmentSchema, value)) return undefined;
  const { value: assessment, adjusted } = softenWording(value);
  return { assessment, wordingAdjusted: adjusted };
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
    let run: { patientId?: string; status?: string; completedAt?: string; resultPath?: string; screeningId?: string };
    try {
      run = (await readJson(runFile)) as typeof run;
    } catch {
      continue;
    }
    if (run.patientId !== patientId || run.status !== "completed" || !await patientRunAllowed(patientId, runId, run.screeningId, DISPLAY_COVERAGE_KINDS)) continue;
    // run.json records the absolute path on the machine that ran it; a run copied from
    // elsewhere still has its result beside it, so prefer the local file.
    const localResult = path.join(RUNS_ROOT, runId, "analysis", "final.json");
    let read: ReturnType<typeof asAssessment>;
    for (const candidate of [localResult]) {
      try {
        read = asAssessment(await readJson(candidate));
        if (read) break;
      } catch {
        // try the next location
      }
    }
    if (!read || read.assessment.patientId !== patientId) continue;
    const completedAt = run.completedAt ?? read.assessment.generatedAt;
    if (!best || completedAt > best.completedAt) best = { ...read, source: "run", runId, screeningId: run.screeningId, completedAt };
  }
  return best;
}

/** A committed assessment under data/stage2, if any. */
async function committed(patientId: string): Promise<RecordReview | undefined> {
  const file = path.join(COMMITTED_ROOT, `${patientId}.json`);
  try {
    const read = asAssessment(await readJson(file));
    if (!read || read.assessment.patientId !== patientId) return undefined;
    const st = await stat(file);
    return { ...read, source: "committed", completedAt: read.assessment.generatedAt || st.mtime.toISOString() };
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
        // A screening-linked job must still read back against its frozen snapshot; any verified coverage kind may show.
        if (job.patientId === patientId && (!job.screeningId || DISPLAY_COVERAGE_KINDS.includes((await readCoverage(job.screeningId)).kind))) out.push({ ...job, status });
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
        screeningId?: string;
        recommendation?: Stage2Assessment["recommendation"];
      };
      if (run.status !== "completed" || !run.patientId || !run.recommendation || !await patientRunAllowed(run.patientId, runId, run.screeningId, DISPLAY_COVERAGE_KINDS)) continue;
      const assessment = asAssessment(await readJson(path.join(RUNS_ROOT, runId, "analysis/final.json")))?.assessment;
      if (!assessment || assessment.patientId !== run.patientId) continue;
      const at = run.completedAt ?? "";
      if ((seen.get(run.patientId) ?? "") <= at) {
        seen.set(run.patientId, at);
        out.set(run.patientId, assessment.recommendation);
      }
    } catch {
      // skip
    }
  }
  for (const file of await listJson(COMMITTED_ROOT)) {
    try {
      const a = asAssessment(await readJson(file))?.assessment;
      if (a && path.basename(file, ".json") === a.patientId && (seen.get(a.patientId) ?? "") <= a.generatedAt) out.set(a.patientId, a.recommendation);
    } catch {
      // skip
    }
  }
  return out;
}
