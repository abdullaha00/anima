import Link from "next/link";
import type { Channel } from "@/lib/domain/types";

const TABS: { channel: Channel; label: string }[] = [
  { channel: "professional", label: "Professional" },
  { channel: "family", label: "Family" },
];

/** Two channels, never one thread. Links, so the tabs work without client JavaScript. */
export function ChannelTabs({ patientId, current }: { patientId: string; current: Channel }) {
  return (
    <nav aria-label="Coordination channel" className="flex gap-x-1 border-b border-line">
      {TABS.map((t) => {
        const active = t.channel === current;
        return (
          <Link
            key={t.channel}
            href={`/patient/${patientId}/thread?channel=${t.channel}`}
            aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold ${
              active ? "border-primary text-primary" : "border-transparent text-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
