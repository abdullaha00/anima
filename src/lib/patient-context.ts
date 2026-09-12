import { notFound } from "next/navigation";
import type { Assessment, CaseState, Patient } from "@/lib/domain/types";
import { CLINICIAN } from "@/lib/copy";
import { getPatient, getPatients } from "@/lib/data/source";
import { rulesEngine } from "@/lib/scoring/rules";
import { deriveTeam } from "@/lib/coordination/team";
import { transition } from "@/lib/coordination/state";
import { getCase, nowIso, updateCase } from "@/lib/store";

export interface PatientContext {
  patient: Patient;
  assessment: Assessment;
  caseState: CaseState;
  nowIso: string;
}

/** Everything a patient screen needs, loaded once per request. 404s when the id is unknown. */
export async function loadPatientContext(id: string): Promise<PatientContext> {
  const [patient, { meta }] = await Promise.all([getPatient(id), getPatients()]);
  if (!patient) notFound();
  const nowIso = meta.simulationNow;
  const assessment = rulesEngine.assess(patient, { nowIso });
  const caseState = await getCase(id);
  return { patient, assessment, caseState, nowIso };
}

/**
 * A freshly flagged case with nobody on it gets its team proposed before the record page
 * renders, the same derivation and state move the clinician's action performs. This is
 * store-level on purpose: it runs during render, where revalidatePath is not allowed.
 * Returns the context unchanged for every other case.
 */
export async function ensureTeamAssembled(ctx: PatientContext): Promise<PatientContext> {
  const { patient, assessment, caseState } = ctx;
  if (caseState.state !== "flagged" || caseState.participants.length > 0) return ctx;
  const participants = deriveTeam(patient, assessment);
  const recipients = participants.filter((p) => p.recipientOnly).length;
  const next = await updateCase(patient.id, (c) => {
    if (c.state !== "flagged" || c.participants.length > 0) return c;
    const moved = transition({ ...c, participants }, "team assembled", CLINICIAN.name);
    return {
      ...moved,
      audit: [
        ...moved.audit,
        {
          at: nowIso(),
          action: "participant",
          actor: CLINICIAN.name,
          detail: `team proposed: ${participants.length - recipients} participants, ${recipients} recipients of the signed record`,
        },
      ],
    };
  });
  return { ...ctx, caseState: next };
}
