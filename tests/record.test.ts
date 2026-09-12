/**
 * Governance checks for the record, ported from reference/cairn/evals.py section 3.
 * Run: npx tsx --test tests/record.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { CairnRecord, RecordFieldName } from "@/lib/domain/types";
import {
  SignatureRefused,
  newRecord,
  readiness,
  refuseSignature,
  requestSignature,
  setField,
  share,
  sign,
  viewFor,
} from "@/lib/record/record";
import { CLINICAL_FIELDS } from "@/lib/record/fields";

const COMPLETE: [RecordFieldName, string][] = [
  ["what_matters", "To stay at home with my dog"],
  ["clinical_summary", "Advanced COPD, MRC 4, two admissions this year"],
  ["preferences_for_care", "Priority on comfort, avoid admission where possible"],
  ["recommended_interventions", "Community nursing, rescue medication at home"],
  ["cpr_recommendation", "CPR not recommended, discussed and agreed"],
  ["capacity_assessment", "Has capacity for this decision"],
  ["people_involved", "Daughter present, community matron informed"],
];

function completeDraft(patientId = "TEST001"): CairnRecord {
  let r = newRecord(patientId);
  for (const [field, value] of COMPLETE) {
    r = setField(r, field, value, "conversation 2026-09-12", "Dr A Patel");
  }
  return r;
}

function fieldsOf(view: ReturnType<typeof viewFor>): RecordFieldName[] {
  assert.ok(!("error" in view), "expected a view, got an error");
  return view.fields.map((f) => f.name);
}

test("incomplete draft cannot be signed", () => {
  const r = newRecord("TEST001");
  assert.equal(readiness(r).ready, false);
  assert.equal(requestSignature(r).status, "draft");
  assert.throws(() => sign(r, "Dr A Patel"), SignatureRefused);
});

test("complete draft is ready for signature", () => {
  const r = completeDraft();
  const ready = readiness(r);
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.missing, []);
  assert.deepEqual(ready.unsourced, []);
  assert.equal(requestSignature(r).status, "awaiting_signature");
});

test("unsigned record cannot be shared", () => {
  const r = requestSignature(completeDraft());
  assert.throws(() => share(r, ["ambulance"]), /signed record/);
});

test("Cairn cannot sign a record", () => {
  const r = requestSignature(completeDraft());
  assert.throws(() => sign(r, "Cairn"), (e: unknown) => e instanceof SignatureRefused && /named clinician/.test(e.message));
  assert.throws(() => sign(r, "cairn-bot"), SignatureRefused);
  assert.throws(() => sign(r, "   "), SignatureRefused);
  // The refusal is recorded so the UI can show it.
  const refused = refuseSignature(r, "Cairn");
  assert.equal(refused.audit.at(-1)?.action, "refuse-sign");
  assert.equal(refused.status, "awaiting_signature");
  assert.equal(r.audit.length + 1, refused.audit.length, "input not mutated");
});

test("named clinician can sign", () => {
  const r = sign(requestSignature(completeDraft()), "Dr A Patel");
  assert.equal(r.status, "signed");
  assert.equal(r.signedBy, "Dr A Patel");
  assert.ok(r.signedAt);
  assert.equal(r.audit.at(-1)?.action, "sign");
});

test("signed record is immutable", () => {
  const r = sign(requestSignature(completeDraft()), "Dr A Patel");
  assert.throws(() => setField(r, "cpr_recommendation", "changed", "x", "y"), /immutable/);
  assert.throws(() => setField(share(r, ["gp"]), "cpr_recommendation", "changed", "x", "y"), /immutable/);
});

test("ambulance view carries the CPR recommendation, omits the narrative, states not binding", () => {
  const signed = sign(requestSignature(completeDraft()), "Dr A Patel");
  const r = share(signed, ["ambulance", "out_of_hours", "hospice"]);
  assert.equal(r.status, "shared");
  assert.deepEqual(r.sharedWith, ["out_of_hours", "ambulance", "hospice"]);

  const amb = viewFor(r, "ambulance");
  assert.ok(!("error" in amb));
  const names = fieldsOf(amb);
  assert.equal(names[0], "cpr_recommendation");
  assert.ok(!names.includes("what_matters"));
  assert.ok(!names.includes("concerns_and_fears"));
  assert.ok(amb.note && amb.note.includes("not legally binding"));
  // not_recommended and place of care are not set: listed as missing, never a blank row.
  assert.deepEqual(amb.missing, ["not_recommended", "preferred_place_of_care"]);
  assert.ok(amb.fields.every((f) => f.value.length > 0));
});

test("unsigned record discloses nothing", () => {
  const unsigned = newRecord("TEST002");
  const v = viewFor(unsigned, "gp");
  assert.ok("error" in v);
  assert.equal(v.error, "Record is not signed. Nothing is shared.");
  assert.ok("error" in viewFor(completeDraft(), "hospice"));
});

test("unsourced clinical field blocks signature", () => {
  let r2 = newRecord("TEST003");
  for (const [field] of COMPLETE) {
    r2 = setField(r2, field, "x", "conversation", "Dr B");
  }
  // Simulate a field arriving with no provenance.
  const entry = r2.fields.clinical_summary;
  assert.ok(entry);
  const broken: CairnRecord = { ...r2, fields: { ...r2.fields, clinical_summary: { ...entry, source: "" } } };
  const ready = readiness(broken);
  assert.equal(ready.ready, false);
  assert.deepEqual(ready.unsourced, ["clinical_summary"]);
  assert.equal(requestSignature(broken).status, "draft");
  assert.throws(() => sign(broken, "Dr B"), (e: unknown) => e instanceof SignatureRefused && /Clinical summary/.test(e.message));
});

test("family view has no clinical recommendations", () => {
  let r = completeDraft();
  r = setField(r, "not_recommended", "Not for ITU", "conversation 2026-09-12", "Dr A Patel");
  r = share(sign(requestSignature(r), "Dr A Patel"), ["family"]);
  const fam = viewFor(r, "family");
  const names = fieldsOf(fam);
  assert.ok(!names.includes("cpr_recommendation"));
  assert.ok(!names.includes("not_recommended"));
  assert.ok(!names.includes("clinical_summary"));
  assert.ok(names.includes("what_matters"));
  assert.ok(!("error" in fam) && fam.note?.includes("consent"));
});

test("share refuses an unknown audience", () => {
  const r = sign(requestSignature(completeDraft()), "Dr A Patel");
  assert.throws(() => share(r, ["everyone" as never]), /unknown audience/);
});

test("round trip through JSON preserves fields", () => {
  const r = share(sign(requestSignature(completeDraft()), "Dr A Patel"), ["ambulance", "hospice"]);
  const again = JSON.parse(JSON.stringify(r)) as CairnRecord;
  for (const f of CLINICAL_FIELDS) {
    assert.equal(again.fields[f] === undefined, r.fields[f] === undefined, f);
  }
  assert.equal(again.fields.cpr_recommendation?.value, r.fields.cpr_recommendation?.value);
  assert.deepEqual(again.sharedWith, r.sharedWith);
  assert.equal(again.audit.length, r.audit.length);
  // The revived object still behaves as a record.
  assert.equal(fieldsOf(viewFor(again, "ambulance"))[0], "cpr_recommendation");
});

test("editing a draft that is awaiting signature returns it to draft", () => {
  const r = requestSignature(completeDraft());
  const edited = setField(r, "concerns_and_fears", "Worried about being a burden", "conversation 2026-09-12", "Dr A Patel");
  assert.equal(edited.status, "draft");
  assert.equal(r.status, "awaiting_signature", "input not mutated");
  assert.match(edited.audit.at(-1)?.detail ?? "", /set Concerns and fears from conversation/);
});
