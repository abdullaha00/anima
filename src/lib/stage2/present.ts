/**
 * Plain-English presentation of a Stage 2 record review. The assessment carries a numeric
 * confidence; it is never shown. A review is a prompt for a clinician, not a verdict.
 */
import type { EvidenceReference, Stage2Assessment } from "@/lib/cairn/types";
import { formatDate } from "@/lib/format";

export const RECOMMENDATION_LABEL: Record<Stage2Assessment["recommendation"], { label: string; tone: "brand" | "neutral" | "affirm" | "warn" | "info"; line: string }> = {
  proceed: {
    label: "Review recommended",
    tone: "info",
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

/** "record/sites/gp/patient-resources.json" -> "GP record" */
export function sourceName(sourcePath: string): string {
  const p = sourcePath.replace(/^record\//, "").replace(/\.json$/, "");
  const parts = p.split("/");
  if (parts[0] === "patient") return parts[1] === "directory" ? "patient directory" : "demographics";
  if (parts[0] === "sites") return `${(parts[1] ?? "").toUpperCase() === "GP" ? "GP" : parts[1]} record`;
  if (parts[0] === "nhs") return `${parts[1]} adapter`;
  if (parts[0] === "direct") {
    if (parts[1] === "patient-messaging") return "patient message";
    return parts[1]?.replace(/-/g, " ") ?? "record";
  }
  if (parts[0] === "clock") return "simulation clock";
  if (parts[0] === "index") return "consolidated index";
  if (parts[0] === "manifest") return "collection manifest";
  return p;
}

/** Simulator timestamps quoted inside a citation detail, shown as dates. */
function humaniseEpochs(text: string): string {
  return text.replace(/(?<![\d.])1[6-9]\d{11}(?![\d.])/g, (m) => formatDate(new Date(Number(m)).toISOString()));
}

/** ISO calendar dates quoted inside text ("2026-08-13"), shown as dates. */
function humaniseIsoDates(text: string): string {
  return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (m) => formatDate(m));
}

/**
 * The review's date field may be an ISO date, or a record field name with a simulator
 * timestamp ("createdAt 1789200000000"). Only the date is shown; the field name is not.
 */
function dateLabel(date: string): string {
  const withDates = humaniseIsoDates(humaniseEpochs(date));
  if (withDates === date && !Number.isNaN(new Date(date).getTime())) return formatDate(date);
  // "createdAt 12 Sept 2026", "arrivalAt …", "sentAt …", "at …": the field name goes.
  return withDates.replace(/\b(?:[A-Za-z]*At|at)\s+(?=\d)/g, "").trim();
}

function sentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

/** The pieces of one citation, ready to lay out: where, when, which entry, and what it says. */
export function citationParts(e: EvidenceReference): { source: string; date?: string; id?: string; detail: string } {
  const name = sourceName(e.sourcePath);
  return {
    source: name.charAt(0).toUpperCase() + name.slice(1),
    date: e.date ? dateLabel(e.date) : undefined,
    id: e.recordId,
    detail: sentence(humaniseEpochs(e.detail)),
  };
}

/** One citation as a short text line: "GP record · 12 Sept 2026 · r-54 · Detail." */
export function citationLine(e: EvidenceReference): string {
  const c = citationParts(e);
  return [c.source, c.date, c.id, c.detail].filter(Boolean).join(" · ");
}
