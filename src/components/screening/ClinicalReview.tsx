"use client";
import { useActionState } from "react";
import Link from "next/link";
import type { Participant, NextStep } from "@/lib/domain/types";
import type { ScreeningDecision } from "@/lib/stage1/clinical-review";
import { saveClinicalReview, updatePreparation } from "@/app/screening/actions";
import { Button } from "@/components/ui/Button";
import { FIELD_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS, SELECT_CLASS, TEXTAREA_CLASS } from "@/components/team/form-classes";

const DEFAULT_ACTION = "Review the cited evidence and clarify the patient's priorities before proposing a goals-of-care conversation.";

/**
 * The clinician's decision on a linked record review: accept, amend or dismiss, with a
 * named owner, the preparation action and its due date. Composes inside a panel as a
 * bordered section. The server action keeps every provenance and revision check.
 */
export function ClinicalReview({ screeningId, patientId, participants, previous, step, enabled }: { screeningId: string; patientId: string; participants: Participant[]; previous?: ScreeningDecision; step?: NextStep; enabled: boolean }) {
  const [state, action, pending] = useActionState(saveClinicalReview, { message: "" });
  const owners = participants.filter(p => p.channel === "professional" && !p.recipientOnly && p.status !== "declined");
  return (
    <section aria-labelledby="clinician-decision" className="border-t border-line pt-5">
      <h3 id="clinician-decision" className="text-[15px] font-semibold leading-6 tracking-[-0.01em] text-ink">Clinician decision</h3>
      <p className="mt-1 max-w-[65ch] text-[14px] leading-6 text-secondary">
        Check the cited evidence and the patient&rsquo;s wishes, then accept, amend or dismiss the proposal and confirm who owns the next preparation action.
      </p>
      <p className="mt-2 text-[13px]">
        <Link href={`/patient/${patientId}/record#team`} className="font-semibold text-primary-hover hover:underline">
          Open the care team
        </Link>
      </p>
      {previous ? (
        <p className="mt-3 rounded-md border border-line bg-surface-2 px-3.5 py-2.5 text-[13px] leading-5 text-secondary">
          Saved: {previous.decision} by {previous.actor}, revision {previous.revision}. {previous.reason}
        </p>
      ) : null}
      {!owners.length ? (
        <p className="mt-3 text-[13px] leading-5 text-secondary">
          Assemble the care team or add a named professional before accepting a preparation action. You can still dismiss this review.
        </p>
      ) : null}
      <form action={action} className="mt-4 flex flex-col gap-4" key={previous?.revision ?? 0}>
        <input type="hidden" name="screeningId" value={screeningId} />
        <input type="hidden" name="revision" value={previous?.revision ?? 0} />
        <div className={FIELD_CLASS}>
          <label htmlFor="screening-decision" className={LABEL_CLASS}>Decision</label>
          <select id="screening-decision" name="decision" defaultValue={previous ? "amended" : "accepted"} className={SELECT_CLASS}>
            <option value="accepted">Accept for clinician-led preparation</option>
            <option value="amended">Amend the proposal</option>
            <option value="dismissed">Dismiss this review</option>
          </select>
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="screening-reason" className={LABEL_CLASS}>Clinical reason</label>
          <textarea id="screening-reason" name="reason" required maxLength={2000} rows={3} defaultValue={previous?.reason} className={TEXTAREA_CLASS} />
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className={FIELD_CLASS}>
            <label htmlFor="screening-owner" className={LABEL_CLASS}>Named owner</label>
            <select id="screening-owner" name="ownerId" defaultValue={step?.ownerId ?? ""} className={SELECT_CLASS}>
              <option value="">Choose a named professional</option>
              {owners.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.roleLabel ?? p.role}{p.simulated ? " (simulated colleague)" : ""}
                </option>
              ))}
            </select>
            <p className={HINT_CLASS}>Required unless dismissing.</p>
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="screening-due" className={LABEL_CLASS}>Due date</label>
            <input id="screening-due" type="date" name="due" defaultValue={step?.due} className={INPUT_CLASS} />
          </div>
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="screening-what" className={LABEL_CLASS}>Preparation action</label>
          <textarea id="screening-what" name="what" maxLength={2000} rows={2} defaultValue={step?.what ?? DEFAULT_ACTION} className={TEXTAREA_CLASS} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" variant="primary" disabled={!enabled || pending}>
            {pending ? "Saving…" : "Save clinician decision"}
          </Button>
          {!enabled ? <span className={HINT_CLASS}>Local demo actions are disabled.</span> : null}
        </div>
        <p className={HINT_CLASS}>
          This records a preparation action in Cairn. It does not book a meeting, send anything or record that a discussion has happened.
        </p>
        <p role="status" className="text-[13px] leading-5 text-secondary">{state.message}</p>
      </form>
    </section>
  );
}

/** Marks an open preparation action completed or blocked. Rendered under each action on the record page. */
export function PreparationStatus({ patientId, step, enabled }: { patientId: string; step: NextStep; enabled: boolean }) {
  const [state, action, pending] = useActionState(updatePreparation, { message: "" });
  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="stepId" value={step.id} />
      <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div className={FIELD_CLASS}>
          <label htmlFor={`status-${step.id}`} className={LABEL_CLASS}>Action status</label>
          <select id={`status-${step.id}`} name="status" className={SELECT_CLASS}>
            <option value="done">Completed by the clinician</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor={`note-${step.id}`} className={LABEL_CLASS}>Note</label>
          <input id={`note-${step.id}`} name="reason" maxLength={2000} className={INPUT_CLASS} />
          <p className={HINT_CLASS}>Required if blocked.</p>
        </div>
      </div>
      <div>
        <Button type="submit" variant="quiet" disabled={!enabled || pending}>Save action status</Button>
      </div>
      <p role="status" className="text-[13px] leading-5 text-secondary">{state.message}</p>
    </form>
  );
}
