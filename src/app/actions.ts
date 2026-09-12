"use server";

/**
 * Every mutation in Cairn goes through one of these server actions. Each one loads the case
 * from the store, applies the domain functions (record, state machine, team, fixtures),
 * writes the case back and revalidates the pages that show it.
 *
 * The actor is always the signed-in clinician for the demo. Nothing here throws to the
 * caller: every action returns an ActionResult so a form can show the error in place.
 *
 * Plain-argument actions come first, for client components. FormData wrappers named
 * `<action>Form` follow, so a server component can use `<form action={...}>` with no
 * client JavaScript.
 */

import { revalidatePath } from "next/cache";

import type {
  Assessment,
  Audience,
  AuditEvent,
  CaseState,
  Channel,
  CoordinationThread,
  Decision,
  MessageKind,
  NextStep,
  Participant,
  ParticipantRole,
  Patient,
  RecordFieldName,
  ThreadMessage,
  WorklistState,
} from "@/lib/domain/types";
import { CLINICIAN } from "@/lib/copy";
import { getPatient, getPatients } from "@/lib/data/source";
import { rulesEngine } from "@/lib/scoring/rules";
import { SignatureRefused, refuseSignature, requestSignature, setField, share, sign } from "@/lib/record/record";
import { RECORD_FIELDS, fieldLabel } from "@/lib/record/fields";
import { deriveTeam } from "@/lib/coordination/team";
import { checkFamilyContent } from "@/lib/coordination/family-guard";
import { canTransition, resume, transition } from "@/lib/coordination/state";
import { scriptedReplies } from "@/lib/coordination/fixtures";
import { getCase, nowIso, resetCase, updateCase } from "@/lib/store";
import { QueueCapacityError, enqueueStage2Job } from "@/lib/cairn/jobs";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

const ACTOR = CLINICIAN.name;

const PARTICIPANT_ROLES: ParticipantRole[] = [
  "usual gp",
  "community nurse",
  "community matron",
  "specialist nurse",
  "specialist consultant",
  "palliative care",
  "pharmacist",
  "social care",
  "care home",
  "out of hours",
  "ambulance service",
  "next of kin",
  "carer",
];
const CHANNELS: Channel[] = ["professional", "family"];
const MESSAGE_KINDS: MessageKind[] = ["message", "proposal", "agreement", "concern", "action", "system"];
const AUDIENCES: Audience[] = ["gp", "out_of_hours", "ambulance", "hospice", "hospital", "family"];
const NEXT_STEP_STATUSES: NextStep["status"][] = ["open", "done", "blocked"];
const FIELD_NAMES: RecordFieldName[] = RECORD_FIELDS.map((f) => f.name);

function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong. Nothing was changed.";
}

function revalidate(patientId: string): void {
  // Revalidation is best-effort: outside a Next request (the end-to-end test drives these
  // actions directly) there is no request store, and the mutation has already been persisted.
  try {
    revalidatePath("/");
    revalidatePath(`/patient/${patientId}`, "layout");
  } catch {
    // no request context; nothing to revalidate
  }
}

/** Run a mutation, revalidate on success, and never let an error escape to the caller. */
async function run(patientId: string, fn: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const message = await fn();
    revalidate(patientId);
    return typeof message === "string" ? { ok: true, message } : { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

function audit(action: string, detail: string, actor = ACTOR, at = nowIso()): AuditEvent {
  return { at, action, actor, detail };
}

function withAudit(c: CaseState, event: AuditEvent): CaseState {
  return { ...c, audit: [...c.audit, event] };
}

/** A state change with a clear sentence when the machine does not allow it. */
function move(c: CaseState, to: WorklistState, opts: { reason?: string; at?: string } = {}): CaseState {
  if (!canTransition(c.state, to)) {
    throw new Error(`This case is at '${c.state}' and cannot move to '${to}'.`);
  }
  return transition(c, to, ACTOR, opts);
}

function required(value: string | undefined, label: string): string {
  const v = (value ?? "").trim();
  if (v === "") throw new Error(`${label} is required.`);
  return v;
}

function oneOf<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`${label} '${value}' is not recognised.`);
}

