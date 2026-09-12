import Link from "next/link";
import type { Assessment, CaseState, Patient } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { Chip, PlanBadge } from "@/components/ui";
import { planGroupFor } from "@/lib/coordination/state";

/**
 * The three stages. Find is the worklist; Prepare is everything on the patient's screens
 * before the record; Record is where what the person wants is written down and signed.
 */
const STAGES: { stage: string; tabs: { label: string; href: (base: string) => string; suffix?: string }[] }[] = [
  { stage: "Find", tabs: [{ label: "Worklist", href: () => "/" }] },
  {
    stage: "Prepare",
    tabs: [
      { label: "Patient", href: (b) => b, suffix: "" },
      { label: "Care team", href: (b) => `${b}/team`, suffix: "/team" },
      { label: "Coordination thread", href: (b) => `${b}/thread`, suffix: "/thread" },
      { label: "Outcome", href: (b) => `${b}/outcome`, suffix: "/outcome" },
    ],
  },
  { stage: "Record", tabs: [{ label: "Record", href: (b) => `${b}/record`, suffix: "/record" }] },
];

/** Stays at the top of the patient screens: who this is and where their plan has got to. */
export function PatientStrip({
  patient,
  caseState,
  current,
}: {
  patient: Patient;
  assessment: Assessment;
  caseState: CaseState;
  current: string;
}) {
  const base = `/patient/${patient.id}`;
  const demographics = [
    patient.age !== undefined ? `${patient.age}` : "age not recorded",
    patient.sex,
    patient.birthDate ? `DOB ${formatDate(patient.birthDate)}` : undefined,
    patient.id,
  ].filter(Boolean);
  return (
    <div className="mb-6 border-b border-line">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 pb-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] leading-[1.1] text-ink">{patient.name ?? patient.id}</h1>
          <p className="mt-1.5 text-[13px] text-secondary tnum">{demographics.join(" · ")}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {patient.conditions.length ? (
              patient.conditions.map((c) => <Chip key={c}>{c}</Chip>)
            ) : (
              <span className="text-[13px] text-muted">no coded conditions</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <PlanBadge plan={planGroupFor(caseState.state)} />
          <span className="text-[12px] text-faint">{caseState.state}</span>
        </div>
      </div>
      <nav aria-label="Stages" className="-mb-px flex flex-wrap items-end gap-x-6 overflow-x-auto">
        {STAGES.map((group) => {
          const groupActive = group.tabs.some((t) => t.suffix !== undefined && t.suffix === current);
          return (
            <div key={group.stage} className="flex flex-col">
              <span
                className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${
                  groupActive ? "text-primary" : "text-faint"
                }`}
              >
                {group.stage}
              </span>
              <div className="flex">
                {group.tabs.map((t) => {
                  const active = t.suffix !== undefined && current === t.suffix;
                  return (
                    <Link
                      key={t.label}
                      href={t.href(base)}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold ${
                        active ? "border-primary text-primary" : "border-transparent text-muted hover:border-line-strong hover:text-ink"
                      }`}
                    >
                      {t.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
