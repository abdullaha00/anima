"use client";

import { useActionState } from "react";
import { requestRecordReview, type ActionResult } from "@/app/actions";
import { Button } from "@/components/ui";

/**
 * Asks for a Stage 2 record review. The action only queues a job: the worker
 * (`npm run stage2:worker`) must be running, and it needs a model key in .env.local,
 * for the review to land. The result is read on the next load of this screen.
 */
export function RequestReview({ patientId, hasReview }: { patientId: string; hasReview: boolean }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, fd: FormData) => requestRecordReview(String(fd.get("patientId") ?? "")),
    null,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <input type="hidden" name="patientId" value={patientId} />
      <Button type="submit" variant="quiet" disabled={pending}>
        {pending ? "Queueing" : hasReview ? "Run again" : "Request a record review"}
      </Button>
      {state?.ok === false ? (
        <span role="alert" className="text-[13px] font-medium text-refuse">
          {state.error}
        </span>
      ) : state?.ok && state.message ? (
        <span role="status" className="text-[13px] font-medium text-secondary">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
