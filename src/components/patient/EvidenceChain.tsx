import type { Signal } from "@/lib/domain/types";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyLine, FamilyChip, Mono } from "@/components/ui";
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
    <ol className="divide-y divide-line">
      {signals.map((s, i) => (
        <li key={s.id}>
          <Drawer
            defaultOpen={i === 0}
            summary={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[15px] font-semibold text-ink">{s.label}</span>
                <FamilyChip family={s.family} />
              </span>
            }
          >
            <div className="flex flex-col gap-1.5 pb-2 pr-4">
              <p className="prose-clinical text-[15px] leading-relaxed text-ink">{s.evidence}</p>
              <p className="font-mono text-[12px] leading-5 text-faint tnum">
                Shaped after <span className="text-muted">{s.basis}</span> <Mono className="ml-1 text-faint">{s.id}</Mono>
                <br />
                Recorded {s.recordedAt ? formatDate(s.recordedAt) : "date not carried by this entry"}
              </p>
            </div>
          </Drawer>
        </li>
      ))}
    </ol>
  );
}
