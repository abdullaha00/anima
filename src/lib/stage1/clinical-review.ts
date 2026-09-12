import type { CaseState, NextStep } from "../domain/types";
export interface ScreeningDecision {
  screeningId: string; snapshotHash: string; stage2JobId: string;
  decision: "accepted" | "amended" | "dismissed"; reason: string;
  revision: number; actor: string; at: string; preparationStepId?: string;
}
export interface ReviewDecisionInput {
  decision: ScreeningDecision["decision"]; reason: string; ownerId: string; what: string; due: string; expectedRevision: number;
}
export function decideScreening(c: CaseState, provenance: Pick<ScreeningDecision, "screeningId" | "snapshotHash" | "stage2JobId"> & { patientId: string }, input: ReviewDecisionInput, actor: string, at: string): CaseState {
  if (c.patientId !== provenance.patientId) throw new Error("Screening belongs to another patient");
  if (!["accepted", "amended", "dismissed"].includes(input.decision)) throw new Error("Choose a review decision");
  if (!input.reason.trim() || input.reason.length > 2000) throw new Error("Record the clinician's reason (up to 2,000 characters)");
  const previous = c.screeningReviews?.find(r => r.screeningId === provenance.screeningId);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== (previous?.revision ?? 0)) throw new Error("This review changed. Refresh before saving again.");
  if (previous && (previous.snapshotHash !== provenance.snapshotHash || previous.stage2JobId !== provenance.stage2JobId)) throw new Error("Review provenance changed");
  const steps = [...(c.preparationSteps ?? [])];
  let stepId = previous?.preparationStepId;
  if (input.decision !== "dismissed") {
    const owner = c.participants.find(p => p.id === input.ownerId && p.channel === "professional" && !p.recipientOnly && p.status !== "declined");
    if (!owner || !owner.name.trim() || /name not recorded|unconfirmed|unknown/i.test(owner.name) || owner.name.toLowerCase() === owner.role.toLowerCase() || owner.name.toLowerCase() === owner.roleLabel?.toLowerCase()) throw new Error("Confirm a named professional owner from the care team");
    if (!input.what.trim() || input.what.length > 2000) throw new Error("Describe the preparation action (up to 2,000 characters)");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.due) || !Number.isFinite(Date.parse(input.due)) || new Date(input.due).toISOString().slice(0, 10) !== input.due) throw new Error("Choose a valid action due date");
    stepId ??= crypto.randomUUID();
    const previousStep = steps.find(s => s.id === stepId);
    if (previousStep?.status === "done") throw new Error("This preparation action is complete; its completion cannot be overwritten");
    const step: NextStep = { id: stepId, what: input.what.trim(), ownerId: owner.id, due: input.due, status: "open", createdFrom: `screening:${provenance.screeningId}:review:${provenance.stage2JobId}` };
    const index = steps.findIndex(s => s.id === stepId); if (index >= 0) steps[index] = step; else steps.push(step);
  } else if (stepId) {
    const index = steps.findIndex(s => s.id === stepId);
    if (index >= 0 && steps[index].status !== "done") steps[index] = { ...steps[index], status: "blocked", blockedReason: `Review dismissed: ${input.reason.trim()}` };
  }
  const decision: ScreeningDecision = { ...provenance, decision: input.decision, reason: input.reason.trim(), revision: (previous?.revision ?? 0) + 1, actor, at, ...(stepId ? { preparationStepId: stepId } : {}) };
  return { ...c, preparationSteps: steps, screeningReviews: [...(c.screeningReviews ?? []).filter(r => r.screeningId !== provenance.screeningId), decision],
    audit: [...c.audit, { at, actor, action: "screening-review", detail: `${input.decision}; screening ${provenance.screeningId}; snapshot ${provenance.snapshotHash}; Stage 2 ${provenance.stage2JobId}; revision ${decision.revision}; ${input.reason.trim()}${stepId ? `; Cairn preparation action ${stepId}` : ""}` }] };
}
export function changePreparationStatus(c: CaseState, id: string, status: "done" | "blocked", reason: string, actor: string, at: string): CaseState {
  if (!["done", "blocked"].includes(status)) throw new Error("Choose done or blocked");
  const step = c.preparationSteps?.find(s => s.id === id);
  if (!step || step.status !== "open") throw new Error("Only an open preparation action can be updated");
  if (status === "blocked" && !reason.trim()) throw new Error("Give the reason this action is blocked");
  if (reason.length > 2000) throw new Error("Reason is too long");
  return { ...c, preparationSteps: c.preparationSteps!.map(s => s.id === id ? { ...s, status, ...(status === "blocked" ? { blockedReason: reason.trim() } : {}) } : s),
    audit: [...c.audit, { at, actor, action: "preparation-step", detail: `${id}: ${status}${reason ? `; ${reason}` : ""}` }] };
}
