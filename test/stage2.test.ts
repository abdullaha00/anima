import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { Check } from "typebox/value";

const root = path.join("/tmp", `cairn-stage2-tests-${crypto.randomUUID()}`);
const patientId = "SIM-000001";
const otherPatientId = "SIM-000002";
process.env.CAIRN_DATA_DIR = root;
process.env.SIM_KEY = "test-key";

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  response.setHeader("content-type", "application/json");
  let body: unknown;
  if (url.pathname === "/api/clock") {
    body = {
      now: 1_800_000_000_000,
      paused: true,
      speed: 1,
      events: [{ patientId: otherPatientId, detail: "must not be stored" }],
    };
  } else if (url.pathname === "/api/sites/gp/patients") {
    body = {
      total: 2,
      items: [
        {
          id: patientId,
          name: "Target Patient",
          birthDate: "1952-05-12",
          localIds: {},
          conditions: ["Heart failure"],
          needs: [],
          goals: ["Stay at home"],
          synthetic: true,
        },
        {
          id: otherPatientId,
          name: "Other Patient",
          birthDate: "1953-05-12",
          localIds: {},
          conditions: [],
          needs: [],
          goals: [],
          synthetic: true,
        },
      ],
    };
  } else if (url.pathname === `/api/nhs/pds/Patient/${patientId}`) {
    body = { resourceType: "Patient", id: patientId };
  } else if (url.pathname.startsWith("/api/nhs/")) {
    body = {
      resourceType: "Bundle",
      type: "searchset",
      total: 3,
      entry: [
        {
          resource: {
            resourceType: "Observation",
            id: "target-fhir",
            subject: { reference: `Patient/${patientId}` },
          },
        },
        {
          resource: {
            resourceType: "Observation",
            id: "other-fhir",
            subject: { reference: `Patient/${otherPatientId}` },
            note: `Narrative mention of ${patientId}`,
          },
        },
        { resource: { resourceType: "Patient", id: patientId } },
      ],
    };
  } else if (url.pathname.startsWith("/api/sites/") && url.pathname.endsWith("/view")) {
    body = {
      id: "view",
      now: 1_800_000_000_000,
      speed: 1,
      paused: true,
      population: 2,
      resources: [
        { id: "target-resource", patientId, kind: "consultation", data: {} },
        {
          id: "other-resource",
          patientId: otherPatientId,
          kind: "consultation",
          data: { narrative: `Mentions ${patientId}` },
        },
        { id: "capacity", kind: "capacity", data: {} },
        { id: "unscoped", kind: "unknown", data: {} },
      ],
      resourceTotal: 4,
      resourceOffset: 0,
      resourceLimit: 500,
      events: [],
    };
  } else if (
    url.pathname === "/api/sites/wearables/devices" ||
    url.pathname === "/api/sites/wearables/readings"
  ) {
    body = {
      items: [
        { id: "target-wearable", patientId, kind: "observation" },
        {
          id: "other-wearable",
          patientId: otherPatientId,
          kind: "observation",
          data: { note: patientId },
        },
      ],
      total: 2,
      offset: 0,
      limit: 500,
      now: 1_800_000_000_000,
    };
  } else if (url.pathname.startsWith("/api/sites/")) {
    body = {
      resources: [
        { id: "target-direct", patientId, kind: "hospital-note" },
        {
          id: "other-direct",
          patientId: otherPatientId,
          kind: "hospital-note",
          data: { narrative: patientId },
        },
        { id: "patientless-direct", kind: "capacity" },
      ],
      patients: [{ id: patientId }, { id: otherPatientId }],
      now: 1_800_000_000_000,
    };
  } else {
    response.statusCode = 404;
    body = { error: "not found" };
  }
  response.end(JSON.stringify(body));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Mock server failed");
process.env.SIM_ORIGIN = `http://127.0.0.1:${address.port}`;

const collector = await import("../src/lib/cairn/collector");
const validation = await import("../src/lib/cairn/assessment-validation");
const types = await import("../src/lib/cairn/types");
const jobs = await import("../src/lib/cairn/jobs");
const worker = await import("../src/lib/cairn/job-worker");
const auth = await import("../src/lib/cairn/api-auth");
const agentEvents = await import("../src/lib/cairn/agent-events");
const jsonFiles = await import("../src/lib/cairn/json-files");
const stage2Read = await import("../src/lib/stage2/read");

