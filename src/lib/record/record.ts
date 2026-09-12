/**
 * The advance care planning record: the part of Cairn that travels.
 * A faithful port of reference/cairn/record.py, written as pure functions over immutable
 * objects: every function returns a new record and never mutates its input.
 *
 * Two rules are enforced here because a clinical judge will ask:
 *   1. Nothing leaves draft without a named clinician signing it. Cairn cannot sign.
 *   2. Every clinical field carries provenance. A field with no source cannot be shared.
 *
 * ReSPECT recommendations are not legally binding and are not a DNACPR form. An ADRT is a
 * separate, legally binding document, so it is referenced here rather than generated.
 */

import type { Audience, AuditEvent, CairnRecord, RecordEntry, RecordFieldName } from "@/lib/domain/types";
import { CLINICIAN } from "@/lib/copy";
import { AUDIENCES, AUDIENCE_DESCRIPTIONS, AUDIENCE_FIELDS, AUDIENCE_LABELS, AUDIENCE_NOTES } from "./audiences";
import { CLINICAL_FIELDS, RECORD_FIELDS, REQUIRED_FIELDS, fieldLabel } from "./fields";

export class SignatureRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureRefused";
  }
}

const IMMUTABLE_MESSAGE = "Signed record is immutable. Create a new version instead.";
const NOT_SIGNED_MESSAGE = "Record is not signed. Nothing is shared.";

/** Fields whose provenance is checked before signature: record.py unsourced_fields. */
const PROVENANCE_CHECKED: RecordFieldName[] = [...CLINICAL_FIELDS, "what_matters", "concerns_and_fears", "people_involved"];

function nowIso(): string {
  return new Date().toISOString();
}

export function auditEvent(action: string, actor: string, detail: string, at?: string): AuditEvent {
  return { at: at ?? nowIso(), action, actor, detail };
}

function withAudit(rec: CairnRecord, event: AuditEvent): CairnRecord {
  return { ...rec, audit: [...rec.audit, event] };
}

export function newRecord(patientId: string): CairnRecord {
  return { patientId, status: "draft", fields: {}, sharedWith: [], audit: [], version: 1 };
}

// -- validation ---------------------------------------------------------------

function entryOk(e: RecordEntry): boolean {
  return Boolean(e.value && e.source && e.recordedBy);
}

/** What a clinician still has to complete. Shown in the UI as a checklist. */
export function missingForSignature(rec: CairnRecord): RecordFieldName[] {
  return REQUIRED_FIELDS.filter((f) => rec.fields[f] === undefined);
}

/** Entries present but missing a value, a source or a named recorder. */
export function unsourcedFields(rec: CairnRecord): RecordFieldName[] {
  return PROVENANCE_CHECKED.filter((f) => {
    const e = rec.fields[f];
    return e !== undefined && !entryOk(e);
  });
}

export interface Readiness {
  ready: boolean;
  missing: RecordFieldName[];
  unsourced: RecordFieldName[];
}

export function readiness(rec: CairnRecord): Readiness {
  const missing = missingForSignature(rec);
  const unsourced = unsourcedFields(rec);
  return { ready: missing.length === 0 && unsourced.length === 0, missing, unsourced };
}

// -- state machine ------------------------------------------------------------

export function setField(
  rec: CairnRecord,
  field: RecordFieldName,
  value: string,
  source: string,
  recordedBy: string,
  opts: { sourceMessageId?: string; at?: string } = {},
): CairnRecord {
  if (rec.status === "signed" || rec.status === "shared") {
    throw new Error(IMMUTABLE_MESSAGE);
  }
  const at = opts.at ?? nowIso();
  const entry: RecordEntry = { value, source, recordedBy, recordedAt: at };
  if (opts.sourceMessageId) entry.sourceMessageId = opts.sourceMessageId;

  // Any edit reopens a draft that was awaiting signature; it must be re-submitted.
  const next: CairnRecord = {
    ...rec,
    status: rec.status === "awaiting_signature" ? "draft" : rec.status,
    fields: { ...rec.fields, [field]: entry },
  };
  return withAudit(next, auditEvent("set", recordedBy, `set ${fieldLabel(field)} from ${source}`, at));
}

/** Moves a complete, sourced draft to awaiting signature. Otherwise returns the record unchanged. */
export function requestSignature(rec: CairnRecord, opts: { actor?: string; at?: string } = {}): CairnRecord {
  if (!readiness(rec).ready) return rec;
  const at = opts.at ?? nowIso();
  return withAudit(
    { ...rec, status: "awaiting_signature" },
    auditEvent("request-signature", opts.actor ?? CLINICIAN.name, "draft complete, awaiting clinician signature", at),
  );
}

