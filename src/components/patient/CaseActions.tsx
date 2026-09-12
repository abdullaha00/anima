import type { CaseState } from "@/lib/domain/types";
import { assembleTeamForm, pauseCaseForm, resumeCaseForm } from "@/app/actions";
import { nextActionFor } from "@/lib/coordination/state";
import { Button, ButtonLink, Notice, Panel } from "@/components/ui";

/** The one next action for this case, and the pause affordance with its required reason. */
export function CaseActions({ caseState, patientId }: { caseState: CaseState; patientId: string }) {
  const next = nextActionFor(caseState.state);
  return (
    <Panel title="Next action">
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
          <form action={assembleTeamForm} className="flex flex-col gap-2">
            <input type="hidden" name="patientId" value={patientId} />
            <Button type="submit" variant="primary">
              Assemble the team
            </Button>
            <p className="text-[0.8125rem] leading-5 text-muted">
              Cairn proposes who needs to be involved, each with a reason traced to the record. You add and remove.
            </p>
          </form>
        ) : (
          <ButtonLink href={`/patient/${patientId}${next.path}`} variant="primary">
            {next.label}
          </ButtonLink>
        )}

        {caseState.state !== "paused" && caseState.state !== "shared" ? (
          <details className="text-[0.875rem]">
            <summary className="min-h-11 cursor-pointer list-none py-2 text-muted hover:text-ink">
              Not yet: pause with a reason
            </summary>
            <form action={pauseCaseForm} className="flex flex-col gap-2 pt-1">
              <input type="hidden" name="patientId" value={patientId} />
              <label className="flex flex-col gap-1">
                <span className="microlabel">Reason, required and shown on the worklist</span>
                <input
                  id="pause-reason"
                  name="reason"
                  required
                  minLength={4}
                  className="min-h-11 rounded-sm border border-line bg-surface px-2.5 text-ink"
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
