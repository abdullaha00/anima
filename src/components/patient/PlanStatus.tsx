import type { CaseState, Patient } from "@/lib/domain/types";
import { LabelValue, Panel } from "@/components/ui";
import { NO_PLAN_RECORDED, DRAFT_LINE, ADRT_LINE } from "@/lib/copy";
import { formatDateTime } from "@/lib/format";

/** Current palliative and advance care planning status. Says plainly when there is none. */
export function PlanStatus({ patient, caseState }: { patient: Patient; caseState: CaseState }) {
  const rec = caseState.record;
  const recordLine =
    rec.status === "signed" || rec.status === "shared"
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
      <div className="grid gap-4 sm:grid-cols-2">
        <LabelValue label="Palliative care register">
          {patient.onPalliativeRegister ? "On the register" : "No register entry in this record source"}
        </LabelValue>
        <LabelValue label="Advance care plan">
          {patient.hasAcpRecord ? "An existing plan is recorded" : recordLine}
        </LabelValue>
        <LabelValue label="CPR recommendation">
          {cpr ? (
            <span>
              {cpr.value}{" "}
              <span className="text-muted">
                ({rec.status === "signed" || rec.status === "shared" ? "signed" : "draft, awaiting clinician signature"}
                ; a recommendation, not legally binding, not a DNACPR form)
              </span>
            </span>
          ) : (
            <span className="text-muted">No CPR recommendation or DNACPR decision recorded.</span>
          )}
        </LabelValue>
        <LabelValue label="Advance decision to refuse treatment">
          {adrt ? adrt.value : <span className="text-muted">None referenced in the record.</span>}
        </LabelValue>
      </div>
      <p className="prose-clinical mt-4 text-[0.8125rem] leading-5 text-muted">{ADRT_LINE}</p>
    </Panel>
  );
}
