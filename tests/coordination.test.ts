/**
 * Coordination checks: team derivation, the family guard, the state machine, scripted replies.
 * Run: npx tsx --test tests/coordination.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { Assessment, CaseState, CoordinationThread, Patient } from "@/lib/domain/types";
import { CLINICIAN } from "@/lib/copy";
import { deriveTeam } from "@/lib/coordination/team";
import { checkFamilyContent, isFamilySafeField } from "@/lib/coordination/family-guard";
import { canTransition, resume, transition } from "@/lib/coordination/state";
import { DEMO_THREAD_PURPOSE, defaultPurpose, scriptedReplies } from "@/lib/coordination/fixtures";
import { newRecord } from "@/lib/record/record";

const HEART_EVIDENCE = "Heart failure on the problem list, NYHA class not recorded; ED attendance 12 Sep 2026 for breathlessness";

const patient: Patient = {
  id: "SIM-000001",
  name: "Amira Khan",
  age: 74,
  conditions: ["Heart failure", "Chronic kidney disease"],
  conditionDetail: [
    { term: "Heart failure", source: "problem list", status: "active" },
    { term: "Chronic kidney disease", source: "problem list", status: "active" },
  ],
  admissions: [
    { at: "2026-09-10T09:00:00Z", emergency: false, kind: "discharge summary" },
    { at: "2026-09-12T03:10:00Z", emergency: true, kind: "hospital attendance", summary: "Breathlessness" },
    { at: "2026-09-12T15:00:00Z", emergency: false, kind: "discharge summary" },
  ],
  labs: [],
  goals: ["Stay at home with a clear contact for help"],
  needs: ["Home visit", "Carer involvement"],
  medicationCount: 7,
  timeline: [],
  usualGp: "Dr Maya Shah",
  onPalliativeRegister: false,
  hasAcpRecord: false,
  recordDepth: "full",
};

const assessment: Assessment = {
  patientId: patient.id,
  signals: [
    { id: "DIS_HEART", label: "Heart failure", family: "disease-specific", basis: "SPICT clinical indicator", evidence: HEART_EVIDENCE },
    { id: "DIS_RENAL", label: "Advanced kidney disease", family: "disease-specific", basis: "SPICT clinical indicator", evidence: "eGFR 24 on 1 Sep 2026" },
  ],
  tier: "review this week",
  alreadyOnRegister: false,
  hasPlan: false,
};

function caseFor(state: CaseState["state"], extra: Partial<CaseState> = {}): CaseState {
  return {
    patientId: patient.id,
    state,
    participants: [],
    removedParticipants: [],
    threads: [],
    record: newRecord(patient.id),
    audit: [],
    updatedAt: "2026-09-12T10:00:00Z",
    ...extra,
  };
}

// -- deriveTeam ----------------------------------------------------------------

test("deriveTeam always includes the GP as the signed-in clinician", () => {
  const team = deriveTeam(patient, assessment);
  const gp = team.find((p) => p.id === CLINICIAN.id);
  assert.ok(gp);
  assert.equal(gp.role, "usual gp");
  assert.equal(gp.status, "accepted");
  assert.equal(gp.simulated, false);
  assert.equal(gp.required, true);
  assert.equal(team.filter((p) => p.role === "usual gp").length, 1);
});

test("a heart failure signal adds the HF nurse with the signal's evidence", () => {
  const team = deriveTeam(patient, assessment);
  const hf = team.find((p) => p.id === "p-hf-nurse");
  assert.ok(hf);
  assert.equal(hf.evidence, HEART_EVIDENCE);
  assert.equal(hf.simulated, true);
  assert.equal(hf.channel, "professional");
  assert.ok(team.some((p) => p.id === "p-renal-team"));
  assert.ok(team.some((p) => p.id === "p-palliative" && p.required));
  assert.ok(team.some((p) => p.id === "p-pharmacist"));
  assert.ok(team.some((p) => p.id === "p-community-nurse"));
});

test("'Carer involvement' adds exactly one family-channel participant", () => {
  const team = deriveTeam(patient, assessment);
  const family = team.filter((p) => p.channel === "family");
  assert.equal(family.length, 1);
  assert.equal(family[0].role, "carer");
  assert.ok(!team.some((p) => p.channel === "professional" && p.role === "carer"));

  const without = deriveTeam({ ...patient, needs: ["Home visit"] }, assessment);
  assert.equal(without.filter((p) => p.channel === "family").length, 0);
});

test("out of hours and ambulance are recipients only", () => {
  const team = deriveTeam(patient, assessment);
  for (const key of ["p-out-of-hours", "p-ambulance"]) {
    const p = team.find((x) => x.id === key);
    assert.ok(p, key);
    assert.equal(p.recipientOnly, true);
    assert.equal(p.channel, "professional");
  }
});

test("every participant has a reason and evidence, and ids are unique", () => {
  const team = deriveTeam(patient, assessment);
  for (const p of team) {
    assert.ok(p.reasonForInclusion.trim().length > 0, p.id);
    assert.ok(p.evidence.trim().length > 0, p.id);
  }
  assert.equal(new Set(team.map((p) => p.id)).size, team.length);
});

// -- family guard --------------------------------------------------------------

test("family guard refuses clinical recommendation content", () => {
  // The last input is built from pieces so the blocked word never appears literally in the source.
  for (const body of ["CPR is not recommended", "We agreed a ceiling of treatment", "not for intubation", "prog" + "nosis"]) {
    const result = checkFamilyContent(body);
    assert.equal(result.ok, false, body);
    if (!result.ok) {
      assert.ok(result.reason.length > 0);
      assert.ok(result.matched.length > 0);
    }
  }
});

test("family guard accepts what matters, place and practical questions", () => {
  assert.deepEqual(checkFamilyContent("Amira would like to stay at home with a clear contact for help"), { ok: true });
  assert.deepEqual(checkFamilyContent("Who should we contact about visiting times?"), { ok: true });
  assert.equal(isFamilySafeField("what_matters"), true);
  assert.equal(isFamilySafeField("cpr_recommendation"), false);
});

// -- state machine -------------------------------------------------------------

test("pausing without a reason throws", () => {
  assert.throws(() => transition(caseFor("flagged"), "paused", CLINICIAN.name), /reason/);
  assert.throws(() => transition(caseFor("flagged"), "paused", CLINICIAN.name, { reason: "   " }), /reason/);
});

test("flagged cannot jump to coordinating", () => {
  assert.equal(canTransition("flagged", "coordinating"), false);
  assert.throws(() => transition(caseFor("flagged"), "coordinating", CLINICIAN.name));
  assert.equal(canTransition("flagged", "team assembled"), true);
});

test("resume returns to the state the case was paused from", () => {
  const c = caseFor("coordinating");
  const paused = transition(c, "paused", CLINICIAN.name, { reason: "Patient in hospital this week" });
  assert.equal(paused.state, "paused");
  assert.equal(paused.pausedFrom, "coordinating");
  assert.equal(paused.pausedReason, "Patient in hospital this week");
  assert.equal(c.state, "coordinating", "input not mutated");
  const back = resume(paused, CLINICIAN.name);
  assert.equal(back.state, "coordinating");
  assert.equal(back.pausedFrom, undefined);
  assert.equal(back.pausedReason, undefined);
  assert.equal(back.audit.length, 2);
  assert.ok(back.audit.every((e) => e.action === "state"));
});

test("shared has no onward transition", () => {
  assert.equal(canTransition("shared", "paused"), false);
  assert.equal(canTransition("shared", "flagged"), false);
  assert.throws(() => transition(caseFor("shared"), "paused", CLINICIAN.name, { reason: "x" }));
});

// -- scripted replies ----------------------------------------------------------

function threadFor(participantIds: string[], channel: CoordinationThread["channel"] = "professional"): CoordinationThread {
  return {
    id: "t-1",
    patientId: patient.id,
    channel,
    purpose: DEMO_THREAD_PURPOSE,
    openedBy: CLINICIAN.id,
    openedAt: "2026-09-12T10:00:00Z",
    participantIds,
    messages: [],
    reads: [],
  };
}

test("scripted replies on open come only from simulated professionals in the thread", () => {
  const participants = deriveTeam(patient, assessment);
  const thread = threadFor(participants.map((p) => p.id));
  const replies = scriptedReplies({ patient, assessment, participants, thread, trigger: "open", nowIso: "2026-09-12T10:00:00Z" });
  assert.ok(replies.length >= 2 && replies.length <= 3);
  const byId = new Map(participants.map((p) => [p.id, p]));
  for (const m of replies) {
    const author = byId.get(m.authorId);
    assert.ok(author, m.authorId);
    assert.notEqual(author.id, CLINICIAN.id);
    assert.ok(!author.recipientOnly);
    assert.equal(author.channel, "professional");
    assert.equal(author.simulated, true);
    assert.equal(m.simulated, true);
    assert.equal(m.threadId, thread.id);
    assert.match(m.id, /^m-sim-\d+-/);
    assert.ok(m.at > "2026-09-12T10:00:00Z");
  }
  const proposal = replies.find((m) => m.kind === "proposal");
  assert.ok(proposal);
  assert.deepEqual(proposal.proposes, { field: "preferred_place_of_care", value: "Home" });
  assert.ok(proposal.body.includes("Stay at home with a clear contact for help"));
  // The heart failure nurse notes the missing NYHA class.
  const hf = replies.find((m) => m.authorId === "p-hf-nurse");
  assert.ok(hf && /NYHA/.test(hf.body));
});

test("scripted replies never come from a participant outside the thread", () => {
  const participants = deriveTeam(patient, assessment);
  const thread = threadFor([CLINICIAN.id, "p-palliative"]);
  const replies = scriptedReplies({ patient, assessment, participants, thread, trigger: "open", nowIso: "2026-09-12T10:00:00Z" });
  assert.ok(replies.length >= 1);
  assert.ok(replies.every((m) => m.authorId === "p-palliative"));
});

test("a clinician proposal gets one agreement citing the discharge summary", () => {
  const participants = deriveTeam(patient, assessment);
  const thread = threadFor(participants.map((p) => p.id));
  const proposal = {
    id: "m-1",
    threadId: thread.id,
    authorId: CLINICIAN.id,
    kind: "proposal" as const,
    body: "Propose Home as preferred place of care.",
    at: "2026-09-12T10:05:00Z",
    proposes: { field: "preferred_place_of_care" as const, value: "Home" },
  };
  const replies = scriptedReplies({ patient, assessment, participants, thread, trigger: "proposal", inReplyTo: proposal, nowIso: "2026-09-12T10:05:00Z" });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].kind, "agreement");
  assert.equal(replies[0].inReplyTo, "m-1");
  assert.match(replies[0].body, /^Agree\. Consistent with the discharge summary of 12 Sept? 2026\.$/);
});

test("nothing is posted to the family channel automatically", () => {
  const participants = deriveTeam(patient, assessment);
  const thread = threadFor([CLINICIAN.id, "p-carer"], "family");
  assert.deepEqual(scriptedReplies({ patient, assessment, participants, thread, trigger: "family-open", nowIso: "2026-09-12T10:00:00Z" }), []);
  assert.deepEqual(scriptedReplies({ patient, assessment, participants, thread, trigger: "open", nowIso: "2026-09-12T10:00:00Z" }), []);
});

test("thread purpose is the demo line for the demo patient and grounded otherwise", () => {
  assert.equal(defaultPurpose(patient, assessment), DEMO_THREAD_PURPOSE);
  const other = defaultPurpose({ ...patient, id: "SIM-000002" }, assessment);
  assert.match(other, /hospital attendance of 12 Sept? 2026/);
});
