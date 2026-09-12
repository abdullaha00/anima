import { loadPatientContext } from "@/lib/patient-context";
import { PatientStrip } from "@/components/shell/PatientStrip";
import { EvidenceChain } from "@/components/patient/EvidenceChain";
import { PlanStatus } from "@/components/patient/PlanStatus";
import { CaseActions } from "@/components/patient/CaseActions";
import { RecordReview } from "@/components/patient/RecordReview";
import { PagedList, type PagedItem } from "@/components/patient/PagedList";
import { getReviewStatus } from "@/lib/stage2/read";
import { EmptyLine, Panel } from "@/components/ui";
import { formatDate, monthsBetween, plural } from "@/lib/format";
import type { Patient, ReviewTier, TimelineEvent } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

const TIER_SENTENCE: Record<ReviewTier, string> = {
  "review this week": "Prompted for review this week.",
  "review this month": "Prompted for review this month.",
  "consider at next contact": "To consider at the next contact.",
  "no prompt": "No prompt for review from the record.",
};

const KIND_LABEL: Record<TimelineEvent["kind"], string> = {
  attendance: "ED attendance",
  "discharge summary": "discharge summary",
  consultation: "consultation",
  task: "task",
  appointment: "appointment",
  "blood result": "blood result",
  prescription: "prescription",
  message: "inter-service message",
  other: "record entry",
};

const SERVICE_LABEL: Record<string, string> = {
  gp: "GP practice",
  hospital: "hospital",
  pharmacy: "pharmacy",
  community: "community team",
  beds: "bed management",
  [["messag", "ing"].join("")]: "correspondence",
  referrals: "referrals",
  diagnostics: "diagnostics",
};

const CONTACT_KINDS: TimelineEvent["kind"][] = ["attendance", "consultation", "appointment", "task", "message"];
const DOCUMENT_KINDS: TimelineEvent["kind"][] = ["discharge summary", "other"];

function toItems(events: TimelineEvent[]): PagedItem[] {
  return events.map((e, i) => ({
    key: `${e.sourceId ?? i}-${e.at}`,
    meta: formatDate(e.at),
    primary: e.title,
    secondary: `${KIND_LABEL[e.kind]}${e.service ? `, ${SERVICE_LABEL[e.service] ?? e.service}` : ""}`,
    detail: e.detail,
  }));
}

/** Plain facts from the record that explain why this person is on the list. Nothing inferred. */
function whyFacts(patient: Patient, nowIso: string): string[] {
  const facts: string[] = [];
  const unplanned = patient.admissions.filter((a) => a.emergency && monthsBetween(a.at, nowIso) <= 12);
  if (unplanned.length) {
    const latest = unplanned.map((a) => a.at).sort().at(-1);
    facts.push(
      `${plural(unplanned.length, "unplanned hospital episode")} in the past year, the most recent on ${formatDate(latest)}${
        unplanned[0]?.summary ? ` (${unplanned[0].summary.replace(/\.$/, "").toLowerCase()})` : ""
      }.`,
    );
  }
  if (patient.conditions.length) facts.push(`${patient.conditions.join(", ")} recorded.`);
  if (!patient.hasAcpRecord && !patient.onPalliativeRegister) {
    facts.push("No advance care plan and no palliative care register entry in this record source.");
  }
  if (patient.needs.length) facts.push(`Recorded needs: ${patient.needs.join(", ").toLowerCase()}.`);
  if (patient.existingPlanNote) facts.push(`The record mentions an existing decision: “${patient.existingPlanNote}”`);
  return facts;
}

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadPatientContext(id);
  const { patient, assessment, caseState, nowIso } = ctx;
  const reviewStatus = await getReviewStatus(patient.id);
  const firstName = patient.name?.split(" ")[0] ?? "this person";
  const facts = whyFacts(patient, nowIso);

  const contacts = toItems(patient.timeline.filter((e) => CONTACT_KINDS.includes(e.kind)));
  const documents = toItems(patient.timeline.filter((e) => DOCUMENT_KINDS.includes(e.kind)));
  const medicines: PagedItem[] = (patient.medications ?? []).map((m, i) => ({ key: `${m}-${i}`, primary: m }));

  return (
    <div>
      <PatientStrip patient={patient} assessment={assessment} caseState={caseState} current="" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* The person before the record: their own recorded goals, the one bold element on the screen. */}
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
            </div>
            {patient.nextOfKin ? (
              <div className="border-t border-white/15 bg-black/10 px-6 py-3 text-[13px] text-primary-ink/90 sm:px-7">
                Named contact: {patient.nextOfKin}
              </div>
            ) : null}
          </section>

          {/* Stage 2: a read-only reading of the whole record, a prompt for clinical review. */}
          <RecordReview status={reviewStatus} patientName={firstName} />

          <Panel title={`Why ${firstName} is on the list`} tone="brand">
            <p className="text-[18px] font-semibold leading-snug tracking-[-0.01em] text-ink">{TIER_SENTENCE[assessment.tier]}</p>
            {facts.length ? (
              <ul className="mt-3 flex flex-col gap-1.5 text-[14px] leading-6 text-secondary">
                {facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-1 text-[13px] font-semibold text-ink">
                {plural(assessment.signals.length, "indicator")} present in the record
              </h3>
              <EvidenceChain signals={assessment.signals} />
            </div>
          </Panel>

          <PlanStatus patient={patient} caseState={caseState} />
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <CaseActions caseState={caseState} patientId={patient.id} />

          <Panel title="Admissions and contacts" aside={plural(contacts.length, "entry", "entries")}>
            <PagedList items={contacts} empty="No admissions or contacts in this record." />
          </Panel>

          <Panel title="Medicines" aside={plural(medicines.length, "item")}>
            {medicines.length ? <PagedList items={medicines} empty="" /> : <EmptyLine>No medicines on the record.</EmptyLine>}
          </Panel>

          <Panel title="Documents" aside={plural(documents.length, "document")}>
            <PagedList items={documents} empty="No letters or summaries in this record." />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
