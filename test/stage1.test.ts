import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm, mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import { loadExtractionConfig } from "../src/lib/stage1/config";
import { prepareInput, readInputSnapshot, readCollectedSnapshot, type SnapshotRecords } from "../src/lib/stage1/input";
import { extractFeatures, validateExtraction, type FeatureCompleter } from "../src/lib/stage1/extractor";
import type { FeatureExtraction } from "../src/lib/stage1/schema";

const { config, prompt } = await loadExtractionConfig("config/stage1/default.json");
const fixture = await readInputSnapshot("test/fixtures/stage1-example.json");
const input = prepareInput(fixture, config);
const metadata = { provider: "test", model: "fixture", inputTokens: 0, outputTokens: 0, stopReason: "toolUse" };
function unknown(): FeatureExtraction {
  return { features: config.features.map(f => ({ id: f.id, state: "not_documented", temporality: "unclear", explanation: "Not established in these passages", evidence: [] })) };
}
function oneRecord(resource: Record<string, unknown>): SnapshotRecords {
  return { ...fixture, records: [{ resource, sourcePath: "record/sites/gp/patient-resources.json" }] };
}
const record = { id: "r1", patientId: fixture.patientId, kind: "consultation", createdAt: "2026-09-11", version: 1, data: { text: "Needs assistance walking." } };

test("input excludes other patients, future records and outcome fields", () => {
  assert.equal(input.sources.length, 4);
  assert.equal(input.coverage.excluded.unscoped_or_other_patient, 1);
  assert.equal(input.coverage.excluded.future_resource, 1);
  const prepared = prepareInput(oneRecord({ ...record, data: { text: "Clinical passage", labels: { text: "secret answer" }, outcomes: { text: "future outcome" } } }), config);
  assert.deepEqual(prepared.sources.map(s => s.text), ["Clinical passage"]);
});

test("future edits, undated records and nested foreign/future entries are withheld", () => {
  assert.equal(prepareInput(oneRecord({ ...record, updatedAt: "2026-10-01" }), config).sources.length, 0);
  assert.equal(prepareInput(oneRecord({ ...record, createdAt: undefined }), config).sources.length, 0);
  const prepared = prepareInput(oneRecord({ ...record, data: { notes: [
    { patientId: "SIM-000002", text: "other patient" },
    { date: "2026-10-01", text: "future" },
    { date: "2026-09-10", text: "valid" },
  ] } }), config);
  assert.deepEqual(prepared.sources.map(s => s.text), ["valid"]);
});

test("shared records deduplicate and differing copies are withheld", () => {
  const snapshot = oneRecord(record);
  snapshot.records.push({ resource: structuredClone(record), sourcePath: "other.json" });
  assert.equal(prepareInput(snapshot, config).sources.length, 1);
  snapshot.records.push({ resource: { ...record, version: 2 }, sourcePath: "new.json" });
  const prepared = prepareInput(snapshot, config);
  assert.equal(prepared.sources.length, 0);
  assert.equal(prepared.coverage.excluded.conflicting_resource, 1);
});

test("lookback and input budget are explicit and never truncate quotations", () => {
  const prepared = prepareInput(fixture, { ...config, maxSources: 1 });
  assert.equal(prepared.sources.length, 1);
  assert.equal(prepared.coverage.excluded.input_limit, 3);
  assert.ok(input.sources.some(s => s.text === prepared.sources[0].text));
  assert.equal(prepareInput(oneRecord({ ...record, createdAt: "2020-01-01" }), config).sources.length, 0);
});

test("exact evidence, full feature coverage and no additional outputs are enforced", () => {
  const result = unknown();
  result.features[0] = { id: config.features[0].id, state: "present", temporality: "current", explanation: "Documented decline",
    evidence: [{ sourceId: input.sources[0].id, quote: input.sources[0].text, supports: "present", speaker: "patient" }] };
  assert.doesNotThrow(() => validateExtraction(result, input, config));
  const wrongQuote = structuredClone(result); wrongQuote.features[0].evidence[0].quote = "Invented wording";
  assert.throws(() => validateExtraction(wrongQuote, input, config), /exact quote/);
  const wrongSource = structuredClone(result); wrongSource.features[0].evidence[0].sourceId = "other-patient";
  assert.throws(() => validateExtraction(wrongSource, input, config), /exact quote/);
  assert.throws(() => validateExtraction({ features: result.features.slice(1) }, input, config), /Every configured/);
  assert.throws(() => validateExtraction({ ...result, outcome: 1 }, input, config), /schema/);
  assert.throws(() => validateExtraction({ features: [...result.features, result.features[0]] }, input, config), /duplicate/);
});

