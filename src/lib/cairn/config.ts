import path from "node:path";

export const REPO_ROOT = process.cwd();
export const CAIRN_ROOT = path.resolve(
  /* turbopackIgnore: true */
  process.env.CAIRN_DATA_DIR ?? path.join(REPO_ROOT, ".cairn"),
);
export const JOBS_ROOT = path.join(CAIRN_ROOT, "jobs");
export const RUNS_ROOT = path.join(CAIRN_ROOT, "runs");
export const SIMULATOR_ORIGIN = (
  process.env.SIM_ORIGIN ?? "https://sim.animahealth.com"
).replace(/\/$/, "");

export const PATIENT_ID_PATTERN = /^SIM-\d{6}$/;

export function assertPatientId(value: string): string {
  const patientId = value.trim().toUpperCase();
  if (!PATIENT_ID_PATTERN.test(patientId)) {
    throw new Error("Patient ID must use the canonical format SIM-000001");
  }
  return patientId;
}

export function requireSimulatorKey(): string {
  const key = process.env.SIM_KEY;
  if (!key) {
    throw new Error("SIM_KEY is required");
  }
  return key;
}
