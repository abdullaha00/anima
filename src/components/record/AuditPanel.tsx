import type { AuditEvent } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { EmptyLine, Panel } from "@/components/ui";

/**
 * The record's own audit and the case audit, merged, oldest first. The actions write the
 * same moment to both trails, so an event with the same time, action and actor is shown
 * once, with the case-level detail preferred because it is the fuller sentence.
 */
export function mergeAudit(recordAudit: AuditEvent[], caseAudit: AuditEvent[]): AuditEvent[] {
  const seen = new Set<string>();
  const out: AuditEvent[] = [];
  for (const e of [...caseAudit, ...recordAudit]) {
    const key = `${e.at}|${e.action}|${e.actor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function AuditPanel({ recordAudit, caseAudit }: { recordAudit: AuditEvent[]; caseAudit: AuditEvent[] }) {
  const events = mergeAudit(recordAudit, caseAudit);
  return (
    <Panel heading="h3" title="Audit: every set, promotion, signature and share, in order" aside={`${events.length} events`}>
      {events.length === 0 ? (
        <EmptyLine>Nothing recorded yet.</EmptyLine>
      ) : (
        <ol className="flex flex-col divide-y divide-line font-mono text-[12px] leading-5">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="grid gap-x-3 py-2 first:pt-0 last:pb-0 sm:grid-cols-[10.5rem_7rem_9rem_minmax(0,1fr)]">
              <span className="whitespace-nowrap text-faint tnum">{formatDateTime(e.at)}</span>
              <span
                className={`font-semibold ${
                  e.action === "refuse-sign" ? "text-refuse" : e.action === "sign" || e.action === "share" ? "text-affirm" : "text-ink"
                }`}
              >
                {e.action}
              </span>
              <span className="truncate text-secondary">{e.actor}</span>
              <span className="text-ink">{e.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
