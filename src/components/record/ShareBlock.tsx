"use client";

import { useActionState } from "react";
import type { Audience } from "@/lib/domain/types";
import { shareRecord, type ActionResult } from "@/app/actions";
import { AUDIENCES, AUDIENCE_DESCRIPTIONS, AUDIENCE_LABELS } from "@/lib/record/audiences";
import { Button, Notice } from "@/components/ui";
import { CHECK_CLASS } from "@/components/ui/form";

const DEFAULT_ON: Audience[] = ["gp", "out_of_hours", "ambulance", "hospice", "family"];

/** Who receives the signed record. Each audience sees only the fields on its allowlist. */
export function ShareBlock({ patientId, sharedWith }: { patientId: string; sharedWith: Audience[] }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, fd: FormData) =>
      shareRecord(String(fd.get("patientId") ?? ""), fd.getAll("audiences").map(String) as Audience[]),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="patientId" value={patientId} />
      <h3 className="font-display text-[1.25rem] font-medium leading-tight">Share the signed record</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {AUDIENCES.map((a) => {
          const already = sharedWith.includes(a);
          return (
            <li key={a}>
              <label className="flex min-h-11 items-start gap-3 rounded-md border border-line bg-surface px-3 py-2">
                <input
                  type="checkbox"
                  name="audiences"
                  value={a}
                  defaultChecked={already || DEFAULT_ON.includes(a)}
                  className={`${CHECK_CLASS} mt-1`}
                />
                <span className="flex flex-col">
                  <span className="text-[0.9375rem] leading-6">
                    {AUDIENCE_LABELS[a]}
                    {already ? <span className="ml-2 text-[0.8125rem] text-affirm">shared</span> : null}
                  </span>
                  <span className="text-[0.8125rem] leading-5 text-muted">{AUDIENCE_DESCRIPTIONS[a]}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {state?.ok === false ? (
        <Notice kind="refuse" role="alert">
          {state.error}
        </Notice>
      ) : state?.ok && state.message ? (
        <Notice kind="affirm">{state.message}</Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Sharing" : "Share with the chosen recipients"}
        </Button>
        <span className="text-[0.8125rem] text-muted">Each recipient sees only the fields on its allowlist.</span>
      </div>
    </form>
  );
}
