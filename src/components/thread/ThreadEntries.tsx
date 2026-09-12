import type { CaseState, CoordinationThread, ThreadMessage } from "@/lib/domain/types";
import { fieldLabel } from "@/lib/record/fields";
import { Chip, EmptyLine, SimulatedTag } from "@/components/ui";
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
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={`text-[15px] leading-6 ${a.system ? "font-medium text-muted" : "font-bold text-ink"}`}>{a.name}</span>
      {simulated && !a.system ? <SimulatedTag /> : null}
      {a.role || a.organisation ? (
        <span className="text-[13px] font-medium leading-5 text-secondary">
          {[a.role, a.organisation].filter(Boolean).join(" · ")}
        </span>
      ) : null}
    </span>
  );
}

function Entry({ caseState, m, reply = false }: { caseState: CaseState; m: ThreadMessage; reply?: boolean }) {
  const isProposal = m.kind === "proposal";
  const isSystem = m.kind === "system";
  const label = reply ? REPLY_LABEL[m.kind] : m.kind === "action" ? "action" : m.kind === "concern" ? "raises a concern" : undefined;

  return (
    <article
      className={`grid gap-x-5 gap-y-1 sm:grid-cols-[9.5rem_minmax(0,1fr)] ${
        isProposal ? "border-l-[3px] border-cairn-400 pl-4" : ""
      }`}
      aria-label={`${m.kind} from ${resolveAuthor(caseState, m.authorId).name}`}
    >
      <span className="pt-1 font-mono text-[12px] leading-5 text-faint tnum">{formatDateTime(m.at)}</span>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Author caseState={caseState} m={m} />
          {label ? (
            <span
              className={`text-[13px] font-medium ${
                m.kind === "concern" ? "text-ink" : m.kind === "agreement" ? "text-affirm" : "text-secondary"
              }`}
            >
              {label}
            </span>
          ) : null}
          {isProposal ? <span className="text-[13px] font-semibold text-primary">proposal</span> : null}
        </div>

        {isProposal && m.proposes ? (
          <div className="rounded-md bg-surface-2 px-4 py-3">
            <p className="microlabel">Proposes for the record</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px] leading-6">
              <span className="font-medium text-ink">{fieldLabel(m.proposes.field)}</span>
              <span className="text-muted">→</span>
              <span className="font-voice text-[17px] text-ink">{m.proposes.value}</span>
              {m.promotedToRecord ? (
                <Chip className="ml-1 border-affirm-border bg-affirm-soft text-affirm">promoted into the record</Chip>
              ) : null}
            </p>
          </div>
        ) : null}

        <p className={`prose-clinical text-[15px] leading-6 ${isSystem ? "text-muted" : "text-ink"}`}>{m.body}</p>

        {m.approvedBy ? (
          <p className="font-mono text-[12px] leading-5 text-faint">written or approved by {m.approvedBy}</p>
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
        <li key={top.id} className="py-5 first:pt-0 last:pb-0">
          <Entry caseState={caseState} m={top} />
          {replies.length ? (
            <ol className="mt-4 flex flex-col gap-4 border-l border-line pl-4 sm:ml-[calc(9.5rem+1.25rem)] sm:pl-5">
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
