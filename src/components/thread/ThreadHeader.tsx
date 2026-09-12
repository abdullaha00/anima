import type { CaseState, CoordinationThread } from "@/lib/domain/types";
import { Chip, Microlabel, Panel, SimulatedTag } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

/**
 * The stated purpose in the voice face, who opened it and when in mono, then the closed
 * participant list with response state and read receipts. The read receipts are a
 * coordination feature and the audit trail at once.
 */
export function ThreadHeader({ thread, caseState }: { thread: CoordinationThread; caseState: CaseState }) {
  const readsById = new Map(thread.reads.map((r) => [r.participantId, r.at]));
  const participants = thread.participantIds
    .map((pid) => caseState.participants.find((p) => p.id === pid))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  return (
    <Panel as="div">
      <header className="flex flex-col gap-6">
        <div>
          <p className="prose-clinical font-voice text-[20px] leading-[1.4] text-ink">Purpose: {thread.purpose}</p>
          <p className="mt-2 font-mono text-[12px] leading-5 text-faint tnum">
            opened by {thread.openedBy} on {formatDateTime(thread.openedAt)} · {thread.id}
            {thread.closedAt ? ` · closed ${formatDateTime(thread.closedAt)}` : ""}
          </p>
        </div>

        <div className="border-t border-line pt-5">
          <Microlabel className="mb-3">
            Participants, {participants.length} · closed list
          </Microlabel>
          <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {participants.map((p) => {
              const readAt = readsById.get(p.id);
              return (
                <li key={p.id} className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[15px] font-semibold leading-6 text-ink">{p.name}</span>
                    {p.simulated ? <SimulatedTag /> : null}
                  </span>
                  <span className="text-[13px] font-medium leading-5 text-secondary">
                    {p.roleLabel ?? p.role} · {p.organisation}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <Chip>{p.status}</Chip>
                    <span className="text-[12px] leading-5 text-faint tnum">
                      {readAt ? `read ${formatDateTime(readAt)}` : "not yet opened"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </header>
    </Panel>
  );
}
