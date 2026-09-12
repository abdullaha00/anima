import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtemp, rm, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { MortalityEngine } from "../src/lib/stage1/mortality-engine";
import type { ScreeningDependencies } from "../src/lib/stage1/job-worker";
const root = await mkdtemp("/tmp/cairn-screening-jobs-");
process.env.CAIRN_DATA_DIR = root;
const queue = await import("../src/lib/stage1/job-queue");
const worker = await import("../src/lib/stage1/job-worker");
const store = await import("../src/lib/stage1/mortality-store");
const { readFullSnapshot, prepareMortalityInput, writeEligibleRecord } = await import("../src/lib/stage1/mortality-input");
const { runMortalityEngine } = await import("../src/lib/stage1/mortality-engine");
const { readCoverage, saveCoverage, coverageLabel } = await import("../src/lib/stage1/coverage");
const { patientRunAllowed, verifiedLinkedReview } = await import("../src/lib/stage1/linked-review");
const { writeJsonAtomic } = await import("../src/lib/cairn/json-files");
const { getStage2Job } = await import("../src/lib/cairn/jobs");
const { POST } = await import("../src/app/api/stage1/jobs/route");
const source = await readFullSnapshot("test/fixtures/mortality-example.json");
let collections = 0, estimates = 0;
const fakeEngine = (p = 0.4): MortalityEngine => ({ id: "llm_record", model: "test-only", validation: "unvalidated", evaluationReference: null,
  async estimate() { estimates++; return { metadata: {}, submission: { status: "scored", deathProbability3m: p, explanation: "Test fixture", supportingEvidence: [{ recordId: "mortality-clinical-note", sourcePath: "record/eligible.json", pointer: "/data/text", quote: "Oncology documents progressive metastatic pancreatic cancer despite treatment.", interpretation: "Test evidence" }], contradictoryEvidence: [], limitations: ["Test only"], reason: null } }; } });
const dependencies: ScreeningDependencies = { engine: () => fakeEngine(), estimate: runMortalityEngine, handoff: store.linkScreening,
  async collect(patientId, directory) {
    collections++;
    const input = prepareMortalityInput({ ...source, patientId }, crypto.randomUUID());
    await writeEligibleRecord(directory, input);
    return JSON.parse(await readFile(path.join(directory, "record/manifest.json"), "utf8"));
  } };
after(() => rm(root, { recursive: true, force: true }));

