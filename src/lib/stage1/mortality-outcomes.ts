import { Type, type Static } from "typebox";
import { Check } from "typebox/value";
import { parseTime, threeMonthsAfter, type MortalityInput } from "./mortality-schema";

// This registry is independently adjudicated outcome data, never part of model input.
export const VerifiedOutcomeSchema = Type.Object({
  patientId: Type.String({ pattern: "^SIM-[0-9]{6}$" }),
  sourceReference: Type.String({ minLength: 1 }),
  adjudicatedBy: Type.String({ minLength: 1 }),
  verifiedDeathTime: Type.Union([Type.String(), Type.Null()]),
  verifiedAliveThrough: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });
export type VerifiedOutcome = Static<typeof VerifiedOutcomeSchema>;

export function labelMortalityOutcome(input: MortalityInput, raw: unknown): { label: 0 | 1 | null; status: "labelled" | "censored" | "ineligible"; reason: string } {
  if (!Check(VerifiedOutcomeSchema, raw)) throw new Error("Invalid independently verified outcome");
  const outcome = raw as VerifiedOutcome;
  if (input.patientId !== outcome.patientId) throw new Error("Outcome patient mismatch");
  if (input.horizonEnd !== threeMonthsAfter(input.indexTime)) throw new Error("Outcome horizon mismatch");
  const start = parseTime(input.indexTime), end = parseTime(input.horizonEnd);
  const death = outcome.verifiedDeathTime === null ? null : parseTime(outcome.verifiedDeathTime);
  const alive = outcome.verifiedAliveThrough === null ? null : parseTime(outcome.verifiedAliveThrough);
  if (death !== null && alive !== null && alive >= death) throw new Error("Conflicting death and survival observations");
  if (input.eligibility.status === "ineligible" || death !== null && death <= start) return { label: null, status: "ineligible", reason: "Death at or before index time" };
  if (input.eligibility.status !== "eligible") return { label: null, status: "censored", reason: "Screening eligibility unresolved" };
  if (death !== null && death <= end) return { label: 1, status: "labelled", reason: "Verified death in (indexTime, horizonEnd]" };
  if (alive !== null && alive >= end || death !== null && death > end) return { label: 0, status: "labelled", reason: "Verified survival through horizon" };
  return { label: null, status: "censored", reason: "No verified survival through horizon or death event in interval" };
}
