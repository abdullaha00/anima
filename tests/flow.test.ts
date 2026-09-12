/**
 * The three-act demo path, end to end, through the same server actions the screens call.
 * Runs against the committed snapshot with its own state directory, so nothing it does
 * touches the demo state or the network.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.CAIRN_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cairn-flow-"));
process.env.SIM_MODE = "snapshot";

const PATIENT = "SIM-000001";

type Actions = typeof import("@/app/actions");
type Store = typeof import("@/lib/store");
type Record = typeof import("@/lib/record/record");
type Source = typeof import("@/lib/data/source");
type Rules = typeof import("@/lib/scoring/rules");
type Sweep = typeof import("@/lib/scoring/sweep");

let actions: Actions;
let store: Store;
let record: Record;
let source: Source;
let rules: Rules;
let sweepMod: Sweep;

before(async () => {
  actions = await import("@/app/actions");
  store = await import("@/lib/store");
  record = await import("@/lib/record/record");
  source = await import("@/lib/data/source");
  rules = await import("@/lib/scoring/rules");
  sweepMod = await import("@/lib/scoring/sweep");
});

function ok(result: { ok: boolean; error?: string }, label: string) {
  assert.equal(result.ok, true, `${label}: ${"error" in result ? result.error : ""}`);
}

test("act one: the patient is flagged with evidence and the team is proposed with reasons", async () => {
  const patient = await source.getPatient(PATIENT);
  assert.ok(patient, "demo patient is in the snapshot");
  const { meta } = await source.getPatients();
  const assessment = rules.rulesEngine.assess(patient, { nowIso: meta.simulationNow });
  assert.ok(assessment.signals.length >= 1, "at least one indicator present");
  for (const s of assessment.signals) {
    assert.ok(s.evidence.length > 0, `${s.id} carries evidence`);
    assert.ok(s.basis.length > 0, `${s.id} carries a basis`);
  }

  ok(await actions.assembleTeam(PATIENT), "assembleTeam");
  const c = await store.getCase(PATIENT);
  assert.equal(c.state, "team assembled");
  assert.ok(c.participants.some((p) => p.id === "p-gp"), "usual GP is on the team");
  for (const p of c.participants) {
    assert.ok(p.reasonForInclusion.length > 0, `${p.name} has a reason`);
    assert.ok(p.evidence.length > 0, `${p.name} has evidence`);
  }
  const recipients = c.participants.filter((p) => p.recipientOnly);
  assert.equal(recipients.length, 2, "out of hours and ambulance are recipients");
  assert.ok(recipients.every((p) => p.channel === "professional"));
  const family = c.participants.filter((p) => p.channel === "family");
  assert.equal(family.length, 1, "carer involvement puts one person on the family channel");
});

test("act two: a purposeful thread, simulated replies marked, a proposal and an agreement", async () => {
  const bad = await actions.openThread(PATIENT, "professional", "   ");
  assert.equal(bad.ok, false, "a thread needs a purpose");

  ok(await actions.openThread(PATIENT, "professional", "Agree a preferred place of care after the recent attendance."), "openThread");
  let c = await store.getCase(PATIENT);
  assert.equal(c.state, "coordinating");
  const thread = c.threads.find((t) => t.channel === "professional");
  assert.ok(thread);
  const simulated = thread.messages.filter((m) => m.simulated);
  assert.ok(simulated.length >= 1, "seeded replies exist");
  for (const m of simulated) {
    assert.notEqual(m.authorId, "p-gp", "the clinician never has simulated words put in their mouth");
    const author = c.participants.find((p) => p.id === m.authorId);
    assert.ok(author && !author.recipientOnly && author.channel === "professional", `author ${m.authorId} is a thread participant`);
  }
  assert.ok(thread.reads.length >= simulated.length, "simulated authors have read receipts");
  assert.ok(thread.participantIds.every((id) => !c.participants.find((p) => p.id === id)?.recipientOnly), "recipients never join the thread");

  ok(
    await actions.postMessage(PATIENT, thread.id, {
      kind: "proposal",
      body: "Propose home as the preferred place of care, in line with what Amira has said matters to her.",
      proposesField: "preferred_place_of_care",
      proposesValue: "Home",
    }),
    "postMessage proposal",
  );
  c = await store.getCase(PATIENT);
  const t2 = c.threads.find((t) => t.channel === "professional")!;
  const proposal = t2.messages.find((m) => m.kind === "proposal" && m.authorId === "p-gp");
  assert.ok(proposal, "the proposal is in the thread");
  const agreement = t2.messages.find((m) => m.kind === "agreement" && m.inReplyTo === proposal.id);
  assert.ok(agreement && agreement.simulated, "a simulated agreement attaches to the proposal");
});

test("the family channel refuses clinical recommendation content in code", async () => {
  ok(await actions.openThread(PATIENT, "family", "Keep Amira's daughter informed about practical arrangements."), "open family thread");
  const c = await store.getCase(PATIENT);
  const fam = c.threads.find((t) => t.channel === "family")!;
  assert.equal(fam.messages.filter((m) => m.kind !== "system").length, 0, "nothing posts to the family channel automatically");

  const refused = await actions.postMessage(PATIENT, fam.id, { kind: "message", body: "We agreed CPR is not recommended." });
  assert.equal(refused.ok, false);
  const refusedProposal = await actions.postMessage(PATIENT, fam.id, {
    kind: "proposal",
    body: "Home",
    proposesField: "preferred_place_of_care",
    proposesValue: "Home",
  });
  assert.equal(refusedProposal.ok, false, "no proposals on the family channel");
  ok(await actions.postMessage(PATIENT, fam.id, { kind: "message", body: "Amira would like to stay at home with a clear contact for help." }), "safe family entry");
  const c2 = await store.getCase(PATIENT);
  const posted = c2.threads.find((t) => t.channel === "family")!.messages.at(-1)!;
  assert.ok(posted.approvedBy, "a clinician wrote or approved it");
});

test("act three: outcome with owned next steps, promotion that never signs, the refusal, the signature, the views", async () => {
  let c = await store.getCase(PATIENT);
  const thread = c.threads.find((t) => t.channel === "professional")!;
  const proposal = thread.messages.find((m) => m.kind === "proposal" && m.authorId === "p-gp")!;
  const owner = c.participants.find((p) => p.channel === "professional" && !p.recipientOnly && p.id !== "p-gp")!;

  const noOwner = await actions.recordOutcome(PATIENT, {
    heldAt: "2026-09-12",
    summary: "Discussed.",
    attendees: ["p-gp"],
    apologies: [],
    decisions: [],
    nextSteps: [{ what: "Arrange a home visit", ownerId: "", due: "2026-09-19" }],
  });
  assert.equal(noOwner.ok, false, "a next step without a named owner is refused");

  ok(
    await actions.recordOutcome(PATIENT, {
      heldAt: "2026-09-12",
      summary: "Agreed that home is the preferred place of care. Community nursing to be arranged.",
      attendees: ["p-gp", owner.id],
      apologies: [],
      decisions: [
        {
          text: "Home is the preferred place of care.",
          fromMessageId: proposal.id,
          intoRecordField: "preferred_place_of_care",
          proposedValue: "Home",
        },
      ],
      nextSteps: [{ what: "Arrange a home visit and anticipatory medicines review", ownerId: owner.id, due: "2026-09-19", createdFrom: proposal.id }],
    }),
    "recordOutcome",
  );
  c = await store.getCase(PATIENT);
  assert.equal(c.state, "meeting held");

  ok(await actions.promoteDecision(PATIENT, 0), "promoteDecision");
  c = await store.getCase(PATIENT);
  const entry = c.record.fields.preferred_place_of_care;
  assert.ok(entry);
  assert.equal(entry.value, "Home");
  assert.equal(entry.recordedBy, "Dr Maya Shah", "recorded-by is the accepting clinician");
  assert.ok(entry.source.includes(proposal.id), "the source is the thread message");
  assert.equal(c.record.status, "draft", "promotion never signs");
  const promoted = c.threads.find((t) => t.channel === "professional")!.messages.find((m) => m.id === proposal.id)!;
  assert.equal(promoted.promotedToRecord, true);

  const cairn = await actions.attemptCairnSignature(PATIENT);
  assert.equal(cairn.ok, false);
  assert.match(cairn.error ?? "", /named clinician/i);
  c = await store.getCase(PATIENT);
  assert.ok(c.record.audit.some((a) => a.action === "refuse-sign"), "the refusal is in the audit");

  const early = await actions.signRecord(PATIENT, "Dr Maya Shah");
  assert.equal(early.ok, false, "an incomplete record cannot be signed");

  const values: [string, string][] = [
    ["capacity_assessment", "Had capacity for this decision"],
    ["what_matters", "To stay at home with a clear contact for help, and to avoid unnecessary travel."],
    ["preferences_for_care", "Priority on comfort. Avoid admission where symptoms can be managed at home."],
    ["clinical_summary", "Heart failure and chronic kidney disease. Two hospital episodes this month for breathlessness."],
    ["clinical_trajectory", "Getting tired on the walk to the shops; an urgent breathlessness attendance this week."],
    ["active_medications", "Furosemide tablets (approved)"],
    ["cpr_recommendation", "Do not attempt CPR"],
    ["cpr_rationale", "Discussed with Amira and her daughter; understood and agreed."],
    ["escalation_rationale", "Symptoms can be managed at home with community nursing."],
    ["recommended_interventions", "Community nursing, home monitoring, out-of-hours aware."],
  ];
  for (const [field, value] of values) {
    ok(await actions.setRecordField(PATIENT, field as never, value, "conversation 12 Sep 2026 with Dr Maya Shah"), `set ${field}`);
  }
  c = await store.getCase(PATIENT);
  assert.deepEqual(record.readiness(c.record).missing, ["escalation_ceiling"], "the escalation ceiling is required");
  const noCeiling = await actions.signRecord(PATIENT, "Dr Maya Shah");
  assert.equal(noCeiling.ok, false, "no signature without an escalation ceiling");

  ok(await actions.setRecordField(PATIENT, "escalation_ceiling" as never, "Community-only", "conversation 12 Sep 2026 with Dr Maya Shah"), "set escalation_ceiling");
  c = await store.getCase(PATIENT);
  assert.equal(record.readiness(c.record).ready, true);

  ok(
    await actions.signRecord(PATIENT, "Dr Maya Shah", { gmc: "7654321", signature: "Maya Shah", nextReviewAt: "2027-03-12" }),
    "signRecord",
  );
  c = await store.getCase(PATIENT);
  assert.equal(c.record.status, "signed");
  assert.equal(c.record.signedGmc, "7654321", "the registration number round-trips through the store");
  assert.equal(c.record.signature, "Maya Shah");
  assert.equal(c.record.nextReviewAt, "2027-03-12", "the review date round-trips through the store");
  assert.equal(c.state, "record signed");

  const mutate = await actions.setRecordField(PATIENT, "what_matters" as never, "changed", "x");
  assert.equal(mutate.ok, false, "a signed record is immutable");

  ok(await actions.shareRecord(PATIENT, ["gp", "out_of_hours", "ambulance", "hospice", "family"]), "shareRecord");
  c = await store.getCase(PATIENT);
  assert.equal(c.state, "shared");
  const amb = record.viewFor(c.record, "ambulance");
  assert.ok(!("error" in amb));
  assert.equal(amb.fields[0]?.name, "cpr_recommendation");
  assert.ok(amb.fields.some((f) => f.name === "escalation_ceiling"));
  assert.ok(amb.fields.some((f) => f.name === "cpr_rationale"));
  assert.ok(!amb.fields.some((f) => f.name === "what_matters"));
  assert.ok(!amb.fields.some((f) => f.name === "clinical_summary"));
  assert.match(amb.note ?? "", /not legally binding/i);
  const fam = record.viewFor(c.record, "family");
  assert.ok(!("error" in fam));
  assert.ok(fam.fields.some((f) => f.name === "what_matters"));
  assert.ok(!fam.fields.some((f) => f.name === "cpr_recommendation"));
});

test("the open next step flows back to the worklist with its owner", async () => {
  const { patients, meta } = await source.getPatients();
  const assessments = patients.map((p) => rules.rulesEngine.assess(p, { nowIso: meta.simulationNow }));
  const cases = await store.casesById();
  const result = sweepMod.sweep(patients, assessments, cases, meta.simulationNow);
  const row = result.rows.find((r) => r.patientId === PATIENT);
  assert.ok(row);
  assert.equal(row.state, "shared");
  assert.ok(row.waitingOn, "the open next step is on the worklist");
  assert.ok(row.waitingOn.ownerName.length > 0);
  assert.equal(result.funnel.waitingOnSomeone, 1);
});
