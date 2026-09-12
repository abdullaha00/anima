import { loadPatientContext } from "@/lib/patient-context";
import { recordedGoals } from "@/lib/record/drafts";
import { PatientStrip } from "@/components/shell/PatientStrip";
import { EvidenceChain } from "@/components/patient/EvidenceChain";
import { PlanStatus } from "@/components/patient/PlanStatus";
import { RecordReview } from "@/components/patient/RecordReview";
import { ScreeningPanel } from "@/components/patient/ScreeningPanel";
import { RECOMMENDATION_LABEL } from "@/lib/stage2/present";
import { PagedList, type PagedItem } from "@/components/patient/PagedList";
import { MedicinesPanel } from "@/components/patient/MedicinesPanel";
import { getReviewStatus } from "@/lib/stage2/read";
import { Panel, type ChipTone } from "@/components/ui";
import { formatDate, monthsBetween, plural } from "@/lib/format";
import type { Patient, TimelineEvent } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

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

/** Category tints for the record lists: hospital contact, practice contact, paper. Never severity. */
const KIND_TONE: Record<TimelineEvent["kind"], ChipTone> = {
  attendance: "warn",
  "discharge summary": "info",
  consultation: "brand",
  task: "neutral",
  appointment: "brand",
  "blood result": "info",
  prescription: "info",
  message: "neutral",
  other: "neutral",
};

const CONTACT_KINDS: TimelineEvent["kind"][] = ["attendance", "consultation", "appointment", "task", "message"];
const DOCUMENT_KINDS: TimelineEvent["kind"][] = ["discharge summary", "other"];

function toItems(events: TimelineEvent[]): PagedItem[] {
  return events.map((e, i) => ({
    key: `${e.sourceId ?? i}-${e.at}`,
    meta: formatDate(e.at),
    primary: e.title,
    tag: KIND_LABEL[e.kind],
    tone: KIND_TONE[e.kind],
    secondary: e.service ? (SERVICE_LABEL[e.service] ?? e.service) : undefined,
    detail: e.detail,
  }));
}

/** Plain facts from the record that explain why this person is on the list. Nothing inferred. */
/** One labelled fact per row: the value carries the weight, the label sits quietly above it. */
interface WhyFact {
  label: string;
  value: string;
  /** A second, quieter line under the value. */
  note?: string;
}

function whyFacts(patient: Patient, nowIso: string): WhyFact[] {
  const facts: WhyFact[] = [];
  const unplanned = patient.admissions.filter((a) => a.emergency && monthsBetween(a.at, nowIso) <= 12);
  if (unplanned.length) {
    const latest = unplanned.map((a) => a.at).sort().at(-1);
    facts.push({
      label: "Unplanned hospital episodes",
      value: `${unplanned.length} in the past year`,
      note: `Most recent ${formatDate(latest)}`,
    });
  }
  if (patient.conditions.length) facts.push({ label: "Conditions recorded", value: patient.conditions.join(", ") });
  if (!patient.hasAcpRecord && !patient.onPalliativeRegister) {
    facts.push({ label: "Care planning", value: "No advance care plan", note: "Not on the palliative care register in this record source" });
  }
  if (patient.needs.length) {
    facts.push({ label: "Recorded needs", value: patient.needs.map((n) => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()).join(", ") });
  }
  if (patient.existingPlanNote) facts.push({ label: "Existing decision in the record", value: `“${patient.existingPlanNote}”` });
  return facts;
}

/**
 * The directory fills `goals` for every patient from a template, so a goal counts as the
 * person's own words only when its text appears in a narrative in their record.
 */
export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadPatientContext(id);
  const { patient, assessment, caseState, nowIso } = ctx;
  const reviewStatus = await getReviewStatus(patient.id);
  const firstName = patient.name?.split(" ")[0] ?? "this person";
  const facts = whyFacts(patient, nowIso);
  const goals = recordedGoals(patient);

  const contacts = toItems(patient.timeline.filter((e) => CONTACT_KINDS.includes(e.kind)));
  const documents = toItems(patient.timeline.filter((e) => DOCUMENT_KINDS.includes(e.kind)));

  return (
    <div>
      <PatientStrip patient={patient} assessment={assessment} caseState={caseState} current="" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* The person's own recorded goals, the one bold element on the screen and the first
              thing read. Only words found in the record itself: when there are none, there is
              no block at all. */}
          {goals.length ? (
            <section aria-labelledby="in-their-words" className="overflow-hidden rounded-lg bg-primary text-primary-ink shadow-sm">
              <div className="px-6 pb-6 pt-5 sm:px-7">
                <h2 id="in-their-words" className="text-[12px] font-semibold text-cairn-100">
                  In {firstName}&rsquo;s own words
                </h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {goals.map((g) => (
                    <li key={g} className="font-voice hang-quote text-[26px] leading-[1.35] sm:text-[28px]">
                      &ldquo;{g}
                    </li>
                  ))}
                </ul>
              </div>
              {patient.nextOfKin ? (
                <div className="border-t border-white/15 bg-black/10 px-6 py-3 text-[13px] text-cairn-50 sm:px-7">
                  Named contact: {patient.nextOfKin}
                </div>
              ) : null}
            </section>
          ) : null}

          {/* Why this person is here, with the evidence chain. */}
          <Panel title={`Why ${firstName} is on the list`} tone="brand">
            {facts.length || reviewStatus.review ? (
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {reviewStatus.review ? (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[12px] font-semibold leading-5 text-muted">Record review</dt>
                    <dd className="text-[15px] font-semibold leading-6 text-ink">
                      {RECOMMENDATION_LABEL[reviewStatus.review.assessment.recommendation].label}
                    </dd>
                  </div>
                ) : null}
                {facts.map((f) => (
                  <div key={f.label} className="flex flex-col gap-0.5">
                    <dt className="text-[12px] font-semibold leading-5 text-muted">{f.label}</dt>
                    <dd className="text-[15px] font-semibold leading-6 text-ink">{f.value}</dd>
                    {f.note ? <dd className="text-[13px] leading-5 text-secondary">{f.note}</dd> : null}
                  </div>
                ))}
              </dl>
            ) : null}
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-1 text-[13px] font-semibold text-ink">
                {plural(assessment.signals.length, "indicator")} present in the record
              </h3>
              <EvidenceChain signals={assessment.signals} />
            </div>
          </Panel>

          {/* The three-month screening: its decision in words and the record entries behind it. */}
          <ScreeningPanel patientId={patient.id} caseState={caseState} />

          {/* Stage 2: a read-only reading of the whole record, a prompt for clinical review. */}
          <RecordReview status={reviewStatus} />

          <PlanStatus patient={patient} caseState={caseState} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel title="Admissions and contacts" aside={plural(contacts.length, "entry", "entries")}>
            <PagedList items={contacts} empty="No admissions or contacts in this record." />
          </Panel>

          <MedicinesPanel medications={patient.medications ?? []} />

          <Panel title="Documents" aside={plural(documents.length, "document")}>
            <PagedList items={documents} empty="No letters or summaries in this record." />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
