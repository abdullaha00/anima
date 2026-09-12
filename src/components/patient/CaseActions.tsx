import type { CaseState } from "@/lib/domain/types";
import { ButtonLink, Notice, Panel } from "@/components/ui";

/**
 * The one next action for this case. The whole path, from the care team to the signed
 * and shared record, lives on the record page, so this is a single door into it.
 */
export function CaseActions({ caseState, patientId }: { caseState: CaseState; patientId: string }) {
  return (
    <Panel title="Next action" tone="brand">
      <div className="flex flex-col gap-3">
        {caseState.state === "paused" ? (
          <Notice kind="quiet" title="Paused">
            {caseState.pausedReason}
          </Notice>
        ) : null}
        <ButtonLink href={`/patient/${patientId}/record`} variant="primary" className="w-full">
          Go to the record
        </ButtonLink>
      </div>
    </Panel>
  );
}
