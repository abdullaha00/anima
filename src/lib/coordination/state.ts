/**
 * The worklist state machine: the patient journey from flag to shared record.
 *
 *   flagged -> team assembled -> coordinating -> meeting held -> record signed -> shared
 *                                       \ paused (reason required) /
 */

import type { CaseState, WorklistState } from "@/lib/domain/types";
import { auditEvent } from "@/lib/record/record";

export const TRANSITIONS: Record<WorklistState, WorklistState[]> = {
  flagged: ["team assembled", "paused"],
  "team assembled": ["coordinating", "paused"],
  coordinating: ["meeting held", "paused"],
  "meeting held": ["record signed", "paused"],
  "record signed": ["shared", "paused"],
  shared: [],
  // Leaving 'paused' goes back to pausedFrom, handled by resume().
  paused: [],
};

export function canTransition(from: WorklistState, to: WorklistState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(
  c: CaseState,
  to: WorklistState,
  actor: string,
  opts: { reason?: string; at?: string } = {},
): CaseState {
  if (!canTransition(c.state, to)) {
    throw new Error(`Cannot move from '${c.state}' to '${to}'.`);
  }
  const at = opts.at ?? new Date().toISOString();
  const reason = opts.reason?.trim() ?? "";

  if (to === "paused") {
    // A pause without a reason is a patient quietly dropped. Not allowed.
    if (!reason) throw new Error("A reason is required to pause.");
    return {
      ...c,
      state: "paused",
      pausedReason: reason,
      pausedFrom: c.state,
      audit: [...c.audit, auditEvent("state", actor, `paused from '${c.state}': ${reason}`, at)],
      updatedAt: at,
    };
  }

  const detail = reason ? `${c.state} -> ${to}: ${reason}` : `${c.state} -> ${to}`;
  return {
    ...c,
    state: to,
    audit: [...c.audit, auditEvent("state", actor, detail, at)],
    updatedAt: at,
  };
}

/** Lifts a pause, returning to the state the case was in before. */
export function resume(c: CaseState, actor: string, at?: string): CaseState {
  if (c.state !== "paused") throw new Error("Only a paused case can be resumed.");
  const back = c.pausedFrom ?? "flagged";
  const when = at ?? new Date().toISOString();
  const next: CaseState = {
    ...c,
    state: back,
    audit: [...c.audit, auditEvent("state", actor, `resumed to '${back}'`, when)],
    updatedAt: when,
  };
  delete next.pausedReason;
  delete next.pausedFrom;
  return next;
}

export const STATE_LABELS: Record<WorklistState, string> = {
  flagged: "Flagged",
  "team assembled": "Team assembled",
  coordinating: "Coordinating",
  "meeting held": "Meeting held",
  "record signed": "Record signed",
  shared: "Shared",
  paused: "Paused",
};

/** What the UI offers next, as a label and a path suffix relative to /patient/[id]. */
export function nextActionFor(state: WorklistState): { label: string; path: string } {
  switch (state) {
    case "flagged":
      return { label: "Review the evidence, assemble the team", path: "" };
    case "team assembled":
      return { label: "Open the thread", path: "/team" };
    case "coordinating":
      return { label: "Post, propose, record the outcome", path: "/thread" };
    case "meeting held":
      return { label: "Promote decisions into the record", path: "/outcome" };
    case "record signed":
      return { label: "Share with audiences", path: "/record" };
    case "shared":
      return { label: "View audit, review next steps", path: "/record" };
    case "paused":
      return { label: "Paused: reason shown", path: "" };
  }
}
