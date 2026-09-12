"use client";

import { useActionState } from "react";
import type { Channel } from "@/lib/domain/types";
import { openThread, type ActionResult } from "@/app/actions";
import { Button, Notice } from "@/components/ui";
import { FIELD_CLASS, TEXTAREA_CLASS } from "./form-classes";

/**
 * Opens a coordination thread with a stated purpose. The purpose is required: a thread
 * without one is a group conversation, and that is not what this is. Errors from the
 * action stay on screen next to the form.
 */
export function OpenThreadForm({
  patientId,
  channel,
  defaultPurpose,
  note,
}: {
  patientId: string;
  channel: Channel;
  defaultPurpose: string;
  note?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, fd) => openThread(String(fd.get("patientId") ?? ""), channel, String(fd.get("purpose") ?? "")),
    null,
  );
  const purposeId = `open-thread-purpose-${channel}`;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="channel" value={channel} />
      <label htmlFor={purposeId} className={FIELD_CLASS}>
        <span className="microlabel">Stated purpose, required and shown at the top of the thread</span>
        <textarea
          id={purposeId}
          name="purpose"
          required
          minLength={8}
          rows={3}
          defaultValue={defaultPurpose}
          className={`${TEXTAREA_CLASS} font-voice text-[1.0625rem]`}
        />
      </label>
      {note ? <p className="prose-clinical text-[0.8125rem] leading-5 text-muted">{note}</p> : null}
      {state && !state.ok ? (
        <Notice kind="refuse" title="The thread was not opened" role="alert">
          {state.error}
        </Notice>
      ) : null}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending
            ? "Opening the coordination thread"
            : channel === "family"
              ? "Open the family channel"
              : "Open the coordination thread"}
        </Button>
      </div>
    </form>
  );
}
