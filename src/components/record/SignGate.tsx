"use client";

import { useActionState } from "react";
import { attemptCairnSignature, signRecord, type ActionResult } from "@/app/actions";
import { Button, Notice, Panel } from "@/components/ui";
import { CHECK_CLASS, FIELD_CLASS, INPUT_CLASS, LABEL_CLASS } from "@/components/team/form-classes";

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
    <Panel as="div">
      <section aria-labelledby="sign-heading">
        <h3
          id="sign-heading"
          className="mb-6 border-b border-line pb-4 text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink"
        >
          Signature
        </h3>
        <div className="grid gap-8 md:grid-cols-2 md:gap-10">
          {/* Cairn's path: refused. */}
          <form action={cairnAction} className="flex flex-col gap-3 md:border-r md:border-line md:pr-10">
            <input type="hidden" name="patientId" value={patientId} />
            <span className="microlabel">Cairn</span>
            <p className="text-[15px] leading-6 text-secondary">
              Cairn assembled this draft from the conversation and the coordination thread.
            </p>
            <div>
              <Button type="submit" variant="quiet" disabled={cairnPending}>
                Cairn: sign record
              </Button>
            </div>
            {cairn?.ok === false ? (
              <Notice kind="refuse" role="status" title="Cairn cannot sign this record" className="mt-1">
                <p className="text-ink">{cairn.error}</p>
                <p className="text-[13px] font-medium text-secondary">Signing requires a named clinician.</p>
              </Notice>
            ) : null}
          </form>

          {/* The clinician's path: ordinary and easy. */}
          <form action={signAction} className="flex flex-col gap-4">
            <input type="hidden" name="patientId" value={patientId} />
            <span className="microlabel">Clinician signature</span>
            <label className={FIELD_CLASS}>
              <span className={LABEL_CLASS}>Named clinician</span>
              <input
                id="clinician-name"
                name="clinicianName"
                required
                defaultValue={clinicianName}
                autoComplete="name"
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-6 text-ink">
              <input id="sign-confirm" type="checkbox" name="confirm" required className={`${CHECK_CLASS} mt-1`} />
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
    </Panel>
  );
}
