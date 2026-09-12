"use client";

import { useActionState } from "react";
import type { RecordFieldName } from "@/lib/domain/types";
import { setRecordField, type ActionResult } from "@/app/actions";
import { Button, Notice } from "@/components/ui";
import { FIELD_CLASS, HINT_CLASS, SELECT_CLASS, TEXTAREA_CLASS } from "@/components/team/form-classes";

export type FieldEntryKind = "text" | "select" | "segmented";

/**
 * Records one field. Compact, inline under the field, and only shown while the record is
 * unsigned. Where Cairn has a draft, it is prefilled and said so; the clinician edits or
 * confirms it. The source travels unseen: the draft's where there is one, otherwise the
 * action names the conversation with the recording clinician.
 */
export function FieldEntryForm({
  patientId,
  field,
  label,
  kind = "text",
  options = [],
  defaultSource = "",
  defaultValue = "",
  draftNote,
  buttonLabel,
  serif = false,
}: {
  patientId: string;
  field: RecordFieldName;
  label: string;
  kind?: FieldEntryKind;
  options?: readonly string[];
  /** Provenance carried with the entry; empty lets the action apply its default. */
  defaultSource?: string;
  defaultValue?: string;
  /** A faint line under the control saying the prefilled value is Cairn's draft. */
  draftNote?: string;
  buttonLabel?: string;
  serif?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, fd: FormData) =>
      setRecordField(
        String(fd.get("patientId") ?? ""),
        String(fd.get("field") ?? "") as RecordFieldName,
        String(fd.get("value") ?? ""),
        String(fd.get("source") ?? ""),
      ),
    null,
  );

  const submitLabel = buttonLabel ?? (kind === "text" ? "Record" : "Confirm");
  const hasDraft = defaultValue !== "" && (kind === "text" || options.includes(defaultValue));

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="source" value={defaultSource} />

      {kind === "segmented" ? (
        <fieldset>
          <legend className="sr-only">{label}</legend>
          {/* Real radio inputs, drawn as a segmented row of quiet pills. The checked one takes the primary tint. */}
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <label
                key={o}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line-strong bg-surface px-4 text-[13px] font-semibold leading-none text-ink shadow-xs transition-colors duration-150 hover:bg-surface-2 has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary-hover has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
              >
                <input type="radio" name="value" value={o} required defaultChecked={o === defaultValue} className="sr-only" />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
      ) : kind === "select" ? (
        <label className={FIELD_CLASS}>
          <span className="sr-only">{label}</span>
          <select id={`record-${field}`} name="value" required className={SELECT_CLASS} defaultValue={hasDraft ? defaultValue : ""}>
            <option value="" disabled>
              choose
            </option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className={FIELD_CLASS}>
          <span className="sr-only">{label}</span>
          {/* The field inherits its size from the wrapper: the person's fields are set in the voice face at 17px. */}
          <div className={serif ? "text-[17px]" : ""}>
            <textarea
              id={`record-${field}`}
              name="value"
              required
              rows={hasDraft ? 4 : 3}
              defaultValue={defaultValue}
              className={`${TEXTAREA_CLASS} ${serif ? "font-voice" : ""}`}
              placeholder={serif ? "Their words, as they said them." : "As recorded, in plain words."}
            />
          </div>
        </label>
      )}

      {draftNote ? <p className={HINT_CLASS}>{draftNote}</p> : null}

      <div>
        <Button type="submit" variant="quiet" disabled={pending}>
          {pending ? "Recording" : submitLabel}
        </Button>
      </div>
      {state?.ok === false ? (
        <Notice kind="refuse" role="alert">
          {state.error}
        </Notice>
      ) : null}
    </form>
  );
}