function parseDate(value: string, label: string): string {
  const v = value.trim();
  if (v === "" || Number.isNaN(Date.parse(v))) {
    throw new Error(`${label} must be a date, never 'soon'.`);
  }
  return v;
}

function findParticipant(c: CaseState, participantId: string): Participant {
  const p = c.participants.find((x) => x.id === participantId);
  if (!p) throw new Error("That participant is not on this case.");
  return p;
}

function findThread(c: CaseState, threadId: string): CoordinationThread {
  const t = c.threads.find((x) => x.id === threadId);
  if (!t) throw new Error("That coordination thread does not exist on this case.");
  return t;
}

function replaceThread(c: CaseState, thread: CoordinationThread): CaseState {
  return { ...c, threads: c.threads.map((t) => (t.id === thread.id ? thread : t)) };
}

function nextMessageId(thread: CoordinationThread): string {
  return `${thread.id}-m${thread.messages.length + 1}`;
}

/** One read entry per participant, holding the latest time they opened the thread. */
function markRead(thread: CoordinationThread, participantId: string, at: string): CoordinationThread {
  const others = thread.reads.filter((r) => r.participantId !== participantId);
  return { ...thread, reads: [...others, { participantId, at }] };
}

/** Append scripted colleague replies and record that each simulated author opened the thread. */
function appendReplies(thread: CoordinationThread, replies: ThreadMessage[]): CoordinationThread {
  let next = thread;
  for (const reply of replies) {
    next = { ...next, messages: [...next.messages, { ...reply, threadId: thread.id }] };
    next = markRead(next, reply.authorId, reply.at);
  }
  return next;
}

async function loadPatientAndAssessment(patientId: string): Promise<{ patient: Patient; assessment: Assessment }> {
  const [patient, all] = await Promise.all([getPatient(patientId), getPatients()]);
  if (!patient) throw new Error("Patient not found in the current data source.");
  const assessment = rulesEngine.assess(patient, { nowIso: all.meta.simulationNow });
  return { patient, assessment };
}

/** Next-step rules: one named owner who is on the case, and a real date. */
function validateNextStep(
  c: CaseState,
  input: { what: string; ownerId: string; due: string; createdFrom?: string },
): { what: string; ownerId: string; due: string; createdFrom?: string } {
  const what = required(input.what, "What needs to happen");
  const ownerId = (input.ownerId ?? "").trim();
  if (ownerId === "" || ownerId.toLowerCase() === "team" || ownerId.toLowerCase() === "the team") {
    throw new Error("Every next step needs one named owner, never the team.");
  }
  findParticipant(c, ownerId);
  const due = parseDate(input.due, "The due date");
  const step: { what: string; ownerId: string; due: string; createdFrom?: string } = { what, ownerId, due };
  if (input.createdFrom) step.createdFrom = input.createdFrom;
  return step;
}

function nextStepId(c: CaseState): string {
  const existing = c.outcome?.nextSteps.length ?? 0;
  return `ns-${c.patientId}-${existing + 1}`;
}

// ---------------------------------------------------------------------------
// The team
// ---------------------------------------------------------------------------

export async function assembleTeam(patientId: string): Promise<ActionResult> {
  return run(patientId, async () => {
    const { patient, assessment } = await loadPatientAndAssessment(patientId);
    const participants = deriveTeam(patient, assessment);
    const recipients = participants.filter((p) => p.recipientOnly).length;
    await updateCase(patientId, (c) => {
      let next: CaseState = { ...c, participants };
      next = move(next, "team assembled");
      return withAudit(
        next,
        audit("participant", `team proposed: ${participants.length - recipients} participants, ${recipients} recipients of the signed record`),
      );
    });
    return `Team proposed: ${participants.length} participants.`;
  });
}

export interface AddParticipantInput {
  name: string;
  role: ParticipantRole;
  roleLabel?: string;
  organisation: string;
  reasonForInclusion: string;
  evidence?: string;
  channel: Channel;
  required: boolean;
}

