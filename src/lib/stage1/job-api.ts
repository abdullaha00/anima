import { NextResponse } from "next/server";
import { authorizeStage2Request, enforceStage2RateLimit } from "../cairn/api-auth";
import { ScreeningJobError } from "./job-queue";
export function authorizeScreening(request: Request, mutation = false) {
  return authorizeStage2Request(request) ?? (mutation ? enforceStage2RateLimit() : undefined);
}
export function screeningApiError(error: unknown) {
  if (error instanceof ScreeningJobError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError || error instanceof Error && error.message.startsWith("Patient ID")) return NextResponse.json({ error: "Invalid screening request" }, { status: 400 });
  return NextResponse.json({ error: "Screening operation unavailable" }, { status: 500 });
}
