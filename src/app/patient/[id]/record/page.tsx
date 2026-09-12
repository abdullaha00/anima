import { loadPatientContext } from "@/lib/patient-context";
import { getReviewStatus } from "@/lib/stage2/read";
import { PatientStrip } from "@/components/shell/PatientStrip";
import { RecordJumpBar } from "@/components/record/RecordJumpBar";
import { TeamSection } from "@/components/team/TeamSection";
import { RecordPersonalDetails } from "@/components/record/RecordPersonalDetails";
import { RespectFields } from "@/components/record/RespectFields";
import { SignatureSection } from "@/components/record/SignatureSection";

export const dynamic = "force-dynamic";

/**
 * The ReSPECT record page: the care team, then the record in its six sections, in one
 * unhurried column. Cairn drafts; a named clinician records, confirms and signs.
 */
export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadPatientContext(id);
  const { review } = await getReviewStatus(ctx.patient.id);
  const record = ctx.caseState.record;
  const locked = record.status === "signed" || record.status === "shared";

  return (
    <div>
      <PatientStrip patient={ctx.patient} assessment={ctx.assessment} caseState={ctx.caseState} current="/record" />
      <RecordJumpBar />
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-10">
        <TeamSection ctx={ctx} review={review} />
        <RecordPersonalDetails patient={ctx.patient} />
        <RespectFields record={record} patient={ctx.patient} review={review} nowIso={ctx.nowIso} locked={locked} />
        <SignatureSection ctx={ctx} />
      </div>
    </div>
  );
}
