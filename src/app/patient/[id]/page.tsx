import { loadPatientContext } from "@/lib/patient-context";
import { PatientStrip } from "@/components/shell/PatientStrip";
import { EvidenceChain } from "@/components/patient/EvidenceChain";
import { Timeline } from "@/components/patient/Timeline";
import { PlanStatus } from "@/components/patient/PlanStatus";
import { CaseActions } from "@/components/patient/CaseActions";
import { EmptyLine, Panel } from "@/components/ui";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadPatientContext(id);
  const { patient, assessment, caseState } = ctx;
  const firstName = patient.name?.split(" ")[0] ?? "this person";
  const egfrs = patient.labs.filter((l) => l.analyte === "egfr");
  const latestEgfr = egfrs.at(-1);

  return (
    <div>
      <PatientStrip patient={patient} assessment={assessment} caseState={caseState} current="" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          {/* The person before the record. Their own recorded goals, set large on Cairn green:
              the one bold element on the screen, so everything clinical around it can stay quiet. */}
          <section aria-labelledby="in-their-words" className="overflow-hidden rounded-lg bg-primary text-primary-ink shadow-sm">
            <div className="px-6 pb-5 pt-5 sm:px-7">
              <h2 id="in-their-words" className="text-[12px] font-semibold text-primary-ink/75">
                What matters to {firstName}, in {firstName}&rsquo;s own words
              </h2>
              {patient.goals.length ? (
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {patient.goals.map((g) => (
                    <li key={g} className="font-voice text-[22px] leading-[1.35] sm:text-[24px]">
                      &ldquo;{g}&rdquo;
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[15px] text-primary-ink/80">No goals recorded in the patient directory.</p>
              )}
              <p className="mt-3 text-[12px] text-primary-ink/70">Goals recorded in the patient directory, NHS-SIM.</p>
            </div>
            {patient.needs.length || patient.nextOfKin ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/15 bg-black/10 px-7 py-3 text-[13px] sm:px-8">
                {patient.needs.length ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-primary-ink/75">Recorded needs</span>
                    {patient.needs.map((n) => (
                      <span
                        key={n}
                        className="rounded-xs border border-white/25 px-2 py-[3px] text-[11px] font-medium leading-none text-primary-ink"
                      >
                        {n}
                      </span>
                    ))}
                  </span>
                ) : null}
                {patient.nextOfKin ? <span className="text-primary-ink/90">Named contact: {patient.nextOfKin}</span> : null}
              </div>
            ) : null}
          </section>

          <Panel
            title="Indicators present in the record"
            aside={`${assessment.signals.length} · open each one to see what fired it`}
            tone="brand"
          >
            <EvidenceChain signals={assessment.signals} />
          </Panel>

          <PlanStatus patient={patient} caseState={caseState} />
        </div>

        <aside className="flex flex-col gap-5">
          <CaseActions caseState={caseState} patientId={patient.id} />

          <Panel title="Admissions and contacts" aside={`${patient.timeline.length} entries`}>
            <Timeline events={patient.timeline} />
          </Panel>

          <Panel title="Kidney function, most recent">
            {latestEgfr ? (
              <p className="text-[14px] leading-6 text-secondary tnum">
                <span className="text-[18px] font-semibold text-ink">eGFR {latestEgfr.value}</span> {latestEgfr.unit},
                collected {formatDate(latestEgfr.at)}
                {egfrs.length > 1 ? ` · ${egfrs.length} results over the year` : ""}
              </p>
            ) : (
              <EmptyLine>No blood results in this record.</EmptyLine>
            )}
          </Panel>

          <Panel title="Record coverage">
            <p className="text-[13px] leading-6 text-secondary">
              {patient.recordDepth === "full"
                ? "Full GP and hospital record pulled from the simulator."
                : "Directory row only. The full record was not pulled for this patient, so indicators that read the problem list, blood results or hospital episodes cannot fire."}
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
