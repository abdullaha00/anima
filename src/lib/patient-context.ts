import { notFound } from "next/navigation";
import type { Assessment, CaseState, Patient } from "@/lib/domain/types";
import { getPatient, getPatients } from "@/lib/data/source";
import { rulesEngine } from "@/lib/scoring/rules";
import { getCase } from "@/lib/store";

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
