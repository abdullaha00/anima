/**
 * Plain-English presentation of a Stage 2 record review. The assessment carries a numeric
 * confidence; it is never shown. A review is a prompt for a clinician, not a verdict.
 */
import type { EvidenceReference, Stage2Assessment } from "@/lib/cairn/types";
import { formatDate } from "@/lib/format";

export const RECOMMENDATION_LABEL: Record<Stage2Assessment["recommendation"], { label: string; tone: "brand" | "neutral" | "affirm" | "warn"; line: string }> = {
  proceed: {
    label: "Review recommended",
    tone: "brand",
    line: "The record supports a prompt clinical review for a goals-of-care conversation.",
  },
  do_not_proceed: {
    label: "Not recommended now",
    tone: "neutral",
    line: "The record does not support a conversation at this point.",
  },
  already_managed: {
    label: "Plan already in place",
    tone: "affirm",
    line: "The record shows active planning that is being followed.",
  },
  insufficient_evidence: {
    label: "Not enough evidence",
    tone: "warn",
    line: "The record does not carry enough to say either way.",
  },
};

export const VERIFICATION_LABEL: Record<Stage2Assessment["verification"]["verdict"], string> = {
  pending: "not yet independently verified",
  confirmed: "independently verified, confirmed",
  revised: "independently verified, revised",
  escalate_uncertainty: "independently verified, uncertainty raised",
};

export const PLANNING_LABEL: Record<Stage2Assessment["existingPlanning"]["status"], string> = {
  none_found: "No existing plan found in the record",
  mentioned_not_active: "A plan is mentioned but not active",
  active_and_implemented: "An active plan is in place and being followed",
  unclear: "Existing planning is unclear from the record",
};

export const FALSE_POSITIVE_LABEL: Record<Stage2Assessment["falsePositiveReview"]["verdict"], string> = {
  no_clear_false_positive: "No clear benign explanation found",
  clear_false_positive: "A clear benign explanation was found",
  uncertain: "Benign explanation uncertain",
};

/** "record/sites/gp/patient-resources.json" -> "GP record" */
export function sourceName(sourcePath: string): string {
  const p = sourcePath.replace(/^record\//, "").replace(/\.json$/, "");
  const parts = p.split("/");
  if (parts[0] === "patient") return parts[1] === "directory" ? "patient directory" : "demographics";
  if (parts[0] === "sites") return `${(parts[1] ?? "").toUpperCase() === "GP" ? "GP" : parts[1]} record`;
  if (parts[0] === "nhs") return `${parts[1]} adapter`;
  if (parts[0] === "direct") return parts[1]?.replace(/-/g, " ") ?? "record";
  if (parts[0] === "clock") return "simulation clock";
  if (parts[0] === "index") return "consolidated index";
  if (parts[0] === "manifest") return "collection manifest";
  return p;
}

/** Simulator timestamps quoted inside a citation detail, shown as dates. */
function humaniseEpochs(text: string): string {
  return text.replace(/(?<![\d.])1[6-9]\d{11}(?![\d.])/g, (m) => formatDate(new Date(Number(m)).toISOString()));
}

/** The review's date field may be an ISO date, or a field name with a simulator timestamp. */
function dateLabel(date: string): string {
  const withDates = humaniseEpochs(date);
  return withDates === date && !Number.isNaN(new Date(date).getTime()) ? formatDate(date) : withDates;
}

/** One citation as a short line: "GP record · r-54 · 12 Sept 2026 · detail" */
export function citationLine(e: EvidenceReference): string {
  return [sourceName(e.sourcePath), e.recordId, e.date ? dateLabel(e.date) : undefined, humaniseEpochs(e.detail)]
    .filter(Boolean)
    .join(" · ");
}
