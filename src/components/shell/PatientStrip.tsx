import Link from "next/link";
import type { Assessment, CaseState, Patient } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { Chip, StateBadge, TierLabel } from "@/components/ui";
import { QUIET_LINE } from "@/lib/copy";

const TABS: { label: string; suffix: string }[] = [
  { label: "Patient", suffix: "" },
  { label: "Care team", suffix: "/team" },
  { label: "Coordination thread", suffix: "/thread" },
  { label: "Outcome", suffix: "/outcome" },
  { label: "Record", suffix: "/record" },
];

/** Stays at the top of the five patient screens: who this is, the tier, the state, the quiet line. */
export function PatientStrip({
  patient,
  assessment,
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
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
            <Link href="/" className="hover:underline">
              Worklist
            </Link>
            <span className="text-faint"> / patient</span>
          </p>
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
        <div className="flex flex-col items-end gap-2">
          <StateBadge state={caseState.state} />
          <TierLabel tier={assessment.tier} />
          <p className="max-w-[320px] text-right text-[12px] leading-5 text-faint">{QUIET_LINE}</p>
        </div>
      </div>
      <nav aria-label="Patient screens" className="-mb-px flex flex-wrap gap-x-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = current === t.suffix;
          return (
            <Link
              key={t.suffix}
              href={`${base}${t.suffix}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold ${
                active ? "border-primary text-primary" : "border-transparent text-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
