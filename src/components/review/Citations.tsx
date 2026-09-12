import type { EvidenceReference } from "@/lib/cairn/types";
import { citationParts } from "@/lib/stage2/present";

/**
 * One record entry behind a statement from the record review: where it came from and when,
 * the entry's id set small on the right, then what it says as a sentence underneath.
 */
export function Citation({ evidence: e }: { evidence: EvidenceReference }) {
  const c = citationParts(e);
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-x-1.5 text-[12px] leading-5">
        <span className="font-semibold text-secondary">{c.source}</span>
        {c.date ? (
          <>
            <span aria-hidden="true" className="text-faint">
              &middot;
            </span>
            <span className="text-faint tnum">{c.date}</span>
          </>
        ) : null}
        {c.id ? <span className="ml-auto pl-3 font-mono text-[11px] text-faint tnum">{c.id}</span> : null}
      </div>
      <p className="max-w-[72ch] text-[13px] leading-5 text-secondary">{c.detail}</p>
    </div>
  );
}

/**
 * The citations under one statement from the record review. Every statement the review
 * makes is shown with the record entries behind it, so it can be checked rather than trusted.
 */
export function Citations({ evidence, className = "" }: { evidence: EvidenceReference[]; className?: string }) {
  if (evidence.length === 0) return null;
  return (
    <ul className={`flex flex-col gap-2.5 border-l-2 border-stone-200 pl-3 ${className}`}>
      {evidence.map((e, i) => (
        <li key={`${e.sourcePath}-${e.recordId ?? ""}-${i}`}>
          <Citation evidence={e} />
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
