import { NextResponse } from "next/server";
import {
  authorizeStage2Request,
  enforceStage2RateLimit,
} from "@/lib/cairn/api-auth";
import {
  IdempotencyConflictError,
  QueueCapacityError,
  enqueueStage2Job,
} from "@/lib/cairn/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = authorizeStage2Request(request);
  if (unauthorized) return unauthorized;
  const rateLimited = enforceStage2RateLimit();
  if (rateLimited) return rateLimited;

  try {
    const body = (await request.json()) as { patientId?: unknown };
    if (typeof body.patientId !== "string") {
      return NextResponse.json(
        { error: "patientId must be a canonical patient ID" },
        { status: 400 },
      );
    }
    const job = await enqueueStage2Job(body.patientId, {
      idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
    });
    return NextResponse.json(
      {
        id: job.id,
        patientId: job.patientId,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        attempts: job.attempts,
      },
      {
        status: 202,
        headers: { Location: `/api/stage2/jobs/${job.id}` },
      },
    );
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof QueueCapacityError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
    if (
      error instanceof SyntaxError ||
      (error instanceof Error &&
        (error.message.startsWith("Patient ID") ||
          error.message.startsWith("Idempotency-Key")))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to enqueue Stage 2 job", error);
    return NextResponse.json(
      { error: "Unable to enqueue Stage 2 job" },
      { status: 500 },
    );
  }
}
