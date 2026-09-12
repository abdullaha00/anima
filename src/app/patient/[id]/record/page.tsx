import Link from "next/link";
import type { RecordFieldName } from "@/lib/domain/types";
import { loadPatientContext } from "@/lib/patient-context";
import { CLINICIAN, DRAFT_LINE, NOT_BINDING_LINE } from "@/lib/copy";
import { formatDateTime } from "@/lib/format";
import { viewFor, type AudienceView } from "@/lib/record/record";
import { AUDIENCES, AUDIENCE_LABELS } from "@/lib/record/audiences";
import { PatientStrip } from "@/components/shell/PatientStrip";
import { Notice } from "@/components/ui";
import { RecordFields } from "@/components/record/RecordFields";
import { ReadinessPanel } from "@/components/record/ReadinessPanel";
import { SignGate } from "@/components/record/SignGate";
import { ShareBlock } from "@/components/record/ShareBlock";
import { AudienceTabs, type Provenance } from "@/components/record/AudienceTabs";
import { AuditPanel } from "@/components/record/AuditPanel";

export const dynamic = "force-dynamic";

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { patient, assessment, caseState, nowIso } = await loadPatientContext(id);
  const record = caseState.record;
  const signed = record.status === "signed" || record.status === "shared";
  const base = `/patient/${patient.id}`;
  const defaultSource = `conversation ${nowIso.slice(0, 10)} with ${CLINICIAN.name}`;

  // Audience views are computed here, server-side, and only exist once signed.
  const views: AudienceView[] = signed
    ? AUDIENCES.map((a) => viewFor(record, a)).filter((v): v is AudienceView => !("error" in v))
    : [];
  const provenance: Partial<Record<RecordFieldName, Provenance>> = {};
  for (const [name, entry] of Object.entries(record.fields)) {
    if (entry) {
      provenance[name as RecordFieldName] = {
        recordedBy: entry.recordedBy,
        recordedAt: entry.recordedAt,
        source: entry.source,
      };
    }
  }

  const statusLine =
    record.status === "shared"
      ? `Signed by ${record.signedBy} on ${formatDateTime(record.signedAt)}. Shared with: ${record.sharedWith
          .map((a) => AUDIENCE_LABELS[a])
          .join(", ")}.`
      : record.status === "signed"
        ? `Signed by ${record.signedBy} on ${formatDateTime(record.signedAt)}.`
        : DRAFT_LINE;

  return (
    <div>
      <PatientStrip patient={patient} assessment={assessment} caseState={caseState} current="/record" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,72ch)_minmax(16rem,20rem)] lg:items-start">
        <div className="flex flex-col gap-10">
          <header className="flex flex-col gap-2">
            <h2 className="font-display text-[1.5rem] font-medium leading-tight">The record</h2>
            <p className={`text-[0.9375rem] leading-6 ${signed ? "font-medium text-affirm" : "text-muted"}`}>{statusLine}</p>
            <p className="text-[0.8125rem] leading-5 text-muted">
              {NOT_BINDING_LINE} Version {record.version}.
            </p>
            {!signed && caseState.state !== "meeting held" && caseState.state !== "paused" ? (
              <p className="text-[0.8125rem] leading-5 text-muted">
                Fields can be recorded now. A signature follows the meeting outcome, recorded on the{" "}
                <Link href={`${base}/outcome`} className="text-primary underline-offset-4 hover:underline">
                  outcome screen
                </Link>
                .
              </p>
            ) : null}
          </header>

          <RecordFields record={record} patientId={patient.id} defaultSource={defaultSource} locked={signed} />

          <div className="border-t border-line pt-8">
            {signed ? (
              <div className="flex flex-col gap-8">
                <p className="rounded-md bg-affirm-soft px-4 py-3 text-[0.9375rem] leading-6 text-affirm">
                  Signed by {record.signedBy} on {formatDateTime(record.signedAt)}. The record is now immutable; a change
                  creates a new version.
                </p>
                <ShareBlock patientId={patient.id} sharedWith={record.sharedWith} />
              </div>
            ) : (
              <SignGate patientId={patient.id} clinicianName={CLINICIAN.name} />
            )}
          </div>

          <section aria-labelledby="audience-heading" className="flex flex-col gap-4 border-t border-line pt-8">
            <h3 id="audience-heading" className="font-display text-[1.25rem] font-medium leading-tight">
              What each recipient sees
            </h3>
            {signed && views.length ? (
              <AudienceTabs views={views} provenance={provenance} sharedWith={record.sharedWith} />
            ) : (
              <Notice kind="quiet">Audience views render nothing until a clinician signs.</Notice>
            )}
          </section>

          <AuditPanel recordAudit={record.audit} caseAudit={caseState.audit} />
        </div>

        <ReadinessPanel record={record} />
      </div>
    </div>
  );
}