test("API fails closed, validates body and does not expose config", async () => {
  delete process.env.CAIRN_TRIGGER_TOKEN;
  assert.equal((await POST(new Request("http://localhost/api/stage1/jobs", { method: "POST" }))).status, 503);
  process.env.CAIRN_TRIGGER_TOKEN = "test-token";
  assert.equal((await POST(new Request("http://localhost/api/stage1/jobs", { method: "POST" }))).status, 401);
  const request = (body: unknown) => new Request("http://localhost/api/stage1/jobs", { method: "POST", headers: { authorization: "Bearer test-token" }, body: JSON.stringify(body) });
  assert.equal((await POST(request({ patientId: "SIM-000001", prompt: "change contract" }))).status, 400);
  assert.equal((await POST(request({ patientId: "../bad" }))).status, 400);
  const response = await POST(request({ patientId: "SIM-000001" }));
  assert.equal(response.status, 202); const body = await response.json();
  assert.equal(body.configuration, undefined); assert.equal(body.keys, undefined);
});
test("active requests coalesce, durable keys cannot switch patient", async () => {
  const [a, b] = await Promise.all([queue.enqueueScreening("SIM-000001", "one"), queue.enqueueScreening("SIM-000001", "two")]);
  assert.equal(a.id, b.id); assert.equal((await queue.enqueueScreening("SIM-000001", "one")).id, a.id);
  await assert.rejects(queue.enqueueScreening("SIM-000002", "one"), /another patient/);
  const release = await queue.screeningLock("worker");
  await assert.rejects(queue.screeningLock("worker"), /busy/); await release();
});
test("handoff failure resumes saved input and result without another model call", async () => {
  const job = await queue.enqueueScreening("SIM-000001");
  const failed = await worker.runScreeningWorkerOnce(job.id, { ...dependencies, async handoff() { throw new Error("outage with private payload"); } });
  assert.equal(failed?.status, "failed"); assert.equal(failed?.phase, "handoff");
  assert.ok(!failed?.error?.includes("private payload"));
  const collectionCount = collections, estimateCount = estimates;
  assert.equal((await readCoverage(job.id)).kind, "live");
  await queue.retryScreening(job.id);
  const completed = await worker.runScreeningWorkerOnce(job.id, dependencies);
  assert.equal(completed?.status, "completed"); assert.ok(completed?.stage2JobId);
  assert.equal(collections, collectionCount); assert.equal(estimates, estimateCount);
  const result = await store.readScreeningResult(job.id);
  assert.equal(result.stage2JobId, completed!.stage2JobId);
  assert.equal((await getStage2Job(result.stage2JobId!))?.screeningId, job.id);
  await assert.rejects(queue.retryScreening(job.id), /Only failed/);
  assert.equal((await queue.enqueueScreening("SIM-000001", "one")).id, job.id);
});
test("collection failure can retry, and interruption preserves frozen input", async () => {
  const job = await queue.enqueueScreening("SIM-000001", "retry-collection");
  const failed = await worker.runScreeningWorkerOnce(job.id, { ...dependencies, async collect() { throw new Error("offline"); } });
  assert.equal(failed?.status, "failed"); await queue.retryScreening(job.id);
  const completed = await worker.runScreeningWorkerOnce(job.id, { ...dependencies, engine: () => fakeEngine(0.01) });
  assert.equal(completed?.status, "completed"); assert.equal(completed?.stage2JobId, undefined);
  const count = estimates;
  await queue.saveScreeningJob({ ...completed!, status: "running" });
  const recovered = await worker.runScreeningWorkerOnce(job.id, dependencies);
  assert.equal(recovered?.status, "completed"); assert.equal(estimates, count);
});
test("frozen snapshot tampering fails closed on resume", async () => {
  const job = await queue.enqueueScreening("SIM-000001", "tamper");
  await worker.runScreeningWorkerOnce(job.id, { ...dependencies, async handoff() { throw new Error("offline"); } });
  const p = path.join(store.screeningDirectory(job.id), "record/eligible.json");
  await writeJsonAtomic(p, []); await queue.retryScreening(job.id);
  const count = estimates;
  assert.equal((await worker.runScreeningWorkerOnce(job.id, dependencies))?.status, "failed");
  assert.equal(estimates, count);
});
test("authored and unverified screenings never enter a live patient's review reader", async () => {
  const input = prepareMortalityInput(source, crypto.randomUUID());
  await store.createScreening(input, {});
  const run = crypto.randomUUID();
  await writeJsonAtomic(path.join(root, "runs", run, "screening-link.json"), { screeningId: input.screeningId, snapshotHash: input.snapshotHash });
  assert.match(coverageLabel(await readCoverage(input.screeningId)), /Authored/);
  assert.equal(await patientRunAllowed(input.patientId, run), false);
  await saveCoverage(input, "cached"); assert.equal(await patientRunAllowed(input.patientId, run), false);
  await saveCoverage(input, "live"); assert.equal(await patientRunAllowed(input.patientId, run), true);
  assert.equal(await patientRunAllowed("SIM-000002", run), false);
  await writeJsonAtomic(path.join(root, "runs", run, "screening-link.json"), { screeningId: input.screeningId, snapshotHash: "bad" });
  assert.equal(await patientRunAllowed(input.patientId, run), false);
  await unlink(path.join(root, "runs", run, "screening-link.json"));
  assert.equal(await patientRunAllowed(input.patientId, run, input.screeningId), false);
  await assert.rejects(verifiedLinkedReview(input.screeningId));
});
test("display wording leaves evidence paths and identifiers unchanged", async () => {
  const { softenWording } = await import("../src/lib/stage2/read");
  const sourcePath = "record/prognosis.json", recordId = "prediction-note";
  const result = softenWording({ summary: "The prognosis is uncertain", evidence: [{ sourcePath, recordId, quote: "Original prognosis statement", detail: "The prognosis is uncertain" }] });
  assert.equal(result.value.evidence[0].sourcePath, sourcePath);
  assert.equal(result.value.evidence[0].recordId, recordId);
  assert.equal(result.value.evidence[0].quote, "Original prognosis statement");
  assert.equal(result.adjusted, true);
});