export async function addParticipant(patientId: string, input: AddParticipantInput): Promise<ActionResult> {
  return run(patientId, async () => {
    const name = required(input.name, "Name");
    const role = oneOf(input.role, PARTICIPANT_ROLES, "Role");
    const channel = oneOf(input.channel, CHANNELS, "Channel");
    const organisation = required(input.organisation, "Organisation");
    const reasonForInclusion = required(input.reasonForInclusion, "Reason for inclusion");
    await updateCase(patientId, (c) => {
      const participant: Participant = {
        id: `p-added-${c.participants.length + c.removedParticipants.length + 1}`,
        name,
        role,
        organisation,
        reasonForInclusion,
        evidence: (input.evidence ?? "").trim() || `Added by ${ACTOR}`,
        source: "added by clinician",
        channel,
        required: input.required,
        status: "invited",
        simulated: true,
      };
      if (input.roleLabel?.trim()) participant.roleLabel = input.roleLabel.trim();
      return withAudit(
        { ...c, participants: [...c.participants, participant] },
        audit("participant", `added ${name} (${role}, ${organisation}): ${reasonForInclusion}`),
      );
    });
    return `${name} added to the participants.`;
  });
}

export async function removeParticipant(patientId: string, participantId: string, reason?: string): Promise<ActionResult> {
  return run(patientId, async () => {
    await updateCase(patientId, (c) => {
      const participant = findParticipant(c, participantId);
      const at = nowIso();
      const removal: CaseState["removedParticipants"][number] = { participant, removedBy: ACTOR, at };
      const why = (reason ?? "").trim();
      if (why) removal.reason = why;
      const next: CaseState = {
        ...c,
        participants: c.participants.filter((p) => p.id !== participantId),
        removedParticipants: [...c.removedParticipants, removal],
        threads: c.threads.map((t) => ({ ...t, participantIds: t.participantIds.filter((id) => id !== participantId) })),
      };
      return withAudit(
        next,
        audit("participant", `removed ${participant.name} (${participant.role})${why ? `, ${why}` : ", no reason given"}`, ACTOR, at),
      );
    });
  });
}

export async function setParticipantRequired(patientId: string, participantId: string, required: boolean): Promise<ActionResult> {
  return run(patientId, async () => {
    await updateCase(patientId, (c) => {
      const participant = findParticipant(c, participantId);
      return withAudit(
        { ...c, participants: c.participants.map((p) => (p.id === participantId ? { ...p, required } : p)) },
        audit("participant", `${participant.name} marked ${required ? "required" : "optional"}`),
      );
    });
  });
}

// ---------------------------------------------------------------------------
// The coordination thread
// ---------------------------------------------------------------------------

export async function openThread(patientId: string, channel: Channel, purpose: string): Promise<ActionResult> {
  return run(patientId, async () => {
    const ch = oneOf(channel, CHANNELS, "Channel");
    const stated = required(purpose, "A stated purpose");
    const threadId = `t-${patientId}-${ch}`;
    const { patient, assessment } = await loadPatientAndAssessment(patientId);
    await updateCase(patientId, (c) => {
      if (c.threads.some((t) => t.id === threadId)) {
        throw new Error(`The ${ch} coordination thread is already open for this patient.`);
      }
      const at = nowIso();
      const participantIds = c.participants.filter((p) => p.channel === ch && !p.recipientOnly).map((p) => p.id);
      if (!participantIds.includes(CLINICIAN.id)) participantIds.unshift(CLINICIAN.id);
      let thread: CoordinationThread = {
        id: threadId,
        patientId,
        channel: ch,
        purpose: stated,
        openedBy: ACTOR,
        openedAt: at,
        participantIds,
        messages: [],
        reads: [],
      };
      thread = {
        ...thread,
        messages: [
          {
            id: nextMessageId(thread),
            threadId,
            authorId: "cairn",
            kind: "system",
            body: `Coordination thread opened by ${ACTOR}. Purpose: ${stated}`,
            at,
          },
        ],
      };
      thread = markRead(thread, CLINICIAN.id, at);
      const replies = scriptedReplies({
        patient,
        assessment,
        participants: c.participants,
        thread,
        trigger: ch === "professional" ? "open" : "family-open",
        nowIso: at,
      });
      thread = appendReplies(thread, replies);

      let next: CaseState = { ...c, threads: [...c.threads, thread] };
      if (ch === "professional" && next.state === "team assembled") {
        next = move(next, "coordinating", { at });
      }
      return withAudit(
        next,
        audit("thread", `opened ${ch} coordination thread with ${participantIds.length} participants. Purpose: ${stated}`, ACTOR, at),
      );
    });
    return `${ch === "family" ? "Family" : "Professional"} coordination thread opened.`;
  });
}

