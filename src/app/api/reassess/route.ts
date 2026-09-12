import path from "node:path";
import { enforceStage2RateLimit } from "@/lib/cairn/api-auth";
import { assertPatientId, CAIRN_ROOT, REPO_ROOT } from "@/lib/cairn/config";
import { collectPatientRecord } from "@/lib/cairn/collector";
import { runStage2Pipeline } from "@/lib/cairn/pipeline";
import { softenWording } from "@/lib/stage2/read";
import { readFullCollection, prepareMortalityInput } from "@/lib/stage1/mortality-input";
import { createScreening, saveScreeningResult } from "@/lib/stage1/mortality-store";
import {
  loadMortalityConfig,
  makeLlmMortalityEngine,
  MORTALITY_INVARIANTS,
  runMortalityEngine,
} from "@/lib/stage1/mortality-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Re-assessment deliberately stays in one streamed Node function invocation. This is within
// Vercel Fluid Compute's supported function model and avoids an unsupported background worker.
export const maxDuration = 800;

const MODEL = "openai/gpt-5.6-sol";
const THINKING = "medium" as const;

type Event =
  | { type: "phase"; phase: "stage1" | "stage2"; message: string }
  | { type: "stage1"; result: unknown }
  | { type: "complete"; patientId: string; stage1: unknown; stage2: unknown }
  | { type: "heartbeat" }
  | { type: "error"; message: string };

export async function POST(request: Request): Promise<Response> {
  const limited = enforceStage2RateLimit();
  if (limited) return limited;

  let patientId: string;
  try {
    const body = (await request.json()) as { patientId?: unknown };
    patientId = assertPatientId(typeof body.patientId === "string" ? body.patientId : "");
  } catch {
    return Response.json({ error: "A canonical patient ID is required." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: Event) => {
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const heartbeat = setInterval(() => send({ type: "heartbeat" }), 10_000);

      void (async () => {
        try {
          const screeningId = crypto.randomUUID();
          const collectionDirectory = path.join(CAIRN_ROOT, "reassess-collections", screeningId);

          send({ type: "phase", phase: "stage1", message: "Reading the live record across available services." });
          await collectPatientRecord(patientId, collectionDirectory);
          const source = await readFullCollection(collectionDirectory);
          const input = prepareMortalityInput(source, screeningId);
          const { config, prompt } = await loadMortalityConfig(
            path.join(REPO_ROOT, "config/stage1/mortality.json"),
            { model: MODEL, reasoning: THINKING },
          );
          await createScreening(input, { config, prompt, invariants: MORTALITY_INVARIANTS });

          send({ type: "phase", phase: "stage1", message: "Reviewing current evidence and contradictory signals." });
          const estimate = await runMortalityEngine(input, config, prompt, makeLlmMortalityEngine(MODEL));
          await saveScreeningResult(estimate.result);
          const displayStage1 = softenWording(estimate.result).value;
          send({ type: "stage1", result: displayStage1 });

          send({ type: "phase", phase: "stage2", message: "Assessing whether a conversation is appropriate and who should own it." });
          const review = await runStage2Pipeline(patientId, crypto.randomUUID(), screeningId, {
            model: MODEL,
            thinking: THINKING,
          });
          send({
            type: "complete",
            patientId,
            stage1: displayStage1,
            stage2: softenWording(review.result).value,
          });
        } catch (error) {
          console.error("Live re-assessment failed", error);
          send({ type: "error", message: "The live re-assessment could not be completed. Please try again." });
        } finally {
          clearInterval(heartbeat);
          closed = true;
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
