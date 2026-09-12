import Link from "next/link";
import type { Assessment, CaseState, Patient } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { Chip, PlanBadge } from "@/components/ui";
import { planGroupFor } from "@/lib/coordination/state";

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
  const demographics = [
    patient.age !== undefined ? `${patient.age}` : "age not recorded",
    patient.sex,
    patient.birthDate ? `DOB ${formatDate(patient.birthDate)}` : undefined,
    patient.id,
  ].filter(Boolean);
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
          <p className="mt-1.5 break-words text-[13px] leading-5 text-secondary tnum">{demographics.join(" · ")}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {patient.conditions.length ? (
              patient.conditions.map((c) => <Chip key={c}>{c}</Chip>)
            ) : (
              <span className="text-[13px] text-muted">no coded conditions</span>
            )}
          </div>
        </div>
        <PlanBadge plan={planGroupFor(caseState.state)} className="shrink-0" />
      </div>
    </div>
  );
}
