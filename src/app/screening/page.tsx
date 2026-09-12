import Link from "next/link";
import { listScreenings } from "@/lib/stage1/mortality-store";

import { readCoverage, coverageLabel } from "@/lib/stage1/coverage";
import { listScreeningJobs } from "@/lib/stage1/job-queue";
import { RunScreening, RefreshPending } from "@/components/screening/RunScreening";

export const dynamic = "force-dynamic";
export default async function ScreeningPage() {
  const screenings = await listScreenings();
  const jobs = (await listScreeningJobs()).reverse();
  const enabled = process.env.CAIRN_DEMO_ACTIONS === "true";
  const coverage = new Map(await Promise.all(screenings.map(async s => [s.id, await readCoverage(s.id).then(coverageLabel).catch(() => "Coverage unavailable")] as const)));
  screenings.sort((a, b) => (b.result?.generatedAt ?? "").localeCompare(a.result?.generatedAt ?? ""));
  return <div className="mx-auto max-w-6xl space-y-6 p-6">
    <header><p className="text-sm text-secondary">Clinician research view · fictional simulator</p><h1 className="text-3xl font-semibold">Three-month mortality screening</h1></header>
    <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-stone-900">These are unvalidated model estimates for a software demonstration. The threshold is provisional. A clinician must assess the evidence before any care decision.</p>
    <p>Stage 1 estimates all-cause death within three calendar months of the snapshot. Stage 2 independently reviews whether a timely goals-of-care conversation is appropriate. All screenings appear here, including those outside the rule-based worklist.</p>
    <RunScreening enabled={enabled} />
    <RefreshPending active={jobs.some(j => ["queued", "running"].includes(j.status))} />
    {jobs.some(j => j.status !== "completed") && <section className="space-y-3"><h2 className="text-xl font-semibold">Screening jobs</h2>{jobs.filter(j => j.status !== "completed").map(j => <div key={j.id} className="rounded border p-3"><p>{j.patientId} · {j.status} · {j.phase} · attempt {j.attempts}/3</p><p>{j.error}</p>{j.status === "failed" && j.attempts < 3 && <RunScreening enabled={enabled} retry={j.id} />}</div>)}</section>}
    <Link href="/screening" className="inline-block rounded border px-3 py-2 underline">Refresh screening status</Link>
    {!screenings.length ? <p className="rounded border p-8">No screenings yet. A completed pipeline run will appear here.</p> :
      <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm">
        <caption className="sr-only">Every screening, its estimate and review decision</caption>
        <thead className="bg-stone-100"><tr>{["Patient / run", "Snapshot (UTC)", "Status", "Unvalidated estimate", "Review signal / threshold"].map(h => <th className="p-3" key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{screenings.map(s => <tr key={s.id} className="border-t">
          <td className="max-w-sm p-3"><Link className="font-semibold underline" href={`/screening/${s.id}`}>{s.patientId ?? "Unavailable patient"}</Link><p className="text-xs text-secondary">{s.id.slice(0, 8)}</p><p className="mt-1 text-xs text-secondary">{coverage.get(s.id)}</p></td>
          <td className="p-3">{s.result?.indexTime.replace("T", " ").replace(".000Z", "") ?? "Pending"}</td>
          <td className="p-3">{s.status}{s.result?.coverage.partial ? " · see coverage" : ""}</td>
          <td className="p-3">{s.result?.deathProbability3m == null ? "No estimate" : `${(s.result.deathProbability3m * 100).toFixed(1)}%`}</td>
          <td className="p-3">{s.result?.decision.replaceAll("_", " ") ?? "Not assessed"}{s.result && <p className="mt-1 text-xs">Threshold: {s.result.threshold === null ? "disabled" : `${s.result.threshold * 100}%`}</p>}{s.result && s.result.thresholdBasis.startsWith("Command-line demo threshold") && <p className="mt-1 text-xs">Custom demo threshold</p>}</td>
        </tr>)}</tbody>
      </table></div>}
  </div>;
}
