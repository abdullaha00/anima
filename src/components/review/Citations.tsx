import type { EvidenceReference } from "@/lib/cairn/types";
import { citationLine } from "@/lib/stage2/present";

/**
 * The citations under one statement from the record review. Every statement the review
 * makes is shown with the record entries behind it, so it can be checked rather than trusted.
 */
export function Citations({ evidence, className = "" }: { evidence: EvidenceReference[]; className?: string }) {
  if (evidence.length === 0) return null;
  return (
    <ul className={`flex flex-col gap-0.5 ${className}`}>
      {evidence.map((e, i) => (
        <li key={`${e.sourcePath}-${e.recordId ?? ""}-${i}`} className="text-[12px] leading-5 text-faint tnum">
          {citationLine(e)}
        </li>
      ))}
    </ul>
  );
}

/** The standing line under every draft communication. Cairn drafts; it never shares anything itself. */
export const DRAFT_ONLY_LINE = "Draft only. Cairn shares nothing itself; a clinician reviews and rewrites it first.";

export const FAMILY_DRAFT_LINE = "Draft only. A clinician reviews and rewrites before anything reaches the family.";

/** Audiences that belong on the family tab: the person themselves and those close to them. */
export function isFamilyAudience(audience: string): boolean {
  return /family|patient|relative|carer|daughter|\bson\b|next of kin|spouse|wife|husband|partner/i.test(audience);
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "team",
  "service",
  "lead",
  "named",
  "care",
  "practice",
  "usual",
  "or",
  "to",
  "of",
  "a",
  "an",
  "at",
  "in",
]);

/** Words from a free-text owner or role that are worth matching against a participant. */
export function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

/** Case-insensitive "contains" in either direction, over a few fields. */
export function fieldsContain(fields: (string | undefined)[], needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (n.length < 2) return false;
  return fields.some((f) => {
    const v = (f ?? "").trim().toLowerCase();
    return v.length >= 2 && (v.includes(n) || n.includes(v));
  });
}
