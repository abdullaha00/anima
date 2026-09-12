import Link from "next/link";
import type { Assessment, CaseState, Patient } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { ButtonLink, Chip } from "@/components/ui";
import { planGroupFor, type PlanGroup } from "@/lib/coordination/state";

/** Plan status in words under the record button. Unknown groups fall back to their own name. */
const PLAN_LABEL: Partial<Record<PlanGroup, string>> = {
  "no plan": "No plan yet",
  "plan in progress": "Plan in progress",
  "plan complete": "Plan complete",
};

/**
 * Stays at the top of the patient screens: who this is and where their plan has got to.
 * The way back is the worklist; everything else about the person lives on the patient
 * screen and the one record page, so there is no tab bar.
 */
export function PatientStrip({
  patient,
  caseState,
}: {
  patient: Patient;
  assessment: Assessment;
  caseState: CaseState;
  /** Kept for callers; the strip no longer shows a tab bar. */
  current?: string;
}) {
  const facts: { label: string; value: string; mono?: boolean }[] = [
    { label: "Age", value: patient.age !== undefined ? `${patient.age}` : "not recorded" },
    ...(patient.sex ? [{ label: "Sex", value: patient.sex }] : []),
    { label: "Date of birth", value: patient.birthDate ? formatDate(patient.birthDate) : "not recorded" },
    { label: "Identifier", value: patient.id, mono: true },
  ];
  const group = planGroupFor(caseState.state);
  const recordVariant = group === "no plan" || group === "plan in progress" ? "primary" : "quiet";
  return (
    <div className="mb-6 border-b border-line">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 pb-5">
        <div className="min-w-0">
          <Link
            href="/"
            className="-my-1.5 inline-flex min-h-11 items-center text-[13px] font-semibold text-primary underline-offset-4 hover:underline"
          >
            Worklist
          </Link>
          <h1 className="mt-1 font-display text-[28px] leading-[1.1] text-ink">{patient.name ?? patient.id}</h1>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            {facts.map((f) => (
              <div key={f.label} className="flex flex-col">
                <dt className="text-[12px] font-semibold leading-5 text-muted">{f.label}</dt>
                <dd className={`text-[14px] leading-5 text-ink tnum ${f.mono ? "font-mono text-[13px]" : ""}`}>{f.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {patient.conditions.length ? (
              patient.conditions.map((c) => <Chip key={c}>{c}</Chip>)
            ) : (
              <span className="text-[13px] text-muted">no coded conditions</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <ButtonLink href={`/patient/${patient.id}/record`} variant={recordVariant} className="shrink-0">
            ReSPECT record
          </ButtonLink>
          <p className="text-[12px] leading-5 text-secondary">{PLAN_LABEL[group] ?? group}</p>
        </div>
      </div>
    </div>
  );
}
