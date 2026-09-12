import type { CaseState, CoordinationThread, ThreadMessage } from "@/lib/domain/types";
import { fieldLabel } from "@/lib/record/fields";
import { EmptyLine, Mono, SimulatedTag } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { resolveAuthor } from "./authors";

/**
 * The thread as a clinical record with contributions: one column, a time in mono on the
 * left, the author with role and organisation as prominent as the name, then the body.
 * A proposal looks different from a remark. Agreements and concerns attach to the
 * proposal they answer. Nothing here is a bubble.
 */

interface Grouped {
  top: ThreadMessage;
  replies: ThreadMessage[];
}

/** Top-level entries in time order, with replies grouped under their top-level ancestor. */
function group(messages: ThreadMessage[]): Grouped[] {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const rootOf = (m: ThreadMessage): ThreadMessage => {
    let current = m;
    const seen = new Set<string>();
    while (current.inReplyTo && byId.has(current.inReplyTo) && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.inReplyTo)!;
    }
    return current;
  };
  const groups: Grouped[] = [];
  const groupByRoot = new Map<string, Grouped>();
  const sorted = [...messages].sort((a, b) => a.at.localeCompare(b.at));
  for (const m of sorted) {
    const root = rootOf(m);
    if (root.id === m.id) {
      const g: Grouped = { top: m, replies: [] };
      groups.push(g);
      groupByRoot.set(m.id, g);
    } else {
      const g = groupByRoot.get(root.id);
      if (g) g.replies.push(m);
      else groups.push({ top: m, replies: [] });
    }
  }
  return groups;
}

const REPLY_LABEL: Partial<Record<ThreadMessage["kind"], string>> = {
  agreement: "agrees",
  concern: "raises a concern",
  action: "action",
  message: "replies",
};

function Author({ caseState, m }: { caseState: CaseState; m: ThreadMessage }) {
  const a = resolveAuthor(caseState, m.authorId);
  const simulated = m.simulated === true || a.simulated;
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className={`text-[0.9375rem] ${a.system ? "text-muted" : "font-medium text-ink"}`}>{a.name}</span>
      {simulated && !a.system ? <SimulatedTag /> : null}
      {a.role ? <span className="text-[0.9375rem] text-muted">{a.role}</span> : null}
      {a.organisation ? <span className="text-[0.9375rem] text-muted">{a.organisation}</span> : null}
    </span>
  );
}

function Entry({ caseState, m, reply = false }: { caseState: CaseState; m: ThreadMessage; reply?: boolean }) {
  const isProposal = m.kind === "proposal";
  const isSystem = m.kind === "system";
  const label = reply ? REPLY_LABEL[m.kind] : m.kind === "action" ? "action" : m.kind === "concern" ? "raises a concern" : undefined;

  return (
    <article
      className={`grid gap-x-4 gap-y-1 sm:grid-cols-[9.5rem_minmax(0,1fr)] ${
        isProposal ? "border-l-2 border-primary pl-4 sm:-ml-[calc(1rem+2px)]" : ""
      }`}
      aria-label={`${m.kind} from ${resolveAuthor(caseState, m.authorId).name}`}
    >
      <Mono className="pt-0.5 text-[0.75rem] leading-5 text-muted tnum">{formatDateTime(m.at)}</Mono>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <Author caseState={caseState} m={m} />
          {label ? (
            <span
              className={`text-[0.8125rem] ${
                m.kind === "concern" ? "font-medium text-ink" : m.kind === "agreement" ? "text-affirm" : "text-muted"
              }`}
            >
              {label}
            </span>
          ) : null}
          {isProposal ? <span className="text-[0.8125rem] font-medium text-primary">proposal</span> : null}
        </div>

        {isProposal && m.proposes ? (
          <div className="rounded-md bg-primary-soft px-3 py-2 text-[0.9375rem] leading-6">
            <span className="text-muted">Proposes for the record: </span>
            <span className="font-medium text-ink">{fieldLabel(m.proposes.field)}</span>
            <span className="text-muted"> → </span>
            <span className="font-voice text-[1.0625rem] text-ink">{m.proposes.value}</span>
            {m.promotedToRecord ? (
              <Mono className="ml-3 rounded-md border border-affirm/50 bg-affirm-soft px-1.5 py-px text-[0.6875rem] text-affirm">
                promoted into the record
              </Mono>
            ) : null}
          </div>
        ) : null}

        <p className={`prose-clinical text-[0.9375rem] ${isSystem ? "italic text-muted" : "text-ink"}`}>{m.body}</p>

        {m.approvedBy ? (
          <Mono className="text-[0.75rem] text-muted">written or approved by {m.approvedBy}</Mono>
        ) : null}
      </div>
    </article>
  );
}

export function ThreadEntries({ thread, caseState }: { thread: CoordinationThread; caseState: CaseState }) {
  if (!thread.messages.length) {
    return <EmptyLine>No entries yet. The thread is open; add the first contribution below.</EmptyLine>;
  }
  const groups = group(thread.messages);
  return (
    <ol className="flex flex-col divide-y divide-line">
      {groups.map(({ top, replies }) => (
        <li key={top.id} className="py-4">
          <Entry caseState={caseState} m={top} />
          {replies.length ? (
            <ol className="mt-3 flex flex-col gap-3 border-l border-line pl-4 sm:ml-[9.5rem] sm:pl-5">
              {replies.map((r) => (
                <li key={r.id}>
                  <Entry caseState={caseState} m={r} reply />
                </li>
              ))}
            </ol>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