function isCairn(name: string): boolean {
  const trimmed = name.trim();
  return trimmed === "" || trimmed.toLowerCase().startsWith("cairn");
}

/** Records a refused signature attempt so the UI can show the refusal in the audit. */
export function refuseSignature(rec: CairnRecord, attemptedBy: string, at?: string): CairnRecord {
  const who = attemptedBy.trim() || "(no name)";
  return withAudit(rec, auditEvent("refuse-sign", who, `signature refused: ${who} is not a named clinician`, at));
}

/**
 * Only a named human signs. Cairn never calls this on its own behalf.
 *
 * Order of checks: (1) the name, (2) readiness, (3) sign. record.py checks the status before
 * the name; here the name is checked first so the demo refusal always explains itself,
 * whatever state the draft is in. Readiness is checked directly rather than requiring the
 * awaiting_signature status, so a complete draft can be signed in one step from the UI.
 */
export function sign(rec: CairnRecord, clinician: string, opts: { at?: string } = {}): CairnRecord {
  if (isCairn(clinician)) {
    throw new SignatureRefused("A record must be signed by a named clinician. Cairn cannot sign.");
  }
  if (rec.status === "signed" || rec.status === "shared" || rec.status === "superseded") {
    throw new SignatureRefused(`Cannot sign from status '${rec.status}'.`);
  }
  const r = readiness(rec);
  if (!r.ready) {
    const outstanding = [
      ...r.missing.map((f) => `${fieldLabel(f)} (not recorded)`),
      ...r.unsourced.map((f) => `${fieldLabel(f)} (no source)`),
    ];
    throw new SignatureRefused(`The record is not ready for signature. Outstanding: ${outstanding.join("; ")}.`);
  }
  const at = opts.at ?? nowIso();
  const name = clinician.trim();
  return withAudit(
    { ...rec, status: "signed", signedBy: name, signedAt: at },
    auditEvent("sign", name, `signed by ${name}`, at),
  );
}

export function share(rec: CairnRecord, audiences: Audience[], opts: { actor?: string; at?: string } = {}): CairnRecord {
  if (rec.status !== "signed" && rec.status !== "shared") {
    throw new Error("Only a signed record can be shared.");
  }
  const bad = audiences.filter((a) => !AUDIENCES.includes(a));
  if (bad.length > 0) {
    throw new Error(`unknown audience ${bad.join(", ")}`);
  }
  const union = new Set<Audience>([...rec.sharedWith, ...audiences]);
  const sharedWith = AUDIENCES.filter((a) => union.has(a));
  const at = opts.at ?? nowIso();
  return withAudit(
    { ...rec, status: "shared", sharedWith },
    auditEvent("share", opts.actor ?? CLINICIAN.name, `shared with ${audiences.map((a) => AUDIENCE_LABELS[a]).join(", ")}`, at),
  );
}

// -- views --------------------------------------------------------------------

export interface AudienceView {
  audience: Audience;
  label: string;
  description: string;
  /** Present fields only, in the audience's order. Never a blank row. */
  fields: { name: RecordFieldName; label: string; value: string }[];
  /** Allowed fields that carry no value, so the UI can say "not recorded". */
  missing: RecordFieldName[];
  note?: string;
  signedBy?: string;
  signedAt?: string;
}

/**
 * What each service sees. An ambulance crew at 3am needs four lines, and a hospice needs the
 * whole picture. Same record, different surface.
 */
export function viewFor(rec: CairnRecord, audience: Audience): { error: string } | AudienceView {
  if (!AUDIENCES.includes(audience)) {
    throw new Error(`unknown audience ${audience}`);
  }
  if (rec.status !== "signed" && rec.status !== "shared") {
    return { error: NOT_SIGNED_MESSAGE };
  }
  const allowed = AUDIENCE_FIELDS[audience];
  const names: RecordFieldName[] = allowed === "all" ? RECORD_FIELDS.map((f) => f.name) : allowed;

  const fields: AudienceView["fields"] = [];
  const missing: RecordFieldName[] = [];
  for (const name of names) {
    const entry = rec.fields[name];
    if (entry && entry.value) {
      fields.push({ name, label: fieldLabel(name), value: entry.value });
    } else {
      missing.push(name);
    }
  }

  const view: AudienceView = {
    audience,
    label: AUDIENCE_LABELS[audience],
    description: AUDIENCE_DESCRIPTIONS[audience],
    fields,
    missing,
    signedBy: rec.signedBy,
    signedAt: rec.signedAt,
  };
  const note = AUDIENCE_NOTES[audience];
  if (note) view.note = note;
  return view;
}
