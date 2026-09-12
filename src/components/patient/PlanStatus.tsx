import type { CaseState, Patient } from "@/lib/domain/types";
import { LabelValue, Panel } from "@/components/ui";
import { NO_PLAN_RECORDED, DRAFT_LINE } from "@/lib/copy";
import { formatDateTime } from "@/lib/format";

/** Current palliative and advance care planning status. Says plainly when there is none. */
export function PlanStatus({ patient, caseState }: { patient: Patient; caseState: CaseState }) {
  const rec = caseState.record;
  const signed = rec.status === "signed" || rec.status === "shared";
  const recordLine = signed
    ? `ReSPECT-shaped record signed by ${rec.signedBy} on ${formatDateTime(rec.signedAt)}${
        rec.status === "shared" ? `, shared with ${rec.sharedWith.length} audiences` : ""
      }`
    : Object.keys(rec.fields).length
      ? `${DRAFT_LINE}. ${Object.keys(rec.fields).length} fields recorded so far.`
      : NO_PLAN_RECORDED;
  const cpr = rec.fields.cpr_recommendation;
  const adrt = rec.fields.adrt_exists;

  return (
    <Panel title="Palliative and advance care planning status">
      <div className="grid gap-5 sm:grid-cols-2">
        <LabelValue label="Palliative care register">
          {patient.onPalliativeRegister ? "On the register" : <span className="text-secondary">No register entry in this record source</span>}
        </LabelValue>
        <LabelValue label="Advance care plan">
          {patient.hasAcpRecord ? "An existing plan is recorded" : <span className={signed ? "text-affirm" : "text-secondary"}>{recordLine}</span>}
        </LabelValue>
        <LabelValue label="CPR recommendation">
          {cpr ? (
            <span>
              {cpr.value}{" "}
              <span className="text-muted">
                ({signed ? "signed" : "draft, awaiting clinician signature"}; a recommendation, not legally binding, not a DNACPR form)
              </span>
            </span>
          ) : (
            <span className="text-secondary">No CPR recommendation or DNACPR decision recorded.</span>
          )}
        </LabelValue>
        <LabelValue label="Advance decision to refuse treatment">
          {adrt ? adrt.value : <span className="text-secondary">None referenced in the record.</span>}
        </LabelValue>
      </div>
      {patient.existingPlanNote ? (
        <p className="mt-4 rounded-md border border-info-border bg-info-soft px-4 py-3 text-[13px] leading-5 text-ink">
          The record mentions an existing decision: &ldquo;{patient.existingPlanNote}&rdquo;
        </p>
      ) : null}
    </Panel>
  );
}
