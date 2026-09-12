import { loadPatientContext } from "@/lib/patient-context";
import { PatientStrip } from "@/components/shell/PatientStrip";
import { EvidenceChain } from "@/components/patient/EvidenceChain";
import { Timeline } from "@/components/patient/Timeline";
import { PlanStatus } from "@/components/patient/PlanStatus";
import { CaseActions } from "@/components/patient/CaseActions";
import { Chip, EmptyLine, Panel } from "@/components/ui";
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
          {/* The person before the record: their own recorded goals, in a green-tinted header card. */}
          <section aria-labelledby="in-their-words" className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
            <div className="border-b border-cairn-100 bg-primary-soft px-6 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-affirm">
                In {firstName}&rsquo;s own words, from the record
              </p>
            </div>
            <div className="px-6 py-5">
              <h2 id="in-their-words" className="sr-only">
                What matters to {firstName}
              </h2>
              {patient.goals.length ? (
                <ul className="flex flex-col gap-2.5">
                  {patient.goals.map((g) => (
                    <li key={g} className="font-voice text-[20px] leading-[1.4] text-ink sm:text-[22px]">
                      &ldquo;{g}&rdquo;
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyLine>No goals recorded in the patient directory.</EmptyLine>
              )}
              {patient.needs.length ? (
                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                  <span className="mr-1 text-[12px] font-medium text-muted">Recorded needs</span>
                  {patient.needs.map((n) => (
                    <Chip key={n}>{n}</Chip>
                  ))}
                </div>
              ) : null}
              {patient.nextOfKin ? (
                <p className="mt-3 text-[13px] text-secondary">Named contact in the record: {patient.nextOfKin}.</p>
              ) : null}
            </div>
          </section>

          <Panel
            title="Indicators present in the record"
            aside={`${assessment.signals.length} · open each one to see what fired it`}
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
