import assert from "node:assert/strict";
import { test } from "node:test";
import type { CaseState, Participant } from "../src/lib/domain/types";
import { decideScreening, changePreparationStatus, type ReviewDecisionInput } from "../src/lib/stage1/clinical-review";
import { newRecord } from "../src/lib/record/record";
import { waitingOnFor } from "../src/lib/scoring/sweep";
const owner: Participant = { id: "gp", name: "Dr Test Clinician", role: "usual gp", organisation: "Test practice", reasonForInclusion: "Test", evidence: "test", source: "added by clinician", channel: "professional", required: true, status: "accepted" };
const fresh = (): CaseState => ({ patientId: "SIM-000001", state: "flagged", participants: [owner], removedParticipants: [], threads: [], record: newRecord("SIM-000001"), audit: [], updatedAt: "2026-09-12T00:00:00.000Z" });
const provenance = { patientId: "SIM-000001", screeningId: crypto.randomUUID(), snapshotHash: "a".repeat(64), stage2JobId: crypto.randomUUID() };
const input: ReviewDecisionInput = { decision: "accepted", reason: "Evidence checked; clarify documented wishes", ownerId: "gp", what: "Prepare a discussion brief", due: "2026-09-15", expectedRevision: 0 };
const act = (c: CaseState, i = input) => decideScreening(c, provenance, i, "Dr Test Clinician", "2026-09-12T08:00:00.000Z");
test("accept creates one auditable owner-confirmed preparation action without a meeting outcome", () => {
  const c = act(fresh()); assert.equal(c.preparationSteps?.length, 1); assert.equal(c.outcome, undefined); assert.equal(c.state, "flagged");
  assert.equal(c.screeningReviews?.[0].revision, 1); assert.ok(c.audit[0].detail.includes(provenance.snapshotHash));
  assert.equal(waitingOnFor(c)?.ownerName, owner.name);
  assert.throws(() => act(c), /changed/);
});
test("amend revises the same action and dismiss blocks it without discarding history", () => {
  const c = act(fresh());
  const amended = act(c, { ...input, expectedRevision: 1, decision: "amended", what: "First check existing care plan" });
  assert.equal(amended.preparationSteps?.length, 1); assert.equal(amended.preparationSteps?.[0].id, c.preparationSteps?.[0].id);
  const dismissed = act(amended, { ...input, expectedRevision: 2, decision: "dismissed", reason: "Existing discussion plan confirmed", ownerId: "", due: "", what: "" });
  assert.equal(dismissed.preparationSteps?.[0].status, "blocked"); assert.equal(dismissed.audit.length, 3);
});
test("patient mixing, invalid owner, missing reason, invalid date and stale revisions are refused", () => {
  assert.throws(() => act({ ...fresh(), patientId: "SIM-000002" }), /another patient/);
  assert.throws(() => act(fresh(), { ...input, ownerId: "missing" }), /named professional/);
  assert.throws(() => act({ ...fresh(), participants: [{ ...owner, channel: "family" }] }), /named professional/);
  assert.throws(() => act(fresh(), { ...input, reason: "" }), /reason/);
  assert.throws(() => act(fresh(), { ...input, due: "2026-02-30" }), /valid action/);
  assert.throws(() => act(fresh(), { ...input, expectedRevision: NaN }), /changed/);
});
test("completion is explicit, auditable and cannot be accidentally reopened", () => {
  const c = act(fresh()); const id = c.preparationSteps![0].id;
  assert.throws(() => changePreparationStatus(c, id, "blocked", "", "Clinician", "now"), /reason/);
  const done = changePreparationStatus(c, id, "done", "Brief prepared", "Clinician", "now");
  assert.equal(done.preparationSteps![0].status, "done"); assert.equal(done.outcome, undefined);
  assert.throws(() => act(done, { ...input, decision: "amended", expectedRevision: 1 }), /complete/);
  assert.throws(() => changePreparationStatus(done, id, "done", "", "Clinician", "now"), /open/);
});
