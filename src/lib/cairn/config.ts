import path from "node:path";

export const DEFAULT_LLM_MODEL = "openai/gpt-5.6-sol";
export const DEFAULT_LLM_REASONING = "low";
export type LlmReasoning = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export const REPO_ROOT = process.cwd();
// Vercel Functions have a read-only deployment filesystem and a writable /tmp directory.
// Re-assessment runs are self-contained in one streamed request, so their artifacts can live
// there; durable worker deployments should continue to set CAIRN_DATA_DIR explicitly.
const configuredDataRoot = process.env.CAIRN_DATA_DIR;
const defaultDataRoot = process.env.VERCEL ? path.join("/tmp", "cairn") : path.join(REPO_ROOT, ".cairn");
// A relative CAIRN_DATA_DIR is suitable locally but resolves into Vercel's read-only bundle.
const selectedDataRoot = process.env.VERCEL && configuredDataRoot && !path.isAbsolute(configuredDataRoot)
  ? defaultDataRoot
  : configuredDataRoot ?? defaultDataRoot;
export const CAIRN_ROOT = path.resolve(
  /* turbopackIgnore: true */
  selectedDataRoot,
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
