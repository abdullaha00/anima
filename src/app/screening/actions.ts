"use server";
import { revalidatePath } from "next/cache";
import { enqueueScreening, retryScreening, ScreeningJobError } from "@/lib/stage1/job-queue";
import { enforceStage2RateLimit } from "@/lib/cairn/api-auth";

/** Explicit local demo capability, using the app's existing demo clinician identity.
 * Production must replace this with a verified clinician session/role check. */
async function demoEnabled() {
  if (process.env.CAIRN_DEMO_ACTIONS !== "true") throw new ScreeningJobError("Screening controls are disabled. The operator must enable CAIRN_DEMO_ACTIONS for this local fictional demo, or use the authenticated API.", 403);
  if (enforceStage2RateLimit()) throw new ScreeningJobError("Too many requests. Try again in a minute.", 429);
}
export async function requestScreening(_previous: { message: string }, data: FormData) {
  try {
    await demoEnabled();
    const retry = String(data.get("retry") ?? "");
    const job = retry ? await retryScreening(retry) : await enqueueScreening(String(data.get("patientId") ?? ""));
    revalidatePath("/screening");
    return { message: `Queued ${job.patientId}. The screening worker will collect a fresh record and process it.` };
  } catch (e) {
    return { message: e instanceof ScreeningJobError || e instanceof Error && e.message.startsWith("Patient ID") ? e.message : "Unable to queue screening. Ask the operator to check the server configuration." };
  }
}

export async function saveClinicalReview(_previous: { message: string }, data: FormData) {
  try {
    await demoEnabled();
    const { verifiedLinkedReview } = await import("@/lib/stage1/linked-review");
    const { decideScreening } = await import("@/lib/stage1/clinical-review");
    const { updateCase, findCase } = await import("@/lib/store");
    const { getPatient } = await import("@/lib/data/source");
    const { CLINICIAN } = await import("@/lib/copy");
    const screeningId = String(data.get("screeningId") ?? "");
    const { input, job, coverage } = await verifiedLinkedReview(screeningId);
    if (coverage.kind !== "live" || !await getPatient(input.patientId)) return { message: "Only a fresh simulator review for a known patient can enter the care workflow. Authored examples remain in the research view." };
    const decision = String(data.get("decision")) as "accepted" | "amended" | "dismissed";
    await updateCase(input.patientId, c => decideScreening(c, { patientId: input.patientId, screeningId, snapshotHash: input.snapshotHash, stage2JobId: job.id }, {
      decision, reason: String(data.get("reason") ?? ""), ownerId: String(data.get("ownerId") ?? ""), what: String(data.get("what") ?? ""), due: String(data.get("due") ?? ""), expectedRevision: Number(data.get("revision")),
    }, CLINICIAN.name, new Date().toISOString()));
    const saved = (await findCase(input.patientId))?.screeningReviews?.find(r => r.screeningId === screeningId);
    if (!saved) throw new Error("Saved review could not be read back");
    revalidatePath(`/patient/${input.patientId}`, "layout"); revalidatePath(`/screening/${screeningId}`);
    return { message: `Saved and verified: review ${saved.decision}, revision ${saved.revision}.${saved.preparationStepId ? " Preparation action is recorded in Cairn; no simulator booking or message was sent." : ""}` };
  } catch (e) { return { message: e instanceof Error ? e.message : "Unable to save clinician review" }; }
}
export async function updatePreparation(_previous: { message: string }, data: FormData) {
  try {
    await demoEnabled();
    const { updateCase } = await import("@/lib/store");
    const { assertPatientId } = await import("@/lib/cairn/config");
    const { changePreparationStatus } = await import("@/lib/stage1/clinical-review");
    const { CLINICIAN } = await import("@/lib/copy");
    const patientId = assertPatientId(String(data.get("patientId")));
    await updateCase(patientId, c => changePreparationStatus(c, String(data.get("stepId")), String(data.get("status")) as "done" | "blocked", String(data.get("reason") ?? ""), CLINICIAN.name, new Date().toISOString()));
    revalidatePath(`/patient/${patientId}`, "layout"); revalidatePath("/screening", "layout");
    return { message: "Preparation action updated in Cairn." };
  } catch (e) { return { message: e instanceof Error ? e.message : "Unable to update preparation action" }; }
}
