import Link from "next/link";
import { readScreeningInput, readScreeningResult } from "@/lib/stage1/mortality-store";
import type { MortalityResult, MortalityInput } from "@/lib/stage1/mortality-schema";
import { getStage2Job } from "@/lib/cairn/jobs";
import type { Stage2Assessment } from "@/lib/cairn/types";
import { readCoverage, coverageLabel, contentCoverageNotes } from "@/lib/stage1/coverage";
import { verifiedLinkedReview } from "@/lib/stage1/linked-review";
import { RefreshPending } from "@/components/screening/RunScreening";
import { ClinicalReview } from "@/components/screening/ClinicalReview";
import { findCase } from "@/lib/store";
import { getPatient } from "@/lib/data/source";

export const dynamic = "force-dynamic";
export default async function ScreeningDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let result: MortalityResult; let input: MortalityInput;
  try { input = await readScreeningInput(id); result = await readScreeningResult(id); }
  catch { return <div className="space-y-4 p-6"><h1 className="text-2xl font-semibold">Screening result unavailable</h1><p>This run may still be processing, may have been interrupted, or its stored record could not be verified.</p><Link href={`/screening/${encodeURIComponent(id)}`} className="underline">Refresh this run</Link><p><Link href="/screening" className="underline">All screenings</Link></p></div>; }
  const coverage = await readCoverage(id, input);
  const job = result.stage2JobId ? await getStage2Job(result.stage2JobId) : undefined;
  let review: Stage2Assessment | undefined; let reviewError = false;
  if (job?.status === "completed" && job.patientId === result.patientId) {
    try {
      review = (await verifiedLinkedReview(id)).assessment;
    } catch { reviewError = true; }
  }
  const caseState = coverage.kind === "live" ? await findCase(input.patientId) : undefined;
  const knownPatient = coverage.kind === "live" && !!await getPatient(input.patientId);
  const previous = caseState?.screeningReviews?.find(r => r.screeningId === id);
  return <div className="mx-auto max-w-5xl space-y-6 p-6">
    <Link href="/screening" className="underline">← All screenings</Link>
    <RefreshPending active={!!job && ["queued", "running"].includes(job.status)} />
    <header><p className="text-sm text-secondary">Fictional simulator · clinician research view</p><h1 className="text-3xl font-semibold">{result.patientId}: three-month screening</h1><p className="mt-2 break-words text-sm">{input.provenance}</p></header>
    <section className="space-y-3 rounded border border-amber-300 bg-amber-50 p-5 text-stone-900" aria-labelledby="estimate">
      <h2 id="estimate" className="text-xl font-semibold">{result.engine.validation === "unvalidated" ? "Unvalidated" : "Simulator-evaluated"} model estimate</h2>
      <p className="text-3xl font-semibold">{result.deathProbability3m === null ? "No estimate" : `${(result.deathProbability3m * 100).toFixed(1)}%`}</p>
      <p>Status: {result.status}. {result.reason}</p>
      <p>All-cause death after {result.indexTime} and on or before {result.horizonEnd}.</p>
      <p>Not clinically validated or calibrated. The value is a model estimate, not a diagnosis or a care decision.</p>
      <p>Demo threshold: {result.threshold === null ? "disabled" : `${result.threshold * 100}%`}; decision: {result.decision.replaceAll("_", " ")}. {result.thresholdBasis}</p>
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Evidence behind the estimate</h2><p>{result.explanation}</p>
      {([['Supporting evidence', result.supportingEvidence], ['Contradictory evidence', result.contradictoryEvidence]] as const).map(([title, items]) => <div key={title}><h3 className="font-semibold">{title}</h3>{!items.length && <p>No citations submitted.</p>}{items.map((e, i) => <details className="my-2 rounded border p-3" key={i}>
        <summary className="cursor-pointer">{e.interpretation}</summary><blockquote className="my-3 border-l-2 pl-3">{e.quote}</blockquote><p className="break-all text-xs text-secondary">Frozen source: {e.sourcePath} · {e.recordId} · {e.pointer}</p>
      </details>)}</div>)}
    </section>
    <section className="space-y-2 rounded border p-5"><h2 className="text-xl font-semibold">Coverage and limitations</h2><p>{coverageLabel(coverage)} · {input.records.length} eligible records</p><p>{result.coverage.failedSources.length ? "Some collection sources did not return usable data." : coverage.sources.length ? "All attempted sources returned; this does not establish complete service coverage." : "No source manifest is available for this example. An empty failure list does not mean a complete record."}</p><ul className="list-disc space-y-1 pl-5">{[...new Set([...contentCoverageNotes(result.coverage), ...result.limitations, ...result.coverage.failedSources.map(s => `Unavailable source: ${s}`), ...result.coverage.safetyGateReasons])].map(s => <li key={s}>{s}</li>)}</ul><details><summary className="cursor-pointer">Excluded record content</summary><pre className="overflow-auto text-xs">{JSON.stringify(result.coverage.excluded, null, 2)}</pre></details></section>
    <section className="space-y-3 rounded border p-5"><h2 className="text-xl font-semibold">Stage 2: independent conversation review</h2>
      <p>{job ? `Review status: ${job.status}` : result.decision === "above_threshold" ? "Review not yet linked. The pipeline can resume this saved screening." : "No Stage 2 job was automatically requested."}</p>
      {job?.status === "failed" && <p>The review failed. Its run log is available to the operator; no review recommendation is available.</p>}
      {reviewError && <p>The completed review could not be verified.</p>}
      <Link href={`/screening/${id}`} className="inline-block underline">Refresh review status</Link>
      {review && <><p className="font-semibold">Recommendation: {review.recommendation.replaceAll("_", " ")}</p><p>{review.summary}</p>
        <h3 className="font-semibold">Proposed accountable owner</h3><p>{review.meeting.proposedOwner}</p><p>{review.meeting.urgency}</p>
        <h3 className="font-semibold">Patient wishes</h3><ul className="list-disc pl-5">{review.patientAndFamily.patientWishes.map(s => <li key={s}>{s}</li>)}</ul>
        <h3 className="font-semibold">Team and preparation</h3><ul className="list-disc pl-5">{review.careTeam.map((t, i) => <li key={i}>{t.role} ({t.meetingPriority}): {t.ownership}. {t.reason}</li>)}</ul>
        <ul className="list-disc pl-5">{review.meeting.objectives.map(s => <li key={s}>{s}</li>)}</ul>
        <details><summary className="cursor-pointer">Review source references</summary><ul className="space-y-2 pt-2">{review.summaryEvidence.map((e, i) => <li key={i}>{e.detail}<span className="block break-all text-xs">{e.sourcePath} · {e.recordId ?? "file"} · {e.date ?? "date uncertain"}</span></li>)}</ul></details>
        <p>Verification: {review.verification.verdict.replaceAll("_", " ")}. Human review is required. These are proposed actions; no booking, patient contact or treatment change has been made.</p>
      </>}
    </section>
    {review && knownPatient && <ClinicalReview screeningId={id} patientId={input.patientId} participants={caseState?.participants ?? []} previous={previous} step={caseState?.preparationSteps?.find(s => s.id === previous?.preparationStepId)} enabled={process.env.CAIRN_DEMO_ACTIONS === "true"} />}
    {review && !knownPatient && <p>This example remains in the research view. A fresh collection for a patient in the workspace is required before saving a clinician workflow action.</p>}
    <details className="rounded border p-4"><summary className="cursor-pointer">Run provenance</summary><dl className="space-y-2 break-all pt-3 text-xs"><dt>Engine / model</dt><dd>{result.engine.id} / {result.engine.model}</dd><dt>Screening</dt><dd>{id}</dd><dt>Snapshot SHA-256</dt><dd>{result.snapshotHash}</dd><dt>Configuration SHA-256</dt><dd>{result.engine.configHash}</dd><dt>Prompt SHA-256</dt><dd>{result.engine.promptHash}</dd><dt>Stage 2 job</dt><dd>{result.stage2JobId ?? "None"}</dd></dl></details>
  </div>;
}
