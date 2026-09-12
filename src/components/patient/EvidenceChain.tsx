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
    <ol className="-mx-6 -my-5 divide-y divide-line">
      {signals.map((s) => (
        <li key={s.id} className="px-6">
          <Drawer
            summary={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[15px] font-semibold text-ink">{s.label}</span>
                <FamilyChip family={s.family} />
                <Mono className="ml-auto text-faint">{s.id}</Mono>
              </span>
            }
          >
            <div className="flex flex-col gap-2 rounded-md border-l-[3px] border-cairn-400 bg-primary-soft px-4 py-3">
              <p className="prose-clinical text-[15px] leading-relaxed text-ink">{s.evidence}</p>
              <p className="text-[12px] leading-5 text-faint tnum">
                Shaped after <span className="text-muted">{s.basis}</span>
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
