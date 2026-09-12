"use client";

import { useActionState } from "react";
import type { Channel, ParticipantRole } from "@/lib/domain/types";
import { addParticipant, type ActionResult } from "@/app/actions";
import { Button, Notice } from "@/components/ui";
import { CHECK_CLASS, FIELD_CLASS, INPUT_CLASS, LABEL_CLASS, SELECT_CLASS, TEXTAREA_CLASS } from "./form-classes";
import { PARTICIPANT_ROLES } from "./roles";

/** A clinician adds a participant. The reason is required, like every other row on the list. */
export function AddParticipantForm({ patientId }: { patientId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, fd) =>
      addParticipant(String(fd.get("patientId") ?? ""), {
        name: String(fd.get("name") ?? ""),
        role: String(fd.get("role") ?? "") as ParticipantRole,
        roleLabel: String(fd.get("roleLabel") ?? "") || undefined,
        organisation: String(fd.get("organisation") ?? ""),
        reasonForInclusion: String(fd.get("reasonForInclusion") ?? ""),
        evidence: String(fd.get("evidence") ?? "") || undefined,
        channel: String(fd.get("channel") ?? "professional") as Channel,
        required: fd.get("required") === "on",
      }),
    null,
  );

  return (
    <details className="mt-5 border-t border-line pt-3">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-[14px] font-semibold text-primary-hover underline-offset-4 hover:underline">
        Add a participant
      </summary>
      <form action={formAction} className="flex flex-col gap-4 pb-2 pt-3">
        <input type="hidden" name="patientId" value={patientId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>Name</span>
            <input name="name" required className={INPUT_CLASS} autoComplete="off" />
          </label>
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>Role</span>
            <select name="role" required defaultValue="specialist nurse" className={SELECT_CLASS}>
              {PARTICIPANT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>Role label, optional</span>
            <input name="roleLabel" className={INPUT_CLASS} placeholder="e.g. Heart failure specialist nurse" />
          </label>
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>Organisation</span>
            <input name="organisation" required className={INPUT_CLASS} />
          </label>
        </div>
        <label className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>Reason for inclusion, required</span>
          <textarea
            name="reasonForInclusion"
            required
            minLength={4}
            rows={2}
            className={TEXTAREA_CLASS}
            placeholder="One sentence a colleague can check against the record"
          />
        </label>
        <label className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>Evidence, optional</span>
          <input name="evidence" className={INPUT_CLASS} placeholder="The record entry or indicator behind the reason" />
        </label>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <label className={`${FIELD_CLASS} w-48`}>
            <span className={LABEL_CLASS}>Channel</span>
            <select name="channel" defaultValue="professional" className={SELECT_CLASS}>
              <option value="professional">professional</option>
              <option value="family">family</option>
            </select>
          </label>
          <label className="inline-flex min-h-11 items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" name="required" className={CHECK_CLASS} />
            Required for the decision
          </label>
        </div>
        {state && !state.ok ? (
          <Notice kind="refuse" title="Not added" role="alert">
            {state.error}
          </Notice>
        ) : state?.ok && state.message ? (
          <Notice kind="affirm">{state.message}</Notice>
        ) : null}
        <div>
          <Button type="submit" variant="quiet" disabled={pending}>
            {pending ? "Adding" : "Add to the participants"}
          </Button>
        </div>
      </form>
    </details>
  );
}
