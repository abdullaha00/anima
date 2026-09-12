import type { CaseState } from "@/lib/domain/types";
import { assembleTeamForm, pauseCaseForm, resumeCaseForm } from "@/app/actions";
import { nextActionFor } from "@/lib/coordination/state";
import { Button, ButtonLink, Notice, Panel } from "@/components/ui";

/** The one next action for this case, and the pause affordance with its required reason. */
export function CaseActions({ caseState, patientId }: { caseState: CaseState; patientId: string }) {
  const next = nextActionFor(caseState.state);
  return (
    <Panel title="Next action" tone="brand">
      <div className="flex flex-col gap-3">
        {caseState.state === "paused" ? (
          <>
            <Notice kind="quiet" title="Paused">
              {caseState.pausedReason}
            </Notice>
            <form action={resumeCaseForm}>
              <input type="hidden" name="patientId" value={patientId} />
              <Button type="submit" variant="quiet">
                Resume
              </Button>
            </form>
          </>
        ) : caseState.state === "flagged" ? (
          <form action={assembleTeamForm} className="flex flex-col gap-2.5">
            <input type="hidden" name="patientId" value={patientId} />
            <Button type="submit" variant="primary" className="w-full">
              Assemble the team
            </Button>
          </form>
        ) : (
          <ButtonLink href={`/patient/${patientId}${next.path}`} variant="primary" className="w-full">
            {next.label}
          </ButtonLink>
        )}

        {caseState.state !== "paused" && caseState.state !== "shared" ? (
          <details className="border-t border-line pt-2 text-[13px]">
            <summary className="min-h-11 cursor-pointer list-none py-2 font-medium text-muted hover:text-ink">
              Not yet: pause with a reason
            </summary>
            <form action={pauseCaseForm} className="flex flex-col gap-2.5 pt-1">
              <input type="hidden" name="patientId" value={patientId} />
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-ink">Reason</span>
                <span className="text-[12px] text-faint">Required, and shown on the worklist.</span>
                <input
                  id="pause-reason"
                  name="reason"
                  required
                  minLength={4}
                  className="field"
                  placeholder="e.g. patient asked to revisit after the cardiology review"
                />
              </label>
              <Button type="submit" variant="quiet">
                Pause
              </Button>
            </form>
          </details>
        ) : null}
      </div>
    </Panel>
  );
}
