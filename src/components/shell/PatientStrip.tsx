import Link from "next/link";
import type { Assessment, CaseState, Patient } from "@/lib/domain/types";
import { formatAge } from "@/lib/format";
import { Mono, StateBadge, TierLabel } from "@/components/ui";
import { QUIET_LINE } from "@/lib/copy";

const TABS: { label: string; suffix: string }[] = [
  { label: "Patient", suffix: "" },
  { label: "Care team", suffix: "/team" },
  { label: "Coordination thread", suffix: "/thread" },
  { label: "Outcome", suffix: "/outcome" },
  { label: "Record", suffix: "/record" },
];

/** Stays visible across the five screens: who this is, the tier, the state, the quiet line. */
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
  return (
    <div className="mb-6 border-b border-line">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 pb-3">
        <h1 className="font-serif text-[1.75rem] font-medium leading-tight tracking-tight">
          {patient.name ?? patient.id}
        </h1>
        <span className="text-[0.9375rem] text-muted tnum">{formatAge(patient.age)}</span>
        <Mono className="text-muted">{patient.id}</Mono>
        <span className="text-[0.9375rem] text-muted">
          {patient.conditions.length ? patient.conditions.join(", ") : "no coded conditions"}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <TierLabel tier={assessment.tier} />
          <StateBadge state={caseState.state} />
        </span>
      </div>
      <p className="pb-3 text-[0.8125rem] text-muted">{QUIET_LINE}</p>
      <nav aria-label="Patient screens" className="-mb-px flex flex-wrap gap-x-1">
        {TABS.map((t) => {
          const active = current === t.suffix;
          return (
            <Link
              key={t.suffix}
              href={`${base}${t.suffix}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center border-b-2 px-3 text-[0.9375rem] ${
                active
                  ? "border-primary font-medium text-ink"
                  : "border-transparent text-muted hover:border-line-strong hover:text-ink"
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
