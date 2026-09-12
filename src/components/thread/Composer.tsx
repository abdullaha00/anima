"use client";

import { useActionState, useState } from "react";
import type { Channel, MessageKind, RecordFieldName } from "@/lib/domain/types";
import { postMessage, type ActionResult } from "@/app/actions";
import { Button, Notice } from "@/components/ui";
import { FIELD_CLASS, INPUT_CLASS, SELECT_CLASS, TEXTAREA_CLASS } from "@/components/team/form-classes";

export interface ProposalOption {
  id: string;
  label: string;
}

export interface FieldOption {
  name: RecordFieldName;
  label: string;
}

type ComposerKind = Exclude<MessageKind, "system">;

const KIND_LABEL: Record<ComposerKind, string> = {
  message: "message",
  proposal: "proposal for the record",
  agreement: "agreement",
  concern: "concern",
  action: "action",
};

/**
 * Adds a contribution to the coordination thread. Structured kinds are the point: a
 * proposal names a record field and a value, an agreement or concern attaches to a
 * proposal. On the family channel the guard's refusal is shown here, in place, calmly.
 */
export function Composer({
  patientId,
  threadId,
  channel,
  proposals,
  fields,
  allowedTopics,
}: {
  patientId: string;
  threadId: string;
  channel: Channel;
  proposals: ProposalOption[];
  fields: FieldOption[];
  allowedTopics: string[];
}) {
  const family = channel === "family";
  const kinds: ComposerKind[] = family
    ? ["message", "agreement", "concern"]
    : ["message", "proposal", "agreement", "concern", "action"];
  const [kind, setKind] = useState<ComposerKind>("message");
  const needsReply = kind === "agreement" || kind === "concern";

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, fd) =>
      postMessage(String(fd.get("patientId") ?? ""), String(fd.get("threadId") ?? ""), {
        kind: String(fd.get("kind") ?? "message") as MessageKind,
        body: String(fd.get("body") ?? ""),
        proposesField: (String(fd.get("proposesField") ?? "") || undefined) as RecordFieldName | undefined,
        proposesValue: String(fd.get("proposesValue") ?? "") || undefined,
        inReplyTo: String(fd.get("inReplyTo") ?? "") || undefined,
      }),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-label="Add to the coordination thread">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="threadId" value={threadId} />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="microlabel mb-1.5">Kind of entry</legend>
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => {
            const disabled = (k === "agreement" || k === "concern") && proposals.length === 0;
            return (
              <label
                key={k}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-[0.9375rem] has-checked:border-primary has-checked:bg-primary-soft ${
                  disabled ? "cursor-not-allowed border-line text-muted opacity-60" : "border-line text-ink"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  disabled={disabled}
                  onChange={() => setKind(k)}
                  className="accent-primary"
                />
                {KIND_LABEL[k]}
              </label>
            );
          })}
        </div>
        {proposals.length === 0 ? (
          <p className="text-[0.8125rem] text-muted">Agreement and concern attach to a proposal; none is in this thread yet.</p>
        ) : null}
      </fieldset>

      {kind === "proposal" ? (
        <div className="grid gap-3 rounded-md border-l-2 border-primary pl-4 sm:grid-cols-2">
          <label className={FIELD_CLASS}>
            <span className="microlabel">Record field</span>
            <select name="proposesField" required className={SELECT_CLASS} defaultValue="">
              <option value="" disabled>
                choose a field
              </option>
              {fields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className={FIELD_CLASS}>
            <span className="microlabel">Proposed value</span>
            <input name="proposesValue" required className={INPUT_CLASS} placeholder="e.g. Home" />
          </label>
          <p className="text-[0.8125rem] leading-5 text-muted sm:col-span-2">
            A proposal is not the record. A clinician promotes it from the outcome screen, then signs.
          </p>
        </div>
      ) : null}

      {needsReply ? (
        <label className={FIELD_CLASS}>
          <span className="microlabel">In reply to</span>
          <select name="inReplyTo" required className={SELECT_CLASS} defaultValue="">
            <option value="" disabled>
              choose a proposal
            </option>
            {proposals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className={FIELD_CLASS}>
        <span className="microlabel">
          {kind === "proposal" ? "Why you propose it" : kind === "concern" ? "The concern" : "Entry"}
        </span>
        <textarea name="body" required minLength={2} rows={4} className={TEXTAREA_CLASS} />
      </label>

      {family ? (
        <div className="flex flex-col gap-3 border-t border-dashed border-line pt-3">
          <div>
            <p className="microlabel mb-1">This channel carries only</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.875rem] text-muted">
              {allowedTopics.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <label className="inline-flex min-h-11 items-start gap-2 text-[0.9375rem] leading-6">
            <input type="checkbox" name="approved" required className="mt-1.5 h-4 w-4 shrink-0 accent-primary" />
            <span>I am writing or approving this entry as the clinician</span>
          </label>
        </div>
      ) : null}

      {state && !state.ok ? (
        <Notice kind="refuse" title={family ? "Not added to the family channel" : "Not added to the thread"} role="alert">
          <p className="prose-clinical">{state.error}</p>
          {family ? (
            <p className="mt-1 text-[0.875rem] text-muted">
              Clinical recommendations stay with the professional participants. Reword the entry to what matters, place
              preferences, who is involved, practical arrangements or a question.
            </p>
          ) : null}
        </Notice>
      ) : null}

      <div className="flex items-center gap-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Adding to the thread" : "Add to the thread"}
        </Button>
        {family ? (
          <span className="text-[0.8125rem] text-muted">Every family entry is written or approved by a clinician.</span>
        ) : null}
      </div>
    </form>
  );
}
