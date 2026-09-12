"use client";

import { useActionState } from "react";
import type { Audience } from "@/lib/domain/types";
import { shareRecord, type ActionResult } from "@/app/actions";
import { AUDIENCES, AUDIENCE_DESCRIPTIONS, AUDIENCE_LABELS } from "@/lib/record/audiences";
import { Button, Chip, Notice, Panel } from "@/components/ui";
import { CHECK_CLASS } from "@/components/team/form-classes";

const DEFAULT_ON: Audience[] = ["gp", "out_of_hours", "ambulance", "hospice", "family"];

/** Who receives the signed record. Each audience sees only the fields on its allowlist. */
export function ShareBlock({ patientId, sharedWith }: { patientId: string; sharedWith: Audience[] }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, fd: FormData) =>
      shareRecord(String(fd.get("patientId") ?? ""), fd.getAll("audiences").map(String) as Audience[]),
    null,
  );

  return (
    <Panel as="div">
      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="patientId" value={patientId} />
        <h3 className="border-b border-line pb-4 text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          Share the signed record
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {AUDIENCES.map((a) => {
            const already = sharedWith.includes(a);
            return (
              <li key={a}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 hover:bg-surface-2 has-checked:bg-surface-2">
                  <input
                    type="checkbox"
                    name="audiences"
                    value={a}
                    defaultChecked={already || DEFAULT_ON.includes(a)}
                    className={`${CHECK_CLASS} mt-1`}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2 text-[15px] leading-6 text-ink">
                      {AUDIENCE_LABELS[a]}
                      {already ? <Chip className="border-affirm-border bg-affirm-soft text-affirm">shared</Chip> : null}
                    </span>
                    <span className="text-[13px] font-medium leading-5 text-secondary">{AUDIENCE_DESCRIPTIONS[a]}</span>
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
        <div className="flex flex-wrap items-center gap-4 border-t border-line pt-5">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Sharing" : "Share with the chosen recipients"}
          </Button>
          <span className="text-[13px] font-medium text-secondary">Each recipient sees only the fields on its allowlist.</span>
        </div>
      </form>
    </Panel>
  );
}