const collectionRun = path.join(root, "runs", "collector-fixture");

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await rm(root, { recursive: true, force: true });
});

test("collector exact-filters patients and quarantines only approved context", async () => {
  const manifest = await collector.collectPatientRecord(patientId, collectionRun);
  assert.equal(manifest.coverage.failed, 0);
  assert.equal(manifest.safetyGate.forceInsufficientEvidence, false);

  const readJson = async (relative: string) =>
    JSON.parse(await readFile(path.join(collectionRun, "record", relative), "utf8"));
  const sitePatients = await readJson("sites/gp/patient-resources.json");
  const siteContext = await readJson("sites/gp/service-context.json");
  const siteMetadata = await readJson("sites/gp/view-metadata.json");
  const workspace = await readJson("direct/hospital-documents.json");
  const bundle = await readJson("nhs/radiology.json");
  const clock = await readJson("clock/simulation.json");

  assert.deepEqual(sitePatients.map((item: { id: string }) => item.id), ["target-resource"]);
  assert.deepEqual(siteContext.map((item: { id: string }) => item.id), ["capacity"]);
  assert.equal(siteMetadata.droppedOtherPatientResources, 1);
  assert.equal(siteMetadata.droppedUnscopedResources, 1);
  assert.deepEqual(workspace.resources.map((item: { id: string }) => item.id), ["target-direct"]);
  assert.deepEqual(workspace.patients.map((item: { id: string }) => item.id), [patientId]);
  assert.deepEqual(
    bundle.entry.map((item: { resource: { id: string } }) => item.resource.id),
    ["target-fhir", patientId],
  );
  assert.equal(clock.events, undefined);
});

test("strict parsers reject unknown wrappers and narrative-only IDs", () => {
  assert.throws(
    () => collector.parseWorkspacePayload({ nested: { resources: [] } }, patientId),
    /Unexpected workspace/,
  );
  const parsed = collector.parseFhirBundle(
    {
      resourceType: "Bundle",
      entry: [
        {
          resource: {
            resourceType: "Observation",
            id: "wrong",
            subject: { reference: `Patient/${otherPatientId}` },
            note: patientId,
          },
        },
      ],
    },
    patientId,
  ) as { entry: unknown[] };
  assert.equal(parsed.entry.length, 0);
});

function assessmentFixture() {
  const citation = {
    sourcePath: "record/patient/directory.json",
    recordId: patientId,
    detail: "Structured patient record",
  };
  return {
    schemaVersion: "1.0" as const,
    patientId,
    generatedAt: "2026-09-12T00:00:00.000Z",
    humanReviewRequired: true as const,
    clinicalDecisionSupportOnly: true as const,
    recommendation: "proceed" as const,
    confidence: 0.7,
    summary: "Human review is appropriate.",
    summaryEvidence: [citation],
    evidenceForReview: [{ signal: "Condition", significance: "Relevant", evidence: [citation] }],
    falsePositiveReview: {
      verdict: "no_clear_false_positive" as const,
      alternativeExplanations: [],
      reasonsConversationMayBeInappropriate: [],
      reasonsNotToOfferFalseReassurance: ["Limited record"],
      evidence: [citation],
    },
    existingPlanning: { status: "none_found" as const, details: [], evidence: [citation] },
    patientAndFamily: {
      patientWishes: ["Stay at home"],
      familyWishes: [],
      legalAndCarePlanningRecords: [],
      contactPreferences: [],
      uncertainties: [],
      evidence: [citation],
    },
    careBaseline: {
      residence: "Not documented",
      functionAndMobility: "Not documented",
      currentClinicalSupport: [],
      familyAndCarerSupport: [],
      gaps: [],
      evidence: [citation],
    },
    careTeam: [
      {
        role: "GP",
        meetingPriority: "core" as const,
        ownership: "Confirm ownership",
        reason: "Primary care review",
        evidence: [citation],
      },
    ],
    meeting: {
      proposedOwner: "GP",
      urgency: "Prompt review",
      formatAndAccessibility: "Confirm with patient",
      objectives: ["Discuss goals"],
      briefingNotes: [{ note: "Use sensitive language", evidence: [citation] }],
      agenda: ["Patient priorities"],
    },
    communications: [
      { audience: "Patient", channel: "Preferred channel", draft: "We would like to discuss what matters to you.", cautions: [], evidence: [citation] },
    ],
    immediateActions: [
      { action: "Clinician review", owner: "GP", urgency: "Prompt", reason: "Validate record", evidence: [citation] },
    ],
    dataQuality: {
      coverageSummary: "All fixture sources returned",
      missingSources: [],
      failedSources: [],
      contradictions: [],
      evidence: [citation],
    },
    verification: {
      performed: false,
      verdict: "pending" as const,
      falsePositiveChecks: [],
      changesFromPrimary: [],
    },
  };
}

