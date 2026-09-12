"use client";

import { useActionState } from "react";
import { attemptCairnSignature, signRecord, type ActionResult } from "@/app/actions";
import { formatDate } from "@/lib/format";
import { Button, Microlabel, Notice } from "@/components/ui";
import { CHECK_CLASS, FIELD_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from "@/components/team/form-classes";

/**
 * The signature gate. Two paths side by side, and the contrast is the point: Cairn asks to
 * sign and is refused, calmly and in place; a named clinician signs in the ordinary way.
 * The refusal stays on screen. It is a design decision, not an error.
 */
export function SignGate({
  patientId,
  clinicianName,
  gmc,
  today,
  defaultNextReview,
  refusedBefore,
}: {
  patientId: string;
  clinicianName: string;
  gmc: string;
  /** The simulation date, ISO yyyy-mm-dd. Read-only on the form. */
  today: string;
  /** ISO yyyy-mm-dd, six months from today. */
  defaultNextReview: string;
  /** The reason Cairn was refused earlier, from the audit, so the refusal survives a reload. */
  refusedBefore?: string;
}) {
  const [cairn, cairnAction, cairnPending] = useActionState(
    async (_prev: ActionResult | null, fd: FormData) => attemptCairnSignature(String(fd.get("patientId") ?? "")),
    null,
  );
  const [signed, signAction, signPending] = useActionState(
    async (_prev: ActionResult | null, fd: FormData) =>
      signRecord(String(fd.get("patientId") ?? ""), String(fd.get("clinicianName") ?? ""), {
        gmc: String(fd.get("gmc") ?? ""),
        signature: String(fd.get("signature") ?? ""),
        nextReviewAt: String(fd.get("nextReviewAt") ?? ""),
      }),
    null,
  );

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-10">
      {/* Cairn's path: refused. */}
      <form action={cairnAction} className="flex flex-col gap-3 border-b border-line pb-6 md:border-b-0 md:border-r md:pb-0 md:pr-10">
        <input type="hidden" name="patientId" value={patientId} />
        <Microlabel>Cairn</Microlabel>
        <p className="text-[15px] leading-6 text-secondary">
          Cairn drafted this record from the patient record and the review. It cannot sign it.
        </p>
        <div>
          <Button type="submit" variant="quiet" disabled={cairnPending}>
            Cairn: sign record
          </Button>
        </div>
        {cairn?.ok === false || refusedBefore ? (
          <Notice kind="refuse" role="status" title="Cairn cannot sign this record" className="mt-1">
            <p className="text-ink">{cairn?.ok === false ? cairn.error : refusedBefore}</p>
            <p className="text-[13px] font-medium text-secondary">Signing requires a named clinician.</p>
          </Notice>
        ) : null}
      </form>

      {/* The clinician's path: ordinary and easy. */}
      <form action={signAction} className="flex flex-col gap-4">
        <input type="hidden" name="patientId" value={patientId} />
        <Microlabel>Clinician</Microlabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>Clinician name</span>
            <input id="clinician-name" name="clinicianName" required defaultValue={clinicianName} autoComplete="name" className={INPUT_CLASS} />
          </label>
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>GMC number</span>
            <div className="font-mono text-[13px]">
              <input id="clinician-gmc" name="gmc" required defaultValue={gmc} inputMode="numeric" className={INPUT_CLASS} />
            </div>
          </label>
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>Date</span>
            <input id="sign-date" name="date" readOnly value={formatDate(today)} className={`${INPUT_CLASS} bg-surface-2 text-secondary`} />
          </label>
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>Next review date</span>
            <input id="next-review" type="date" name="nextReviewAt" required defaultValue={defaultNextReview} min={today} className={INPUT_CLASS} />
            <span className={HINT_CLASS}>Six months by default. Sooner if the picture is changing.</span>
          </label>
        </div>
        <label className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>Signature</span>
          <div className="font-voice text-[17px]">
            <input id="clinician-signature" name="signature" required placeholder="Type your name to sign" autoComplete="off" className={INPUT_CLASS} />
          </div>
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
  );
}
