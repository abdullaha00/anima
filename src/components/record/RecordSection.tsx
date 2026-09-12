import Link from "next/link";
import type { RecordFieldName } from "@/lib/domain/types";
import type { PatientContext } from "@/lib/patient-context";
import { CLINICIAN, DRAFT_LINE, NOT_BINDING_LINE } from "@/lib/copy";
import { formatDate, formatDateTime } from "@/lib/format";
import { viewFor, type AudienceView } from "@/lib/record/record";
import { AUDIENCES, AUDIENCE_LABELS } from "@/lib/record/audiences";
import { Notice, Panel } from "@/components/ui";
import { RecordFields } from "@/components/record/RecordFields";
import { ReadinessPanel } from "@/components/record/ReadinessPanel";
import { SignGate } from "@/components/record/SignGate";
import { ShareBlock } from "@/components/record/ShareBlock";
import { AudienceTabs, type Provenance } from "@/components/record/AudienceTabs";
import { AuditPanel } from "@/components/record/AuditPanel";

/**
 * The record: the fields, what still stands before a signature, the sign gate (Cairn is
 * refused; a named clinician signs), sharing, what each audience sees, and the audit.
 */
export function RecordSection({ ctx }: { ctx: PatientContext }) {
  const { patient, caseState } = ctx;
  const record = caseState.record;
  const signed = record.status === "signed" || record.status === "shared";
  const base = `/patient/${patient.id}`;
  const defaultSource = "";

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
    <section id="record" aria-labelledby="record-heading" className="scroll-mt-[112px]">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <header className="flex flex-col gap-2">
            <h2 id="record-heading" className="font-display text-[22px] leading-tight text-ink">
              The record
            </h2>
            <p className={`text-[15px] leading-6 ${signed ? "font-medium text-affirm" : "text-secondary"}`}>{statusLine}</p>
            <p className="text-[13px] font-medium leading-5 text-secondary">
              {NOT_BINDING_LINE} Version {record.version}.
            </p>
            {!signed && caseState.state !== "meeting held" && caseState.state !== "paused" ? (
              <p className="text-[13px] font-medium leading-5 text-secondary">
                Fields can be recorded now. A signature follows the meeting outcome, recorded in the{" "}
                <Link href={`${base}/record#outcome`} className="text-primary-hover underline-offset-4 hover:underline">
                  outcome section
                </Link>
                .
              </p>
            ) : null}
          </header>

          <RecordFields record={record} patientId={patient.id} defaultSource={defaultSource} locked={signed} />

          {signed ? (
            <div className="flex min-w-0 flex-col gap-8">
              <Notice kind="affirm">
                Signed by {record.signedBy} on {formatDateTime(record.signedAt)}. The record is now immutable; a change
                creates a new version.
              </Notice>
              <ShareBlock patientId={patient.id} sharedWith={record.sharedWith} />
            </div>
          ) : (
            <SignGate
              patientId={patient.id}
              clinicianName={CLINICIAN.name}
              refusedBefore={[...record.audit].reverse().find((a) => a.action === "refuse-sign")?.detail}
            />
          )}

          <Panel heading="h3" as="div">
            <div className="flex flex-col gap-5">
              <h3 className="border-b border-line pb-4 text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink">
                What each recipient sees
              </h3>
              {signed && views.length ? (
                <AudienceTabs
                  views={views}
                  provenance={provenance}
                  sharedWith={record.sharedWith}
                  patientLine={[patient.name ?? patient.id, patient.birthDate ? `DOB ${formatDate(patient.birthDate)}` : undefined, patient.id].filter(Boolean).join(" · ")}
                />
              ) : (
                <Notice kind="quiet">Audience views render nothing until a clinician signs.</Notice>
              )}
            </div>
          </Panel>

          <AuditPanel recordAudit={record.audit} caseAudit={caseState.audit} />
        </div>

        <ReadinessPanel record={record} />
      </div>
    </section>
  );
}
