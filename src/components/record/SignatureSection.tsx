import type { RecordFieldName } from "@/lib/domain/types";
import type { PatientContext } from "@/lib/patient-context";
import { CLINICIAN, NOT_BINDING_LINE } from "@/lib/copy";
import { formatDate, formatDateTime } from "@/lib/format";
import { viewFor, type AudienceView } from "@/lib/record/record";
import { AUDIENCES, AUDIENCE_LABELS } from "@/lib/record/audiences";
import { Mono, Notice, Panel } from "@/components/ui";
import { ReadinessLine } from "@/components/record/ReadinessPanel";
import { SignGate } from "@/components/record/SignGate";
import { ShareBlock } from "@/components/record/ShareBlock";
import { AudienceTabs, type Provenance } from "@/components/record/AudienceTabs";

/** ISO date six months on, for the default review date. */
function sixMonthsOn(isoDate: string): string {
  const d = new Date(isoDate);
  d.setUTCMonth(d.getUTCMonth() + 6);
  return d.toISOString().slice(0, 10);
}

/**
 * Signatures and review: what still stands before a signature, the sign gate (Cairn is
 * refused; a named clinician signs), then once signed the signature line, sharing, what
 * each audience sees.
 */
export function SignatureSection({ ctx }: { ctx: PatientContext }) {
  const { patient, caseState, nowIso } = ctx;
  const record = caseState.record;
  const signed = record.status === "signed" || record.status === "shared";
  const today = nowIso.slice(0, 10);

  // Audience views are computed here, server-side, and only exist once signed.
  const views: AudienceView[] = signed
    ? AUDIENCES.map((a) => viewFor(record, a)).filter((v): v is AudienceView => !("error" in v))
    : [];
  const provenance: Partial<Record<RecordFieldName, Provenance>> = {};
  for (const [name, entry] of Object.entries(record.fields)) {
    if (entry) {
      provenance[name as RecordFieldName] = { recordedBy: entry.recordedBy, recordedAt: entry.recordedAt, source: entry.source };
    }
  }

  return (
    <section id="sign" aria-labelledby="sign-heading" className="flex scroll-mt-[112px] flex-col gap-6">
      <Panel
        as="div"
        heading="h2"
        title={<span id="sign-heading">Signatures and review</span>}
      >
        <div className="flex flex-col gap-6">
          <div className="border-b border-line pb-4">
            <ReadinessLine record={record} />
          </div>

          {signed ? (
            <div className="flex flex-col gap-4">
              <Notice kind="affirm" title="Signed">
                <p>
                  {record.signedBy}
                  {record.signedGmc ? (
                    <>
                      , GMC <Mono className="text-[13px] text-ink">{record.signedGmc}</Mono>
                    </>
                  ) : null}
                  , on {formatDateTime(record.signedAt)}.
                  {record.nextReviewAt ? <> Next review {formatDate(record.nextReviewAt)}.</> : null}
                </p>
                {record.signature ? (
                  <p className="mt-1 font-voice text-[18px] leading-snug text-ink">{record.signature}</p>
                ) : null}
                {record.status === "shared" && record.sharedWith.length ? (
                  <p className="mt-1 text-[13px] font-medium text-secondary">
                    Shared with {record.sharedWith.map((a) => AUDIENCE_LABELS[a]).join(", ")}.
                  </p>
                ) : null}
              </Notice>
              <p className="text-[12px] leading-5 text-faint">
                The record is now immutable; a change creates a new version. {NOT_BINDING_LINE}
              </p>
            </div>
          ) : (
            <SignGate
              patientId={patient.id}
              clinicianName={CLINICIAN.name}
              gmc={CLINICIAN.gmc}
              today={today}
              defaultNextReview={sixMonthsOn(today)}
              refusedBefore={[...record.audit].reverse().find((a) => a.action === "refuse-sign")?.detail}
            />
          )}
        </div>
      </Panel>

      {signed ? (
        <>
          <ShareBlock patientId={patient.id} sharedWith={record.sharedWith} />
          <Panel heading="h3" as="div" title="What each recipient sees">
            {views.length ? (
              <AudienceTabs
                views={views}
                provenance={provenance}
                sharedWith={record.sharedWith}
                patientLine={[patient.name ?? patient.id, patient.birthDate ? `DOB ${formatDate(patient.birthDate)}` : undefined, patient.id]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ) : (
              <Notice kind="quiet">Audience views render nothing until a clinician signs.</Notice>
            )}
          </Panel>
        </>
      ) : null}

    </section>
  );
}
