import { loadPatientContext } from "@/lib/patient-context";
import { PatientStrip } from "@/components/shell/PatientStrip";
import { EvidenceChain } from "@/components/patient/EvidenceChain";
import { Timeline } from "@/components/patient/Timeline";
import { PlanStatus } from "@/components/patient/PlanStatus";
import { CaseActions } from "@/components/patient/CaseActions";
import { EmptyLine, Microlabel, Panel } from "@/components/ui";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadPatientContext(id);
  const { patient, assessment, caseState } = ctx;
  const firstName = patient.name?.split(" ")[0] ?? "this person";
  const latestEgfr = [...patient.labs].reverse().find((l) => l.analyte === "egfr");

  return (
    <div>
      <PatientStrip patient={patient} assessment={assessment} caseState={caseState} current="" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          {/* The person before the record. Their own recorded goals, set large in the serif. */}
          <section aria-labelledby="in-their-words" className="border-b border-line pb-6">
            <Microlabel className="mb-3">In {firstName}&rsquo;s own words, from the record</Microlabel>
            <h2 id="in-their-words" className="sr-only">
              What matters to {firstName}
            </h2>
            {patient.goals.length ? (
              <ul className="flex flex-col gap-2">
                {patient.goals.map((g) => (
                  <li key={g} className="font-serif text-[1.625rem] leading-[1.3] text-ink sm:text-[1.875rem]">
                    &ldquo;{g}&rdquo;
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyLine>No goals recorded in the patient directory.</EmptyLine>
            )}
            {patient.needs.length ? (
              <p className="mt-3 text-[0.9375rem] text-muted">Recorded needs: {patient.needs.join(", ")}.</p>
            ) : null}
          </section>

          <section aria-labelledby="indicators">
            <div className="flex items-baseline justify-between gap-4 pb-2">
              <h2 id="indicators" className="font-serif text-[1.25rem] font-medium">
                Indicators present in the record
              </h2>
              <span className="text-[0.8125rem] text-muted">open each one to see what fired it</span>
            </div>
            <EvidenceChain signals={assessment.signals} />
          </section>

          <PlanStatus patient={patient} caseState={caseState} />
        </div>

        <aside className="flex flex-col gap-4">
          <CaseActions caseState={caseState} patientId={patient.id} />

          <Panel title="Admissions and contacts" aside={`${patient.timeline.length} entries`}>
            <Timeline events={patient.timeline} />
          </Panel>

          <Panel title="Kidney function, most recent">
            {latestEgfr ? (
              <p className="text-[0.9375rem] tnum">
                eGFR {latestEgfr.value} {latestEgfr.unit}, collected {formatDate(latestEgfr.at)}
                {patient.labs.filter((l) => l.analyte === "egfr").length > 1
                  ? ` · ${patient.labs.filter((l) => l.analyte === "egfr").length} results over the year`
                  : ""}
              </p>
            ) : (
              <EmptyLine>No blood results in this record.</EmptyLine>
            )}
          </Panel>

          <Panel title="Record coverage">
            <p className="text-[0.9375rem] leading-6 text-muted">
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
