import { NextResponse } from "next/server";
import { enqueueScreening, publicScreeningJob, ScreeningJobError } from "@/lib/stage1/job-queue";
import { authorizeScreening, screeningApiError } from "@/lib/stage1/job-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const denied = authorizeScreening(request, true); if (denied) return denied;
  try {
    const text = await request.text();
    if (text.length > 1024) throw new ScreeningJobError("Request is too large", 413);
    const body = JSON.parse(text);
    if (!body || typeof body.patientId !== "string" || Object.keys(body).some(k => k !== "patientId")) throw new ScreeningJobError("Supply only patientId", 400);
    const job = await enqueueScreening(body.patientId, request.headers.get("idempotency-key") ?? undefined);
    return NextResponse.json(publicScreeningJob(job), { status: 202, headers: { Location: `/api/stage1/jobs/${job.id}` } });
  } catch (e) { return screeningApiError(e); }
}
