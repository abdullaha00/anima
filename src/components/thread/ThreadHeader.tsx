import type { CaseState, CoordinationThread } from "@/lib/domain/types";
import { Microlabel, Mono, SimulatedTag } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

/**
 * The stated purpose in the serif, who opened it and when in mono, then the closed
 * participant list with response state and read receipts. The read receipts are a
 * coordination feature and the audit trail at once.
 */
export function ThreadHeader({ thread, caseState }: { thread: CoordinationThread; caseState: CaseState }) {
  const readsById = new Map(thread.reads.map((r) => [r.participantId, r.at]));
  const participants = thread.participantIds
    .map((pid) => caseState.participants.find((p) => p.id === pid))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  return (
    <header className="flex flex-col gap-4 border-b border-line pb-5">
      <div>
        <p className="prose-clinical font-voice text-[1.25rem] leading-snug text-ink">Purpose: {thread.purpose}</p>
        <p className="mt-1.5 font-mono text-[0.75rem] leading-5 text-muted">
          opened by {thread.openedBy} on {formatDateTime(thread.openedAt)} · {thread.id}
          {thread.closedAt ? ` · closed ${formatDateTime(thread.closedAt)}` : ""}
        </p>
      </div>

      <div>
        <Microlabel className="mb-1.5">
          Participants, {participants.length} · closed list
        </Microlabel>
        <ul className="divide-y divide-line border-y border-line">
          {participants.map((p) => {
            const readAt = readsById.get(p.id);
            return (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-[0.9375rem]">
                <span className="font-medium text-ink">{p.name}</span>
                {p.simulated ? <SimulatedTag /> : null}
                <span className="text-muted">{p.roleLabel ?? p.role}</span>
                <span className="text-muted">{p.organisation}</span>
                <span className="ml-auto flex items-baseline gap-x-3 text-[0.8125rem] text-muted">
                  <span>{p.status}</span>
                  <Mono className="text-[0.75rem]">{readAt ? `read ${formatDateTime(readAt)}` : "not yet opened"}</Mono>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </header>
  );
}
