import type { EvidenceReference } from "@/lib/cairn/types";
import { citationParts } from "@/lib/stage2/present";

/**
 * One record entry behind a statement from the record review: where it came from and when,
 * the entry's id set small on the right, then what it says as a sentence underneath.
 */
export function Citation({ evidence: e }: { evidence: EvidenceReference }) {
  const c = citationParts(e);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {/* Source and date stay together; the id sits on the right at sm+ and drops to its own line on a phone. */}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0 text-[12px] leading-5">
        <span className="font-semibold text-secondary">{c.source}</span>
        {c.date ? (
          <>
            <span aria-hidden="true" className="text-faint">
              &middot;
            </span>
            <span className="whitespace-nowrap text-faint tnum">{c.date}</span>
          </>
        ) : null}
        {c.id ? (
          <span className="basis-full break-all font-mono text-[11px] text-faint tnum sm:ml-auto sm:basis-auto sm:pl-3">{c.id}</span>
        ) : null}
      </div>
      <p className="max-w-[72ch] break-words text-[13px] leading-5 text-secondary">{c.detail}</p>
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
