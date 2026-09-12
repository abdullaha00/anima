/**
 * Pre-filled drafts for the record form. Cairn drafts, the clinician confirms: nothing here
 * is written to the record until a named clinician confirms it, and every draft names where
 * it came from so the clinician can check it against the record.
 */

import type { Patient, RecordFieldName } from "@/lib/domain/types";
import type { Stage2Assessment } from "@/lib/cairn/types";
import { formatDate, monthsBetween } from "@/lib/format";

export interface FieldDraft {
  value: string;
  source: string;
}

const CAIRN_CONFIRMED = "Confirmed by the clinician.";

function sentence(s: string): string {
  const t = s.trim();
  if (t === "") return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function joinTerms(terms: string[]): string {
  if (terms.length <= 1) return terms.join("");
  return `${terms.slice(0, -1).join(", ")} and ${terms[terms.length - 1]}`;
}

/**
 * The goals the record itself carries in the person's words. The directory holds template
 * goals for every patient; only a goal whose text appears in a narrative counts as theirs.
 */
export function recordedGoals(patient: Patient): string[] {
  const texts = (patient.narratives ?? []).map((n) => n.text.toLowerCase());
  return patient.goals.filter((g) => texts.some((t) => t.includes(g.toLowerCase())));
}

export function draftFor(
  field: RecordFieldName,
  patient: Patient,
  review: Stage2Assessment | undefined,
  opts: { runId?: string; nowIso: string },
): FieldDraft | undefined {
  switch (field) {
    case "capacity_assessment": {
      // Pre-select only from what the record says. Lacking capacity or a best-interests
      // decision anywhere in the review's legal or planning notes takes precedence; the
      // person's own recorded wishes support capacity; otherwise nothing is pre-selected.
      const legal = [
        ...(review?.patientAndFamily.legalAndCarePlanningRecords ?? []),
        ...(review?.patientAndFamily.uncertainties ?? []),
        ...(review?.existingPlanning.details ?? []),
      ].join(" ");
      if (/best.interests?/i.test(legal)) {
        return { value: "Best interests decision", source: `Cairn pre-selection from a best-interests note in the record review. ${CAIRN_CONFIRMED}` };
      }
      if (/(lack(s|ed|ing)?|without|does not have|no) capacity/i.test(legal)) {
        return { value: "Lacked capacity for this decision", source: `Cairn pre-selection from a capacity note in the record review. ${CAIRN_CONFIRMED}` };
      }
      if (recordedGoals(patient).length > 0 || (review?.patientAndFamily.patientWishes.length ?? 0) > 0) {
        return { value: "Had capacity for this decision", source: `Cairn pre-selection: the person's own wishes are recorded in the record. ${CAIRN_CONFIRMED}` };
      }
      return undefined;
    }

    case "what_matters": {
      const goals = recordedGoals(patient).map(sentence).filter((g) => g !== "");
      if (goals.length === 0) return undefined;
      return { value: goals.join(" "), source: "patient record, in their own words" };
    }

    case "clinical_summary": {
      const conditions = patient.conditions.map((c) => c.trim()).filter((c) => c !== "");
      if (conditions.length === 0) return undefined;
      let value = joinTerms(conditions);
      const recent = patient.admissions
        .filter((a) => a.emergency && monthsBetween(a.at, opts.nowIso) < 12)
        .sort((a, b) => b.at.localeCompare(a.at));
      if (recent.length > 0) {
        const n = recent.length;
        value += `. ${n} unplanned hospital ${n === 1 ? "episode" : "episodes"} in the past year, most recent ${formatDate(recent[0].at)}.`;
      }
      return { value, source: "patient record" };
    }

    case "clinical_trajectory": {
      const text = review?.careBaseline.functionAndMobility?.trim();
      if (!text) return undefined;
      return { value: text, source: `record review${opts.runId ? `, run ${opts.runId.slice(0, 8)}` : ""}` };
    }

    case "active_medications": {
      const meds = (patient.medications ?? []).filter((m) => m.name.trim() !== "");
      if (meds.length === 0) return undefined;
      const value = meds.map((m) => (m.status ? `${m.name} (${m.status})` : m.name)).join("; ");
      const sources = new Set(meds.map((m) => m.source));
      const source = sources.size === 1 ? [...sources][0] : "hospital prescription";
      return { value, source };
    }

    case "cpr_recommendation":
      return {
        value: "No recorded decision",
        source: `Cairn pre-selection; no CPR decision in the record. ${CAIRN_CONFIRMED}`,
      };

    default:
      return undefined;
  }
}
