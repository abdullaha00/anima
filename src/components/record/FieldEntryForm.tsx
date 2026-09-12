"use client";

import { useActionState } from "react";
import type { RecordFieldName } from "@/lib/domain/types";
import { setRecordField, type ActionResult } from "@/app/actions";
import { Button, Notice } from "@/components/ui";
import { FIELD_CLASS, INPUT_CLASS, LABEL_CLASS, TEXTAREA_CLASS } from "@/components/team/form-classes";

/**
 * Records one field with its source. Compact, inline under the empty field, and only shown
 * while the record is a draft. The source defaults to a conversation with the signed-in
 * clinician and stays editable, because provenance is what makes the entry count.
 */
export function FieldEntryForm({
  patientId,
  field,
  label,
  defaultSource,
  defaultValue = "",
  serif = false,
}: {
  patientId: string;
  field: RecordFieldName;
  label: string;
  defaultSource: string;
  defaultValue?: string;
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

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="field" value={field} />
      <label className={FIELD_CLASS}>
        <span className="sr-only">{label}</span>
        {/* The field inherits its size from the wrapper: the person's fields are set in the voice face at 17px. */}
        <div className={serif ? "text-[17px]" : ""}>
          <textarea
            id={`record-${field}`}
            name="value"
            required
            rows={3}
            defaultValue={defaultValue}
            className={`${TEXTAREA_CLASS} ${serif ? "font-voice" : ""}`}
            placeholder={serif ? "Their words, as they said them." : "As recorded, in plain words."}
          />
        </div>
      </label>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>Source</span>
          <div className="font-mono text-[13px]">
            <input
              id={`record-${field}-source`}
              name="source"
              required
              defaultValue={defaultSource}
              placeholder="e.g. conversation 12 Sept 2026, home visit"
              className={INPUT_CLASS}
            />
          </div>
        </label>
        <Button type="submit" variant="quiet" disabled={pending}>
          {pending ? "Recording" : "Record"}
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
