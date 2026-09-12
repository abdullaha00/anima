import Link from "next/link";
import { ensureTeamAssembled, loadPatientContext } from "@/lib/patient-context";
import { getReviewStatus } from "@/lib/stage2/read";
import { PatientStrip } from "@/components/shell/PatientStrip";
import { RecordJumpBar } from "@/components/record/RecordJumpBar";
import { TeamSection } from "@/components/team/TeamSection";
import { RecordPersonalDetails } from "@/components/record/RecordPersonalDetails";
import { RespectFields } from "@/components/record/RespectFields";
import { SignatureSection } from "@/components/record/SignatureSection";

import { PreparationSection } from "@/components/screening/PreparationSection";

export const dynamic = "force-dynamic";

/**
 * The ReSPECT record page: the care team, then the record in its six sections, in one
 * unhurried column. Cairn drafts; a named clinician records, confirms and signs.
 */
export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A newly flagged case has its team proposed on first open, so the panel always has rows.
  const ctx = await ensureTeamAssembled(await loadPatientContext(id));
  const { review } = await getReviewStatus(ctx.patient.id);
  const record = ctx.caseState.record;
  const locked = record.status === "signed" || record.status === "shared";

  return (
    <div>
      <PatientStrip patient={ctx.patient} assessment={ctx.assessment} caseState={ctx.caseState} current="/record" />
      <RecordJumpBar />
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-10">
        <TeamSection ctx={ctx} review={review} />
        {review?.screeningId && <p className="rounded border p-4"><Link className="underline" href={`/screening/${review.screeningId}`}>Review the linked screening, its threshold and sources, and save the clinician decision</Link></p>}
        <PreparationSection caseState={ctx.caseState} />
        <RecordPersonalDetails patient={ctx.patient} />
        <RespectFields record={record} patient={ctx.patient} review={review} nowIso={ctx.nowIso} locked={locked} />
        <SignatureSection ctx={ctx} />
      </div>
    </div>
  );
}
