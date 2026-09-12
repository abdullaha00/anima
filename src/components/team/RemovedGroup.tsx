import type { CaseState } from "@/lib/domain/types";
import { Microlabel } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

/** Removals stay in the audit, because who was left out matters as much as who was in. */
export function RemovedGroup({ removed }: { removed: CaseState["removedParticipants"] }) {
  if (!removed.length) return null;
  return (
    <section aria-labelledby="removed-participants" className="border-t border-dashed border-line pt-4">
      <h2 id="removed-participants" className="sr-only">
        Removed from the proposed team
      </h2>
      <Microlabel className="mb-2">Removed from the proposed team</Microlabel>
      <ul className="flex flex-col gap-2">
        {removed.map((r, i) => (
          <li key={`${r.participant.id}-${i}`} className="text-[0.875rem] leading-5 text-muted">
            <span className="text-ink">{r.participant.name}</span>, {r.participant.roleLabel ?? r.participant.role},{" "}
            {r.participant.organisation}
            <span className="block font-mono text-[0.75rem]">
              removed by {r.removedBy} on {formatDateTime(r.at)}
              {r.reason ? ` · ${r.reason}` : " · no reason given"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
