import type { CaseState, Patient } from "@/lib/domain/types";
import { LabelValue, Panel } from "@/components/ui";
import { NO_PLAN_RECORDED } from "@/lib/copy";
import { formatDateTime } from "@/lib/format";
import { readiness } from "@/lib/record/record";
import { REQUIRED_FIELDS } from "@/lib/record/fields";

/**
 * Current palliative and advance care planning status. Once the ReSPECT record has saved
 * fields, the cells read from the record; until then, from the patient. Says plainly when
 * there is none.
 */
export function PlanStatus({ patient, caseState }: { patient: Patient; caseState: CaseState }) {
  const rec = caseState.record;
  const signed = rec.status === "signed" || rec.status === "shared";
  const recorded = Object.keys(rec.fields).length;
  const started = recorded > 0 || signed;
  const required = REQUIRED_FIELDS.length;
  const done = required - readiness(rec).missing.length;

  const planLine = signed
    ? `ReSPECT record signed by ${rec.signedBy} on ${formatDateTime(rec.signedAt)}${
        rec.status === "shared" ? `, shared with ${rec.sharedWith.length} audiences` : ""
      }`
    : started
      ? `ReSPECT record started, ${done} of ${required} required fields recorded`
      : patient.hasAcpRecord
        ? "An existing plan is recorded"
        : NO_PLAN_RECORDED;

  const cpr = rec.fields.cpr_recommendation;
  const cprRationale = rec.fields.cpr_rationale;
  const ceiling = rec.fields.escalation_ceiling;

  return (
    <Panel title="Palliative and advance care planning status">
      <div className="grid gap-5 sm:grid-cols-2">
        <LabelValue label="Advance care plan">
          <span className={signed ? "text-affirm" : started || patient.hasAcpRecord ? "text-ink" : "text-secondary"}>{planLine}</span>
        </LabelValue>
        <LabelValue label="CPR recommendation">
          {cpr ? (
            <span>
              {cpr.value}
              {cprRationale ? <span className="text-secondary"> — {cprRationale.value}</span> : null}{" "}
              <span className="text-muted">
                ({signed ? "signed" : "draft, awaiting clinician signature"}; a recommendation, not legally binding, not a DNACPR form)
              </span>
            </span>
          ) : (
            <span className="text-secondary">No CPR recommendation or DNACPR decision recorded.</span>
          )}
        </LabelValue>
        {ceiling ? <LabelValue label="Escalation ceiling">{ceiling.value}</LabelValue> : null}
      </div>
      {patient.existingPlanNote ? (
        <p className="mt-4 rounded-md border border-info-border bg-info-soft px-4 py-3 text-[13px] leading-5 text-ink">
          The record mentions an existing decision: &ldquo;{patient.existingPlanNote}&rdquo;
        </p>
      ) : null}
    </Panel>
  );
}
