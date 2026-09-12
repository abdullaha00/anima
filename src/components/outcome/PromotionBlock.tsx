"use client";

import { useActionState } from "react";
import { promoteDecision, type ActionResult } from "@/app/actions";
import { Button, Notice } from "@/components/ui";

/**
 * The right-hand half of a promotion: the proposed value and the accept button. The action
 * sets the field with the thread message as its source and the accepting clinician as
 * recorded-by. It never signs.
 */
export function PromotionBlock({
  patientId,
  decisionIndex,
  proposedValue,
}: {
  patientId: string;
  decisionIndex: number;
  proposedValue: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, fd: FormData) =>
      promoteDecision(String(fd.get("patientId") ?? ""), Number.parseInt(String(fd.get("decisionIndex") ?? "-1"), 10)),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="decisionIndex" value={decisionIndex} />
      <div className="flex flex-col gap-1">
        <span className="microlabel">Proposed</span>
        <p className="text-[0.9375rem] leading-6">{proposedValue}</p>
      </div>
      {state?.ok === false ? (
        <Notice kind="refuse" role="alert">
          {state.error}
        </Notice>
      ) : null}
      <div>
        <Button type="submit" variant="quiet" disabled={pending}>
          {pending ? "Accepting" : "Accept into the record"}
        </Button>
      </div>
    </form>
  );
}
