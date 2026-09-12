import type { CaseState } from "@/lib/domain/types";
import { Microlabel, Panel } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

/** Removals stay in the audit, because who was left out matters as much as who was in. */
export function RemovedGroup({ removed }: { removed: CaseState["removedParticipants"] }) {
  if (!removed.length) return null;
  return (
    <Panel>
      <section aria-labelledby="removed-participants">
        <h2 id="removed-participants" className="sr-only">
          Removed from the proposed team
        </h2>
        <Microlabel className="mb-3">Removed from the proposed team</Microlabel>
        <ul className="flex flex-col divide-y divide-line">
          {removed.map((r, i) => (
            <li
              key={`${r.participant.id}-${i}`}
              className="py-3 text-[13px] font-medium leading-5 text-secondary first:pt-0 last:pb-0"
            >
              <span className="text-[15px] font-bold text-ink">{r.participant.name}</span>,{" "}
              {r.participant.roleLabel ?? r.participant.role}, {r.participant.organisation}
              <span className="mt-0.5 block font-mono text-[12px] font-normal text-faint tnum">
                removed by {r.removedBy} on {formatDateTime(r.at)}
                {r.reason ? ` · ${r.reason}` : " · no reason given"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Panel>
  );
}
