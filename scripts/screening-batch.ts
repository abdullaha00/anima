#!/usr/bin/env node
import "../src/lib/cairn/load-env";
import { parseArgs } from "node:util";
import path from "node:path";
import { CAIRN_ROOT, assertPatientId } from "../src/lib/cairn/config";
import { enqueueScreening, publicScreeningJob } from "../src/lib/stage1/job-queue";
import { runScreeningWorkerOnce } from "../src/lib/stage1/job-worker";
import { readCoverage } from "../src/lib/stage1/coverage";
import { readScreeningInput, readScreeningResult } from "../src/lib/stage1/mortality-store";
import { writeJsonAtomic } from "../src/lib/cairn/json-files";
import { acquireWorkerLock, recoverInterruptedJobs, claimNextJob, processStage2Job } from "../src/lib/cairn/job-worker";
const { values } = parseArgs({ args: process.argv.slice(2), options: { patients: { type: "string" }, "stage2": { type: "boolean" }, id: { type: "string" } } });
const patients = [...new Set((values.patients ?? "").split(",").filter(Boolean).map(assertPatientId))];
if (!patients.length || patients.length > 10) throw new Error("Supply 1–10 comma-separated fictional --patients");
const id = values.id ?? crypto.randomUUID();
if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Batch ID must be a UUID");
const directory = path.join(CAIRN_ROOT, "batches", id);
const rows: unknown[] = [];
console.log(JSON.stringify({ batchId: id, patients, directory }));
for (const patientId of patients) {
  const startedAt = new Date().toISOString();
  const queued = await enqueueScreening(patientId, `batch:${id}:${patientId}`);
  console.log(JSON.stringify({ patientId, screeningId: queued.id, status: queued.status }));
  const job = queued.status === "queued" || queued.status === "running" ? await runScreeningWorkerOnce(queued.id) : queued;
  if (!job) throw new Error("Batch worker did not claim the requested job");
  const result = await readScreeningResult(job.id).catch(() => undefined);
  const input = await readScreeningInput(job.id).catch(() => undefined);
  const coverage = await readCoverage(job.id).catch(() => undefined);
  let stage2Status: string | undefined;
  if (values.stage2 && job.stage2JobId) {
    const release = await acquireWorkerLock();
    try {
      await recoverInterruptedJobs();
      const next = await claimNextJob(job.stage2JobId);
      if (next) stage2Status = (await processStage2Job(next)).status;
      else { const { getStage2Job } = await import("../src/lib/cairn/jobs"); stage2Status = (await getStage2Job(job.stage2JobId))?.status; }
    } finally { await release(); }
  }
  const row = { ...publicScreeningJob(job), startedAt, finishedAt: new Date().toISOString(), eligibleRecords: input?.records.length, coverage,
    resultStatus: result?.status, deathProbability3m: result?.deathProbability3m, decision: result?.decision, reason: result?.reason, stage2Status };
  rows.push(row); await writeJsonAtomic(path.join(directory, "report.json"), { id, patients, rows, validation: "Software smoke test on fictional records; no labelled mortality evaluation" });
  console.log(JSON.stringify(row));
}
if (rows.some(r => (r as { status: string }).status === "failed")) process.exitCode = 1;
