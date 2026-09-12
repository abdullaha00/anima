import Link from "next/link";
import { loadPatientContext } from "@/lib/patient-context";
import { getReviewStatus } from "@/lib/stage2/read";
import { PatientStrip } from "@/components/shell/PatientStrip";
import { RecordJumpBar } from "@/components/record/RecordJumpBar";
import { TeamSection } from "@/components/team/TeamSection";
import { ThreadSection } from "@/components/thread/ThreadSection";
import { OutcomeSection } from "@/components/outcome/OutcomeSection";
import { RecordSection } from "@/components/record/RecordSection";

import { PreparationSection } from "@/components/screening/PreparationSection";

export const dynamic = "force-dynamic";

/**
 * The one record page: the care team, the coordination thread, the outcome and the
 * record itself, in the order the work happens. Every section stays on screen whatever
 * the state, so the clinician sees the whole path and where this case has got to.
 */
export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadPatientContext(id);
  const { review } = await getReviewStatus(ctx.patient.id);

  return (
    <div>
      <PatientStrip patient={ctx.patient} assessment={ctx.assessment} caseState={ctx.caseState} current="/record" />
      <RecordJumpBar />
      <div className="flex flex-col gap-14">
        <TeamSection ctx={ctx} review={review} />
        {review?.screeningId && <p className="rounded border p-4"><Link className="underline" href={`/screening/${review.screeningId}`}>Review the linked screening, its threshold and sources, and save the clinician decision</Link></p>}
        <PreparationSection caseState={ctx.caseState} />
        <ThreadSection ctx={ctx} review={review} />
        <OutcomeSection ctx={ctx} review={review} />
        <RecordSection ctx={ctx} />
      </div>
    </div>
  );
}
