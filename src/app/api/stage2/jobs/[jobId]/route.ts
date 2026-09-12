import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { authorizeStage2Request } from "@/lib/cairn/api-auth";
import { getStage2Job } from "@/lib/cairn/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const unauthorized = authorizeStage2Request(request);
  if (unauthorized) return unauthorized;

  const { jobId } = await context.params;
  const job = await getStage2Job(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  let result: unknown;
  if (job.status === "completed" && job.resultPath) {
    try {
      result = JSON.parse(await readFile(job.resultPath, "utf8")) as unknown;
    } catch (error) {
      console.error(`Could not read Stage 2 result for ${job.id}`, error);
      return NextResponse.json(
        { error: "Stage 2 result is temporarily unavailable" },
        { status: 503 },
      );
    }
  }
  return NextResponse.json({
    job: {
      id: job.id,
      patientId: job.patientId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      attempts: job.attempts,
      ...(job.status === "failed" ? { error: "Stage 2 processing failed" } : {}),
    },
    result,
  });
}
