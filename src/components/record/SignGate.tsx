"use client";

import { useActionState } from "react";
import { attemptCairnSignature, signRecord, type ActionResult } from "@/app/actions";
import { Button, Notice } from "@/components/ui";
import { CHECK_CLASS, INPUT_CLASS } from "@/components/ui/form";

/**
 * The signature gate. Two paths side by side, and the contrast is the point: Cairn asks to
 * sign and is refused, calmly and in place; a named clinician signs in the ordinary way.
 * The refusal stays on screen. It is a design decision, not an error.
 */
export function SignGate({ patientId, clinicianName }: { patientId: string; clinicianName: string }) {
  const [cairn, cairnAction, cairnPending] = useActionState(
    async (_prev: ActionResult | null, fd: FormData) => attemptCairnSignature(String(fd.get("patientId") ?? "")),
    null,
  );
  const [signed, signAction, signPending] = useActionState(
    async (_prev: ActionResult | null, fd: FormData) =>
      signRecord(String(fd.get("patientId") ?? ""), String(fd.get("clinicianName") ?? "")),
    null,
  );

  return (
    <section aria-labelledby="sign-heading" className="flex flex-col gap-4">
      <h3 id="sign-heading" className="font-display text-[1.25rem] font-medium leading-tight">
        Signature
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Cairn's path: refused. */}
        <form action={cairnAction} className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-5">
          <input type="hidden" name="patientId" value={patientId} />
          <span className="microlabel">Cairn</span>
          <p className="text-[0.9375rem] leading-6 text-muted">
            Cairn assembled this draft from the conversation and the coordination thread.
          </p>
          <div>
            <Button type="submit" variant="quiet" disabled={cairnPending}>
              Cairn: sign record
            </Button>
          </div>
          {cairn?.ok === false ? (
            <div
              role="status"
              className="mt-1 flex flex-col gap-1 border-l-2 border-refuse py-1 pl-4 text-[0.9375rem] leading-6"
            >
              <p className="font-medium text-refuse">Cairn cannot sign this record</p>
              <p className="text-ink">{cairn.error}</p>
              <p className="text-muted">Signing requires a named clinician.</p>
            </div>
          ) : null}
        </form>

        {/* The clinician's path: ordinary and easy. */}
        <form action={signAction} className="flex flex-col gap-3 rounded-md border border-line bg-surface p-5">
          <input type="hidden" name="patientId" value={patientId} />
          <span className="microlabel">Clinician signature</span>
          <label className="flex flex-col gap-1">
            <span className="text-[0.8125rem] text-muted">Named clinician</span>
            <input
              id="clinician-name"
              name="clinicianName"
              required
              defaultValue={clinicianName}
              autoComplete="name"
              className={INPUT_CLASS}
            />
          </label>
          <label className="flex items-start gap-3 text-[0.875rem] leading-5">
            <input id="sign-confirm" type="checkbox" name="confirm" required className={`${CHECK_CLASS} mt-0.5`} />
            <span>
              I confirm these are recommendations made with the person or their representative, not legally binding and
              not a DNACPR form.
            </span>
          </label>
          <div>
            <Button type="submit" variant="primary" disabled={signPending}>
              {signPending ? "Signing" : "Sign as a named clinician"}
            </Button>
          </div>
          {signed?.ok === false ? (
            <Notice kind="refuse" role="alert" title="Not signed">
              {signed.error}
            </Notice>
          ) : null}
        </form>
      </div>
    </section>
  );
}