export interface PostMessageInput {
  kind: MessageKind;
  body: string;
  proposesField?: RecordFieldName;
  proposesValue?: string;
  inReplyTo?: string;
}

export async function postMessage(patientId: string, threadId: string, input: PostMessageInput): Promise<ActionResult> {
  try {
    const kind = oneOf(input.kind, MESSAGE_KINDS, "Message kind");
    const body = required(input.body, "The message");
    if (kind === "system") throw new Error("Only Cairn writes system entries.");

    const before = await getCase(patientId);
    const thread = findThread(before, threadId);

    if (thread.channel === "family") {
      if (kind === "proposal" || kind === "action") {
        return { ok: false, error: "The family channel carries no clinical recommendations." };
      }
      const check = checkFamilyContent(body);
      if (!check.ok) {
        return { ok: false, error: `${check.reason} Blocked phrase: "${check.matched}"` };
      }
    }

    let proposes: ThreadMessage["proposes"];
    if (kind === "proposal") {
      const field = oneOf(required(input.proposesField, "The record field a proposal is for"), FIELD_NAMES, "Record field");
      const value = required(input.proposesValue, "The proposed value");
      proposes = { field, value };
    }

    // Colleague replies need the patient and assessment; only load them when they are wanted.
    const wantsReplies = thread.channel === "professional" && (kind === "proposal" || kind === "concern");
    const context = wantsReplies ? await loadPatientAndAssessment(patientId) : undefined;

    await updateCase(patientId, (c) => {
      const current = findThread(c, threadId);
      const at = nowIso();
      const message: ThreadMessage = {
        id: nextMessageId(current),
        threadId,
        authorId: CLINICIAN.id,
        kind,
        body,
        at,
      };
      if (proposes) message.proposes = proposes;
      if (input.inReplyTo?.trim()) message.inReplyTo = input.inReplyTo.trim();
      if (current.channel === "family") message.approvedBy = ACTOR;

      let updated: CoordinationThread = { ...current, messages: [...current.messages, message] };
      updated = markRead(updated, CLINICIAN.id, at);

      if (context && (kind === "proposal" || kind === "concern")) {
        const replies = scriptedReplies({
          patient: context.patient,
          assessment: context.assessment,
          participants: c.participants,
          thread: updated,
          trigger: kind,
          inReplyTo: message,
          nowIso: at,
        });
        updated = appendReplies(updated, replies);
      }

      const detail =
        kind === "proposal" && proposes
          ? `proposed ${fieldLabel(proposes.field)} on the ${current.channel} thread`
          : `posted ${kind} on the ${current.channel} thread`;
      return withAudit(replaceThread(c, updated), audit("thread", detail, ACTOR, at));
    });
    revalidate(patientId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// The outcome and next steps
// ---------------------------------------------------------------------------

export interface DecisionInput {
  text: string;
  fromMessageId?: string;
  intoRecordField?: RecordFieldName;
  proposedValue?: string;
}

export interface NextStepInput {
  what: string;
  ownerId: string;
  due: string;
  createdFrom?: string;
}

export interface RecordOutcomeInput {
  heldAt: string;
  summary: string;
  attendees: string[];
  apologies: string[];
  decisions: DecisionInput[];
  nextSteps: NextStepInput[];
}

function toDecision(input: DecisionInput): Decision {
  const d: Decision = { text: required(input.text, "A decision") };
  if (input.fromMessageId?.trim()) d.fromMessageId = input.fromMessageId.trim();
  if (input.intoRecordField) d.intoRecordField = oneOf(input.intoRecordField, FIELD_NAMES, "Record field");
  if (input.proposedValue?.trim()) d.proposedValue = input.proposedValue.trim();
  return d;
}

export async function recordOutcome(patientId: string, input: RecordOutcomeInput): Promise<ActionResult> {
  return run(patientId, async () => {
    const summary = required(input.summary, "The meeting summary");
    const heldAt = input.heldAt?.trim() ? parseDate(input.heldAt, "When the meeting was held") : nowIso();
    await updateCase(patientId, (c) => {
      if (c.state !== "coordinating") {
        throw new Error("Open the coordination thread and reach a decision before recording the outcome.");
      }
      const decisions = input.decisions.map(toDecision);
      const nextSteps: NextStep[] = input.nextSteps.map((s, i) => ({
        id: `ns-${patientId}-${i + 1}`,
        ...validateNextStep(c, s),
        status: "open",
      }));
      const at = nowIso();
      let next: CaseState = {
        ...c,
        outcome: {
          patientId,
          heldAt,
          summary,
          attendees: input.attendees.filter((a) => a.trim() !== ""),
          apologies: input.apologies.filter((a) => a.trim() !== ""),
          decisions,
          nextSteps,
          recordedBy: ACTOR,
        },
      };
      next = move(next, "meeting held", { at });
      return withAudit(
        next,
        audit("outcome", `meeting outcome recorded: ${decisions.length} decisions, ${nextSteps.length} next steps`, ACTOR, at),
      );
    });
    return "Meeting outcome recorded.";
  });
}

export async function addNextStep(patientId: string, input: NextStepInput): Promise<ActionResult> {
  return run(patientId, async () => {
    await updateCase(patientId, (c) => {
      if (!c.outcome) throw new Error("Record the meeting outcome before adding next steps.");
      const step: NextStep = { id: nextStepId(c), ...validateNextStep(c, input), status: "open" };
      const owner = findParticipant(c, step.ownerId);
      return withAudit(
        { ...c, outcome: { ...c.outcome, nextSteps: [...c.outcome.nextSteps, step] } },
        audit("next-step", `added next step for ${owner.name}, due ${step.due}: ${step.what}`),
      );
    });
  });
}

export async function setNextStepStatus(
  patientId: string,
  nextStepId: string,
  status: NextStep["status"],
  blockedReason?: string,
): Promise<ActionResult> {
  return run(patientId, async () => {
    const s = oneOf(status, NEXT_STEP_STATUSES, "Status");
    const why = (blockedReason ?? "").trim();
    if (s === "blocked" && why === "") throw new Error("A blocked next step needs a reason.");
    await updateCase(patientId, (c) => {
      if (!c.outcome) throw new Error("No meeting outcome has been recorded.");
      const step = c.outcome.nextSteps.find((x) => x.id === nextStepId);
      if (!step) throw new Error("That next step does not exist on this case.");
      const updated: NextStep = { ...step, status: s };
      if (s === "blocked") updated.blockedReason = why;
      else delete updated.blockedReason;
      return withAudit(
        { ...c, outcome: { ...c.outcome, nextSteps: c.outcome.nextSteps.map((x) => (x.id === nextStepId ? updated : x)) } },
        audit("next-step", `next step '${step.what}' marked ${s}${why ? `: ${why}` : ""}`),
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Promotion into the record
// ---------------------------------------------------------------------------

/**
 * Accepting a decision into the record. The accepting clinician is recorded-by, never the
 * colleague who proposed it. PROMOTION NEVER SIGNS: the record is still a draft afterwards,
 * and a named clinician still has to sign it before it counts or travels.
 */
export async function promoteDecision(patientId: string, decisionIndex: number): Promise<ActionResult> {
  return run(patientId, async () => {
    let label = "";
    await updateCase(patientId, (c) => {
      const outcome = c.outcome;
      if (!outcome) throw new Error("Record the meeting outcome before promoting a decision.");
      const decision = outcome.decisions[decisionIndex];
      if (!decision) throw new Error("That decision does not exist on this outcome.");
      if (!decision.intoRecordField || !decision.proposedValue) {
        throw new Error("This decision carries no record field or proposed value, so there is nothing to promote.");
      }
      if (decision.promotedAt) throw new Error("This decision has already been promoted into the record.");
      const at = nowIso();
      const source = decision.fromMessageId
        ? `coordination thread, message ${decision.fromMessageId}`
        : `coordination thread, decision ${decisionIndex + 1}`;
      const record = setField(c.record, decision.intoRecordField, decision.proposedValue, source, ACTOR, {
        ...(decision.fromMessageId ? { sourceMessageId: decision.fromMessageId } : {}),
        at,
      });
      // Promotion never signs. If this ever fails, something upstream has changed the rules.
      if (record.status !== "draft" && record.status !== "awaiting_signature") {
        throw new Error("Promotion must leave the record unsigned. Nothing was changed.");
      }
      label = fieldLabel(decision.intoRecordField);

      const threads = c.threads.map((t) => ({
        ...t,
        messages: t.messages.map((m) => (m.id === decision.fromMessageId ? { ...m, promotedToRecord: true } : m)),
      }));
      const decisions = outcome.decisions.map((d, i) => (i === decisionIndex ? { ...d, promotedAt: at } : d));
      return withAudit(
        { ...c, record, threads, outcome: { ...outcome, decisions } },
        audit("promote", `promoted decision ${decisionIndex + 1} into ${label} (${source}); record still awaits signature`, ACTOR, at),
      );
    });
    return `${label} set from the coordination thread. The record still needs a clinician's signature.`;
  });
}

export async function setRecordField(
  patientId: string,
  field: RecordFieldName,
  value: string,
  source?: string,
): Promise<ActionResult> {
  return run(patientId, async () => {
    const name = oneOf(field, FIELD_NAMES, "Record field");
    const v = required(value, fieldLabel(name));
    const at = nowIso();
    const src = (source ?? "").trim() || `conversation ${at.slice(0, 10)} with ${ACTOR}`;
    await updateCase(patientId, (c) => {
      const record = setField(c.record, name, v, src, ACTOR, { at });
      return withAudit({ ...c, record }, audit("set", `set ${fieldLabel(name)} from ${src}`, ACTOR, at));
    });
  });
}

// ---------------------------------------------------------------------------
// Signature and sharing
// ---------------------------------------------------------------------------

/**
 * The demo moment. Cairn asks to sign its own record and is refused. The refusal is
 * persisted in the audit trail so it is visible afterwards, and returned to the caller.
 */
export async function attemptCairnSignature(patientId: string): Promise<ActionResult> {
  try {
    const c = await getCase(patientId);
    try {
      sign(c.record, "Cairn");
    } catch (e) {
      if (e instanceof SignatureRefused) {
        const refusal = e.message;
        await updateCase(patientId, (current) => {
          const at = nowIso();
          return withAudit(
            { ...current, record: refuseSignature(current.record, "Cairn", at) },
            audit("refuse-sign", refusal, "Cairn", at),
          );
        });
        revalidate(patientId);
        return { ok: false, error: refusal };
      }
      throw e;
    }
    // sign() refuses Cairn by name, so this line is unreachable. It stays as a guard.
    return { ok: false, error: "Cairn cannot sign a record. Nothing was changed." };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function signRecord(
  patientId: string,
  clinicianName: string,
  extra: { gmc?: string; signature?: string; nextReviewAt?: string } = {},
): Promise<ActionResult> {
  return run(patientId, async () => {
    const name = (clinicianName ?? "").trim();
    const nextReviewAt = extra.nextReviewAt?.trim() ? parseDate(extra.nextReviewAt, "The review date") : undefined;
    await updateCase(patientId, (c) => {
      if (c.state === "paused") {
        throw new Error("This case is paused. Resume it before signing.");
      }
      const at = nowIso();
      const requested = requestSignature(c.record, { actor: name || ACTOR, at });
      const record = sign(requested, name, {
        at,
        ...(extra.gmc?.trim() ? { gmc: extra.gmc.trim() } : {}),
        ...(extra.signature?.trim() ? { signature: extra.signature.trim() } : {}),
        ...(nextReviewAt ? { nextReviewAt } : {}),
      });
      let next: CaseState = { ...c, record };
      // A ready record can be signed from any working state; the machine allows the move from each.
      if (next.state !== "record signed" && next.state !== "shared") next = move(next, "record signed", { at });
      return withAudit(next, audit("sign", `record signed by ${name}`, name, at));
    });
    return `Record signed by ${name}.`;
  });
}

export async function shareRecord(patientId: string, audiences: Audience[]): Promise<ActionResult> {
  return run(patientId, async () => {
    const chosen = audiences.map((a) => oneOf(a, AUDIENCES, "Audience"));
    if (chosen.length === 0) throw new Error("Choose at least one recipient of the signed record.");
    await updateCase(patientId, (c) => {
      if (c.state !== "record signed" && c.state !== "shared") {
        throw new Error("Only a signed record can be shared.");
      }
      const at = nowIso();
      const record = share(c.record, chosen, { actor: ACTOR, at });
      let next: CaseState = { ...c, record };
      if (next.state === "record signed") next = move(next, "shared", { at });
      return withAudit(next, audit("share", `shared the signed record with ${chosen.join(", ")}`, ACTOR, at));
    });
    return `Record shared with ${chosen.length} ${chosen.length === 1 ? "recipient" : "recipients"}.`;
  });
}

// ---------------------------------------------------------------------------
// Pausing, resuming, resetting
// ---------------------------------------------------------------------------

export async function pauseCase(patientId: string, reason: string): Promise<ActionResult> {
  return run(patientId, async () => {
    const why = required(reason, "A reason for pausing");
    // transition() writes the state audit entry itself, reason included.
    await updateCase(patientId, (c) => move(c, "paused", { reason: why }));
    return "Case paused. The reason is shown on the worklist.";
  });
}

export async function resumeCase(patientId: string): Promise<ActionResult> {
  return run(patientId, async () => {
    // resume() writes the state audit entry itself.
    await updateCase(patientId, (c) => {
      if (c.state !== "paused") throw new Error("This case is not paused.");
      return resume(c, ACTOR);
    });
    return "Case resumed.";
  });
}

/** Development helper: clears every trace of this patient's case so the demo can be re-run. */
export async function resetDemo(patientId: string): Promise<ActionResult> {
  return run(patientId, async () => {
    await resetCase(patientId);
    return "Case reset.";
  });
}

// ---------------------------------------------------------------------------
// FormData wrappers, for <form action={...}> in server components
// ---------------------------------------------------------------------------

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function bool(fd: FormData, key: string): boolean {
  return ["true", "on", "1", "yes"].includes(str(fd, key).toLowerCase());
}

function list(fd: FormData, key: string): string[] {
  return fd
    .getAll(key)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v !== "");
}

function jsonList<T>(fd: FormData, key: string): T[] {
  const raw = str(fd, key);
  if (raw === "") return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${key} must be a JSON list.`);
  return parsed as T[];
}

/**
 * Every wrapper resolves the patient id the same way and never throws. React's form
 * `action` prop accepts only `(formData) => void | Promise<void>`, so the wrappers return
 * nothing; a form that needs the result in place should call the plain action from a
 * client component instead. A refusal is still persisted and shown through the audit trail.
 */
async function fromForm(formData: FormData, fn: (patientId: string) => Promise<ActionResult>): Promise<void> {
  let result: ActionResult;
  try {
    const patientId = required(str(formData, "patientId"), "patientId");
    result = await fn(patientId);
  } catch (e) {
    result = { ok: false, error: errorMessage(e) };
  }
  if (!result.ok) console.warn(`[cairn] form action declined: ${result.error}`);
}

export async function assembleTeamForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) => assembleTeam(id));
}

export async function addParticipantForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) =>
    addParticipant(id, {
      name: str(formData, "name"),
      role: str(formData, "role") as ParticipantRole,
      roleLabel: str(formData, "roleLabel") || undefined,
      organisation: str(formData, "organisation"),
      reasonForInclusion: str(formData, "reasonForInclusion"),
      evidence: str(formData, "evidence") || undefined,
      channel: str(formData, "channel") as Channel,
      required: bool(formData, "required"),
    }),
  );
}

export async function removeParticipantForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) => removeParticipant(id, str(formData, "participantId"), str(formData, "reason") || undefined));
}

export async function setParticipantRequiredForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) => setParticipantRequired(id, str(formData, "participantId"), bool(formData, "required")));
}

export async function openThreadForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) => openThread(id, str(formData, "channel") as Channel, str(formData, "purpose")));
}

export async function postMessageForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) =>
    postMessage(id, str(formData, "threadId"), {
      kind: (str(formData, "kind") || "message") as MessageKind,
      body: str(formData, "body"),
      proposesField: (str(formData, "proposesField") || undefined) as RecordFieldName | undefined,
      proposesValue: str(formData, "proposesValue") || undefined,
      inReplyTo: str(formData, "inReplyTo") || undefined,
    }),
  );
}

export async function recordOutcomeForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) =>
    recordOutcome(id, {
      heldAt: str(formData, "heldAt"),
      summary: str(formData, "summary"),
      attendees: list(formData, "attendees"),
      apologies: list(formData, "apologies"),
      decisions: jsonList<DecisionInput>(formData, "decisions"),
      nextSteps: jsonList<NextStepInput>(formData, "nextSteps"),
    }),
  );
}

export async function addNextStepForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) =>
    addNextStep(id, {
      what: str(formData, "what"),
      ownerId: str(formData, "ownerId"),
      due: str(formData, "due"),
      createdFrom: str(formData, "createdFrom") || undefined,
    }),
  );
}

export async function setNextStepStatusForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) =>
    setNextStepStatus(
      id,
      str(formData, "nextStepId"),
      str(formData, "status") as NextStep["status"],
      str(formData, "blockedReason") || undefined,
    ),
  );
}

export async function promoteDecisionForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) => {
    const index = Number.parseInt(str(formData, "decisionIndex"), 10);
    if (!Number.isInteger(index) || index < 0) throw new Error("decisionIndex must be a whole number.");
    return promoteDecision(id, index);
  });
}

export async function setRecordFieldForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) =>
    setRecordField(id, str(formData, "field") as RecordFieldName, str(formData, "value"), str(formData, "source") || undefined),
  );
}

export async function attemptCairnSignatureForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) => attemptCairnSignature(id));
}

export async function signRecordForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) =>
    signRecord(id, str(formData, "clinicianName"), {
      gmc: str(formData, "gmc") || undefined,
      signature: str(formData, "signature") || undefined,
      nextReviewAt: str(formData, "nextReviewAt") || undefined,
    }),
  );
}

export async function shareRecordForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) => shareRecord(id, list(formData, "audiences") as Audience[]));
}

export async function pauseCaseForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) => pauseCase(id, str(formData, "reason")));
}

export async function resumeCaseForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) => resumeCase(id));
}

export async function resetDemoForm(formData: FormData): Promise<void> {
  return fromForm(formData, (id) => resetDemo(id));
}

// ---------------------------------------------------------------------------
// Stage 2 record review
// ---------------------------------------------------------------------------

/**
 * Queue a Stage 2 record review for one patient. This only writes a queued job to the
 * filesystem queue: the separate worker (`npm run stage2:worker`, which needs a model key
 * in .env.local) picks it up, and the screen reads the result once it has landed. The
 * review is clinical decision support only; a named clinician decides.
 */
export async function requestRecordReview(patientId: string): Promise<ActionResult> {
  try {
    await enqueueStage2Job(patientId);
    revalidate(patientId);
    return { ok: true, message: "Record review queued. A worker picks it up; refresh in a few minutes." };
  } catch (e) {
    if (e instanceof QueueCapacityError) return { ok: false, error: "The review queue is full, try again shortly." };
    return { ok: false, error: errorMessage(e) };
  }
}
