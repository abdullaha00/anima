"use client";
import { useActionState } from "react";
import Link from "next/link";
import type { Participant, NextStep } from "@/lib/domain/types";
import type { ScreeningDecision } from "@/lib/stage1/clinical-review";
import { saveClinicalReview, updatePreparation } from "@/app/screening/actions";
const field = "block w-full rounded border p-2 font-normal";
export function ClinicalReview({ screeningId, patientId, participants, previous, step, enabled }: { screeningId: string; patientId: string; participants: Participant[]; previous?: ScreeningDecision; step?: NextStep; enabled: boolean }) {
  const [state, action, pending] = useActionState(saveClinicalReview, { message: "" });
  const owners = participants.filter(p => p.channel === "professional" && !p.recipientOnly && p.status !== "declined");
  return <section className="space-y-3 rounded border p-5">
    <h2 className="text-xl font-semibold">Clinician decision and preparation</h2>
    <p>Check the cited evidence and patient wishes, then accept, amend or dismiss the proposal. Confirm who owns the next preparation action.</p>
    <Link href={`/patient/${patientId}/record#team`} className="underline">Open the care team and patient workspace</Link>
    {previous && <p>Saved: {previous.decision} by {previous.actor}, revision {previous.revision}. {previous.reason}</p>}
    {!owners.length && <p>Assemble the care team or add a named professional in the patient workspace before accepting a preparation action. You can still dismiss this review.</p>}
    <form action={action} className="space-y-3" key={previous?.revision ?? 0}>
      <input type="hidden" name="screeningId" value={screeningId} /><input type="hidden" name="revision" value={previous?.revision ?? 0} />
      <label className="block font-semibold">Decision<select name="decision" defaultValue={previous ? "amended" : "accepted"} className={field}><option value="accepted">Accept for clinician-led preparation</option><option value="amended">Amend the proposal</option><option value="dismissed">Dismiss this review signal</option></select></label>
      <label className="block font-semibold">Clinical reason<textarea name="reason" required maxLength={2000} defaultValue={previous?.reason} className={field} /></label>
      <label className="block font-semibold">Confirmed professional owner<select name="ownerId" defaultValue={step?.ownerId ?? ""} className={field}><option value="">Choose a named owner (required unless dismissing)</option>{owners.map(p => <option key={p.id} value={p.id}>{p.name} · {p.roleLabel ?? p.role}{p.simulated ? " (simulated colleague)" : ""}</option>)}</select></label>
      <label className="block font-semibold">Preparation action<textarea name="what" maxLength={2000} defaultValue={step?.what ?? "Review the cited evidence and clarify the patient's priorities before proposing a goals-of-care conversation."} className={field} /></label>
      <label className="block font-semibold">Due date<input type="date" name="due" defaultValue={step?.due} className={field} /></label>
      <button disabled={!enabled || pending} className="rounded border px-4 py-2 font-semibold disabled:opacity-50">{pending ? "Saving…" : "Save clinician decision"}</button>
      {!enabled && <p>Local demo actions are disabled.</p>}
      <p className="text-sm">This records a preparation action in Cairn. It does not book a meeting, send a message or record that a discussion has happened.</p>
      <p role="status">{state.message}</p>
    </form>
  </section>;
}
export function PreparationStatus({ patientId, step, enabled }: { patientId: string; step: NextStep; enabled: boolean }) {
  const [state, action, pending] = useActionState(updatePreparation, { message: "" });
  return <form action={action} className="mt-3 space-y-2"><input type="hidden" name="patientId" value={patientId} /><input type="hidden" name="stepId" value={step.id} />
    <label className="block">Action status<select name="status" className={field}><option value="done">Completed by the clinician</option><option value="blocked">Blocked</option></select></label>
    <label className="block">Note (required if blocked)<input name="reason" maxLength={2000} className={field} /></label>
    <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={!enabled || pending}>Save action status</button><p role="status">{state.message}</p>
  </form>;
}
