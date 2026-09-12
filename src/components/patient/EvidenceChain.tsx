import type { Signal } from "@/lib/domain/types";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyLine, Mono } from "@/components/ui";
import { formatDate } from "@/lib/format";

/**
 * The evidence chain: every indicator opens like a drawer to show the record entry that
 * fired it, the tool it is shaped after, and when it was recorded. Content is in the DOM
 * already; nothing is fetched on open.
 */
export function EvidenceChain({ signals }: { signals: Signal[] }) {
  if (!signals.length) {
    return <EmptyLine>No recognised indicators are present in this record.</EmptyLine>;
  }
  return (
    <ol className="divide-y divide-line border-y border-line">
      {signals.map((s) => (
        <li key={s.id}>
          <Drawer
            summary={
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[1rem] font-medium text-ink">{s.label}</span>
                <span className="text-[0.8125rem] text-muted">{s.family}</span>
                <Mono className="ml-auto text-muted">{s.id}</Mono>
              </span>
            }
          >
            <div className="flex flex-col gap-2">
              <p className="prose-clinical text-[0.9375rem] text-ink">{s.evidence}</p>
              <p className="font-mono text-[0.75rem] leading-5 text-muted">
                shaped after: {s.basis}
                <br />
                recorded: {s.recordedAt ? formatDate(s.recordedAt) : "date not carried by this entry"}
              </p>
            </div>
          </Drawer>
        </li>
      ))}
    </ol>
  );
}