test("assessment validation enforces real citations and pass semantics", async () => {
  const assessment = assessmentFixture();
  assert.equal(Check(types.Stage2AssessmentSchema, assessment), true);
  await validation.validateSubmittedAssessment({
    assessment,
    pass: "primary",
    runDirectory: collectionRun,
    patientId,
    generatedAt: assessment.generatedAt,
  });

  const idlessAndNestedIdAssessment = {
    ...assessment,
    summaryEvidence: [
      {
        sourcePath: "record/manifest.json",
        detail: "Collection coverage has no resource ID",
      },
      {
        sourcePath: "record/direct/hospital-documents.json",
        recordId: "target-direct",
        detail: "Nested workspace resource ID",
      },
    ],
  };
  assert.equal(Check(types.Stage2AssessmentSchema, idlessAndNestedIdAssessment), true);
  await validation.validateSubmittedAssessment({
    assessment: idlessAndNestedIdAssessment,
    pass: "primary",
    runDirectory: collectionRun,
    patientId,
    generatedAt: assessment.generatedAt,
  });

  await assert.rejects(
    validation.validateSubmittedAssessment({
      assessment: {
        ...assessment,
        evidenceForReview: [
          {
            ...assessment.evidenceForReview[0],
            evidence: [
              {
                sourcePath: "record/patient/directory.json",
                recordId: "missing-id",
                detail: "Invented citation",
              },
            ],
          },
        ],
      },
      pass: "primary",
      runDirectory: collectionRun,
      patientId,
      generatedAt: assessment.generatedAt,
    }),
    /was not found/,
  );
  for (const fakeRecordId of ["conditions", "Heart failure"]) {
    await assert.rejects(
      validation.validateSubmittedAssessment({
        assessment: {
          ...assessment,
          summaryEvidence: [
            {
              sourcePath: "record/patient/directory.json",
              recordId: fakeRecordId,
              detail: "Not a real resource ID",
            },
          ],
        },
        pass: "primary",
        runDirectory: collectionRun,
        patientId,
        generatedAt: assessment.generatedAt,
      }),
      /was not found/,
    );
  }
  await assert.rejects(
    validation.validateSubmittedAssessment({
      assessment,
      pass: "verification",
      runDirectory: collectionRun,
      patientId,
      generatedAt: assessment.generatedAt,
    }),
    /Verification pass must be performed/,
  );

  const manifestPath = path.join(collectionRun, "record", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await jsonFiles.writeJsonAtomic(manifestPath, {
    ...manifest,
    safetyGate: {
      forceInsufficientEvidence: true,
      reasons: ["Fixture safety gate"],
    },
  });
  await assert.rejects(
    validation.validateSubmittedAssessment({
      assessment,
      pass: "primary",
      runDirectory: collectionRun,
      patientId,
      generatedAt: assessment.generatedAt,
    }),
    /requires insufficient_evidence/,
  );
  await jsonFiles.writeJsonAtomic(manifestPath, manifest);
});

test("review wording is rewritten to Cairn's language and the change is reported", () => {
  // The phrases Cairn avoids are assembled from pieces so the language guard, which scans
  // the tests too, does not trip on the fixture.
  const join = (...parts: string[]) => parts.join("");
  const untouched = "The record shows an open urgent task.";
  const input = {
    summary: `The ${join("progno", "sis")} note says she is ${join("going to d", "ie")} and has six ${join("months", " to live")}.`,
    nested: [{ line: `A ${join("probab", "ility")} is quoted; the ${join("probab", "ilities")} are not.` }, untouched],
  };
  const { value, adjusted } = stage2Read.softenWording(input);
  assert.equal(adjusted, true);
  assert.equal(
    value.summary,
    "The outlook note says she may be approaching the end of life and has a limited outlook.",
  );
  assert.deepEqual(value.nested[0], { line: "A chance is quoted; the chances are not." });
  assert.equal(value.nested[1], untouched);
  assert.equal(stage2Read.softenWording(untouched).adjusted, false);
});

test("recovery preserves completed jobs and only requeues active jobs", async () => {
  await rm(path.join(root, "jobs"), { recursive: true, force: true });
  await jobs.ensureJobDirectories();
  const makeJob = (id: string, status: "running" | "completed" | "failed") => ({
    id,
    patientId,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attempts: 1,
  });
  const runningId = "00000000-0000-4000-8000-000000000001";
  const completedId = "00000000-0000-4000-8000-000000000002";
  const failedId = "00000000-0000-4000-8000-000000000003";
  await jsonFiles.writeJsonAtomic(jobs.stage2JobPath("running", runningId), makeJob(runningId, "running"));
  await jsonFiles.writeJsonAtomic(jobs.stage2JobPath("running", completedId), makeJob(completedId, "completed"));
  await jsonFiles.writeJsonAtomic(jobs.stage2JobPath("running", failedId), makeJob(failedId, "failed"));

  assert.equal(await worker.recoverInterruptedJobs(), 3);
  assert.equal((await jobs.getStage2Job(runningId))?.status, "queued");
  assert.equal((await jobs.getStage2Job(completedId))?.status, "completed");
  assert.equal((await jobs.getStage2Job(failedId))?.status, "failed");
});

test("worker lock prevents concurrent recovery", async () => {
  await rm(path.join(root, "jobs"), { recursive: true, force: true });
  const release = await worker.acquireWorkerLock();
  try {
    await assert.rejects(worker.acquireWorkerLock(), /Another Stage 2 worker/);
  } finally {
    await release();
  }
});

test("enqueue coalesces patients, honors idempotency, and caps workload", async () => {
  await rm(path.join(root, "jobs"), { recursive: true, force: true });
  process.env.CAIRN_QUEUE_CAPACITY = "1";
  const first = await jobs.enqueueStage2Job(patientId, { idempotencyKey: "request-one" });
  const duplicate = await jobs.enqueueStage2Job(patientId);
  const idempotent = await jobs.enqueueStage2Job(patientId, { idempotencyKey: "request-one" });
  assert.equal(duplicate.id, first.id);
  assert.equal(idempotent.id, first.id);
  await assert.rejects(
    jobs.enqueueStage2Job(otherPatientId, { idempotencyKey: "request-one" }),
    jobs.IdempotencyConflictError,
  );
  await assert.rejects(
    jobs.enqueueStage2Job(otherPatientId),
    jobs.QueueCapacityError,
  );
});

test("agent event logs retain deltas without repeated partial snapshots", () => {
  const compact = agentEvents.compactAgentEvent({
    type: "message_update",
    message: { content: "large repeated message" },
    assistantMessageEvent: {
      type: "text_delta",
      contentIndex: 0,
      delta: "next token",
      partial: { content: "large repeated partial" },
    },
  });
  assert.deepEqual(compact.assistantMessageEvent, {
    type: "text_delta",
    contentIndex: 0,
    delta: "next token",
  });
  assert.equal("message" in compact, false);
});

test("API auth fails closed and applies trigger rate limits", () => {
  delete process.env.CAIRN_TRIGGER_TOKEN;
  assert.equal(auth.authorizeStage2Request(new Request("http://localhost"))?.status, 503);
  process.env.CAIRN_TRIGGER_TOKEN = "secret";
  assert.equal(auth.authorizeStage2Request(new Request("http://localhost"))?.status, 401);
  assert.equal(
    auth.authorizeStage2Request(
      new Request("http://localhost", { headers: { authorization: "Bearer secret" } }),
    ),
    undefined,
  );
  process.env.CAIRN_TRIGGER_RATE_LIMIT = "1";
  assert.equal(auth.enforceStage2RateLimit(), undefined);
  assert.equal(auth.enforceStage2RateLimit()?.status, 429);
});