test("conflicting findings require opposing evidence; absence requires a negative citation", () => {
  const result = unknown();
  result.features[0] = { id: config.features[0].id, state: "conflicting", temporality: "current", explanation: "Unresolved accounts",
    evidence: [{ sourceId: input.sources[0].id, quote: input.sources[0].text, supports: "present", speaker: "family" }] };
  assert.throws(() => validateExtraction(result, input, config), /opposing/);
  result.features[0].state = "absent";
  assert.throws(() => validateExtraction(result, input, config), /matching/);
  result.features[0].evidence[0].supports = "absent";
  assert.doesNotThrow(() => validateExtraction(result, input, config));
});

test("missing sources skip the LLM and return null feature values", async () => {
  const empty = prepareInput({ ...fixture, records: [] }, config);
  const result = await extractFeatures(empty, config, prompt, async () => { throw new Error("Must not run"); });
  assert.equal(result.status, "unavailable");
  assert.ok(Object.values(result.featureValues).every(v => v === null));
  assert.equal(result.attempts.length, 0);
});

test("collection safety gate prevents extraction even with usable text", () => {
  assert.equal(prepareInput({ ...fixture, safetyGateReasons: ["Identity unavailable"] }, config).sources.length, 0);
});

test("bounded repair retries invalid submissions and preserves configuration/input hashes", async () => {
  let calls = 0;
  const complete: FeatureCompleter = async request => {
    calls++;
    assert.ok(request.systemPrompt.includes("untrusted data"));
    if (calls === 2) assert.ok(request.userPrompt.includes("Submission does not match"));
    return { submission: calls === 1 ? {} : unknown(), metadata };
  };
  const result = await extractFeatures(input, config, prompt, complete);
  assert.equal(result.status, "partial");
  assert.equal(result.attempts.length, 2);
  const changed = await extractFeatures(input, config, prompt + " More guidance.", async () => ({ submission: unknown(), metadata }));
  assert.notEqual(result.configHash, changed.configHash);
  assert.equal(result.inputHash, changed.inputHash);
});

test("timeouts abort requests and cannot create reassuring feature values", async () => {
  let signal: AbortSignal | undefined;
  const result = await extractFeatures(input, { ...config, timeoutMs: 10, maxAttempts: 1 }, prompt, async request => {
    signal = request.signal; return new Promise(() => {});
  });
  assert.equal(signal?.aborted, true);
  assert.equal(result.status, "failed");
  assert.ok(Object.values(result.featureValues).every(v => v === null));
});

test("historical and uncertain findings cannot become current binary positives", async () => {
  const submission = unknown();
  submission.features[0] = { id: config.features[0].id, state: "present", temporality: "historical", explanation: "Historical only",
    evidence: [{ sourceId: input.sources[0].id, quote: input.sources[0].text, supports: "present", speaker: "unspecified" }] };
  const result = await extractFeatures(input, config, prompt, async () => ({ submission, metadata }));
  assert.equal(result.featureValues[config.features[0].id], null);
});

test("stale positive and negative evidence cannot support a current feature", () => {
  const old = prepareInput(oneRecord({ ...record, createdAt: "2026-01-15" }), config);
  const submission = unknown();
  submission.features[0] = { id: config.features[0].id, state: "present", temporality: "current", explanation: "Older finding",
    evidence: [{ sourceId: old.sources[0].id, quote: old.sources[0].text, supports: "present", speaker: "patient" }] };
  assert.throws(() => validateExtraction(submission, old, config), /within 30 days/);
  submission.features[0].temporality = "historical";
  assert.doesNotThrow(() => validateExtraction(submission, old, config));
  submission.features[0].temporality = "current";
  submission.features[0].state = "absent";
  submission.features[0].evidence[0].supports = "absent";
  assert.throws(() => validateExtraction(submission, old, config), /within 30 days/);
});

test("configuration rejects unknown settings and duplicate feature definitions", async () => {
  await assert.rejects(loadExtractionConfig("config/stage1/default.json", { maxAttempts: 999 }), /configuration/);
  await assert.rejects(loadExtractionConfig("config/stage1/default.json", { features: [config.features[0], config.features[0]] }), /unique/);
});

test("collector adapter uses simulation time and enforces source containment", async () => {
  const temp = await mkdtemp("/tmp/cairn-stage1-");
  try {
    const root = path.join(temp, "record"); await mkdir(path.join(root, "clock"), { recursive: true });
    await writeFile(path.join(root, "clock/simulation.json"), JSON.stringify({ now: Date.parse(fixture.indexTime) }));
    const manifest = { patientId: fixture.patientId, sources: [{ name: "gp", status: "ok", relativePath: "gp.json" }], safetyGate: { forceInsufficientEvidence: false, reasons: [] } };
    await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest));
    await writeFile(path.join(root, "gp.json"), JSON.stringify([record]));
    const collected = await readCollectedSnapshot(temp);
    assert.equal(collected.indexTime, fixture.indexTime);
    assert.equal(prepareInput(collected, config).sources.length, 1);
    await rm(path.join(root, "gp.json"));
    await writeFile(path.join(temp, "outside.json"), "[]");
    await symlink(path.join(temp, "outside.json"), path.join(root, "gp.json"));
    await assert.rejects(readCollectedSnapshot(temp), /escapes/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
