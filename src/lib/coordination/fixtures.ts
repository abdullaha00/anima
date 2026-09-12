/**
 * Scripted replies from simulated colleagues. There is no real-time infrastructure: the other
 * participants are seeded, every reply is marked simulated, and each one is grounded only in
 * data that exists on the patient (indicator evidence, goals, needs, admissions).
 *
 * Nothing is ever posted to the family channel automatically. A clinician writes or
 * approves every family entry.
 */

import type {
  Assessment,
  CoordinationThread,
  Participant,
  Patient,
  ThreadMessage,
} from "@/lib/domain/types";
import { CLINICIAN } from "@/lib/copy";
import { formatDate } from "@/lib/format";

export type ReplyTrigger = "open" | "proposal" | "concern" | "family-open";

export const DEMO_PATIENT_IDS = ["SIM-000001"];

export const DEMO_THREAD_PURPOSE =
  "Agree an advance care plan and a preferred place of care, following the recent hospital attendance for breathlessness.";

/** A stated purpose for a thread on any other patient, built from what the record shows. */
export function defaultPurpose(patient: Patient, assessment: Assessment): string {
  if (DEMO_PATIENT_IDS.includes(patient.id)) return DEMO_THREAD_PURPOSE;
  const emergency = [...patient.admissions].filter((a) => a.emergency).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (emergency) {
    return `Agree an advance care plan and a preferred place of care, following the hospital attendance of ${formatDate(emergency.at)}.`;
  }
  const first = assessment.signals[0];
  if (first) {
    return `Agree an advance care plan and a preferred place of care, following the indicator '${first.label}' in the record.`;
  }
  return "Agree an advance care plan and a preferred place of care.";
}

interface ReplyArgs {
  patient: Patient;
  assessment: Assessment;
  participants: Participant[];
  thread: CoordinationThread;
  trigger: ReplyTrigger;
  inReplyTo?: ThreadMessage;
  nowIso: string;
}

/** Simulated professionals who are actually in the thread. Never the GP, never a recipient. */
function eligibleAuthors(participants: Participant[], thread: CoordinationThread): Participant[] {
  return participants.filter(
    (p) =>
      thread.participantIds.includes(p.id) &&
      p.id !== CLINICIAN.id &&
      p.channel === "professional" &&
      !p.recipientOnly &&
      p.simulated === true,
  );
}

function byKey(authors: Participant[], key: string): Participant | undefined {
  return authors.find((p) => p.id === `p-${key}`);
}

function minutesAfter(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function newId(n: number): string {
  return `m-sim-${n}-${Math.random().toString(36).slice(2, 8)}`;
}

function signalEvidence(assessment: Assessment, ids: string[]): string | undefined {
  return assessment.signals.find((s) => ids.includes(s.id))?.evidence;
}

/** The most recent discharge summary, for an agreement to cite. */
function latestDischarge(patient: Patient) {
  return [...patient.admissions]
    .filter((a) => a.kind === "discharge summary")
    .sort((a, b) => b.at.localeCompare(a.at))[0];
}

export function scriptedReplies(args: ReplyArgs): ThreadMessage[] {
  const { patient, assessment, participants, thread, trigger, inReplyTo, nowIso } = args;

  // The family channel is written or approved by a clinician, never seeded.
  if (trigger === "family-open" || thread.channel === "family") return [];

  const authors = eligibleAuthors(participants, thread);
  if (authors.length === 0) return [];

  const name = patient.name ?? "the patient";
  const out: ThreadMessage[] = [];
  const post = (author: Participant, partial: Omit<ThreadMessage, "id" | "threadId" | "authorId" | "at" | "simulated">) => {
    const n = out.length + 1;
    out.push({
      id: newId(n),
      threadId: thread.id,
      authorId: author.id,
      at: minutesAfter(nowIso, n * 4),
      simulated: true,
      ...partial,
    });
  };

  if (trigger === "open") {
    const used = new Set<string>();

    // A specialist nurse speaks to what the record does and does not carry.
    const hf = byKey(authors, "hf-nurse");
    const heartEvidence = signalEvidence(assessment, ["DIS_HEART", "REC_HEART"]);
    if (hf && heartEvidence) {
      const nyha =
        patient.nyha === undefined
          ? "The record carries no NYHA class."
          : `The record carries NYHA class ${patient.nyha}.`;
      post(hf, {
        kind: "message",
        body: `${nyha} Evidence on file: ${heartEvidence}. Is ${name} breathless at rest, or only on exertion? That shapes what we recommend for the home.`,
      });
      used.add(hf.id);
    }

    const resp = byKey(authors, "resp-team");
    const respEvidence = signalEvidence(assessment, ["DIS_RESP", "REC_RESP"]);
    if (resp && respEvidence && out.length < 2) {
      const mrc =
        patient.mrcDyspnoea === undefined
          ? "No MRC dyspnoea grade is recorded."
          : `MRC dyspnoea grade ${patient.mrcDyspnoea} is recorded.`;
      post(resp, {
        kind: "message",
        body: `${mrc} Evidence on file: ${respEvidence}. Happy to review inhaler technique and a rescue pack at the next visit.`,
      });
      used.add(resp.id);
    }

    // A proposal for the record, citing the patient's own goal where one exists.
    const proposer =
      byKey(authors, "palliative") ?? byKey(authors, "community-matron") ?? authors.find((a) => !used.has(a.id)) ?? authors[0];
    const homeGoal = patient.goals.find((g) => /\bhome\b/i.test(g));
    const proposalBody = homeGoal
      ? `${name} has recorded the goal "${homeGoal}". I propose we record Home as the preferred place of care and plan around that.`
      : `Preferred place of care is not yet recorded. I propose we record Home, and check that with ${name} at the next contact.`;
    post(proposer, {
      kind: "proposal",
      body: proposalBody,
      proposes: { field: "preferred_place_of_care", value: "Home" },
    });
    used.add(proposer.id);

    // A second voice, if there is one and the thread is still short.
    if (out.length < 2) {
      const other = authors.find((a) => !used.has(a.id));
      if (other) {
        const emergency = [...patient.admissions].filter((a) => a.emergency).sort((a, b) => b.at.localeCompare(a.at))[0];
        const body = emergency
          ? `Noted the hospital attendance of ${formatDate(emergency.at)}. I can visit this week to go through what would help ${name} avoid another.`
          : `I have read the record. Happy to take an action from this thread once the plan is agreed.`;
        post(other, { kind: "message", body });
      }
    }

    return out.slice(0, 3);
  }

  if (trigger === "proposal") {
    if (!inReplyTo) return [];
    const agreer =
      byKey(authors, "palliative") ??
      authors.find((a) => a.required && a.id !== inReplyTo.authorId) ??
      authors.find((a) => a.id !== inReplyTo.authorId) ??
      authors[0];
    const discharge = latestDischarge(patient);
    const body = discharge
      ? `Agree. Consistent with the discharge summary of ${formatDate(discharge.at)}.`
      : "Agree.";
    post(agreer, { kind: "agreement", body, inReplyTo: inReplyTo.id });
    return out;
  }

  if (trigger === "concern") {
    if (!inReplyTo) return [];
    const responder = authors.find((a) => a.id !== inReplyTo.authorId) ?? authors[0];
    post(responder, {
      kind: "message",
      body: "Noted, thank you for raising it. Let us hold the proposal until that is settled and pick it up at the meeting.",
      inReplyTo: inReplyTo.id,
    });
    return out;
  }

  return [];
}
