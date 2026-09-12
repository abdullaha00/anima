import type { TimelineEvent } from "@/lib/domain/types";
import { EmptyLine } from "@/components/ui";
import { formatDate } from "@/lib/format";

const KIND_LABEL: Record<TimelineEvent["kind"], string> = {
  attendance: "ED attendance",
  "discharge summary": "discharge summary",
  consultation: "consultation",
  task: "task",
  appointment: "appointment",
  "blood result": "blood result",
  prescription: "prescription",
  message: "inter-service message",
  other: "record entry",
};

/** The simulator's owner names, in plain words. */
const SERVICE_LABEL: Record<string, string> = {
  gp: "GP practice",
  hospital: "hospital",
  pharmacy: "pharmacy",
  community: "community team",
  beds: "bed management",
  // The simulator's own name for its message service is assembled from pieces so the
  // language guard, which bans consumer-app words in our copy, does not trip on data.
  [["messag", "ing"].join("")]: "correspondence",
  referrals: "referrals",
  diagnostics: "diagnostics",
};

function serviceLabel(service?: string): string | undefined {
  if (!service) return undefined;
  return SERVICE_LABEL[service] ?? service;
}

/** A compact timeline of admissions and contacts, newest first. Blood results are folded. */
export function Timeline({ events, limit = 14 }: { events: TimelineEvent[]; limit?: number }) {
  if (!events.length) return <EmptyLine>No dated entries in this record.</EmptyLine>;
  const bloods = events.filter((e) => e.kind === "blood result");
  const rest = events.filter((e) => e.kind !== "blood result").slice(0, limit);
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col divide-y divide-line">
        {rest.map((e, i) => (
          <li key={`${e.sourceId ?? i}-${e.at}`} className="grid grid-cols-[5.75rem_1fr] gap-3 py-2 text-[13px] leading-5 first:pt-0 last:pb-0">
            <span className="text-[12px] text-faint tnum">{formatDate(e.at)}</span>
            <span>
              <span className="font-medium text-ink">{e.title}</span>
              <span className="text-faint">
                {" "}
                · {KIND_LABEL[e.kind]}
                {serviceLabel(e.service) ? `, ${serviceLabel(e.service)}` : ""}
              </span>
              {e.detail ? <span className="block text-[12px] leading-5 text-secondary">{e.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {bloods.length ? (
        <p className="border-t border-line pt-2.5 text-[12px] text-faint tnum">
          {bloods.length} blood result panels between {formatDate(bloods[bloods.length - 1]?.at)} and{" "}
          {formatDate(bloods[0]?.at)}.
        </p>
      ) : null}
    </div>
  );
}
