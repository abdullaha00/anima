import { NextResponse } from "next/server";
import { getScreeningJob, publicScreeningJob, retryScreening, ScreeningJobError } from "@/lib/stage1/job-queue";
import { authorizeScreening, screeningApiError } from "@/lib/stage1/job-api";
import { readScreeningResult } from "@/lib/stage1/mortality-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const denied = authorizeScreening(request); if (denied) return denied;
  try {
    const job = await getScreeningJob((await context.params).id);
    if (!job) throw new ScreeningJobError("Screening job not found", 404);
    const result = job.status === "completed" ? await readScreeningResult(job.id) : undefined;
    return NextResponse.json({ ...publicScreeningJob(job), result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return screeningApiError(e); }
}
export async function POST(request: Request, context: Context) {
  const denied = authorizeScreening(request, true); if (denied) return denied;
  try {
    const body = await request.json();
    if (!body || body.action !== "retry" || Object.keys(body).length !== 1) throw new ScreeningJobError('Supply {"action":"retry"}', 400);
    return NextResponse.json(publicScreeningJob(await retryScreening((await context.params).id)), { status: 202 });
  } catch (e) { return screeningApiError(e); }
}
