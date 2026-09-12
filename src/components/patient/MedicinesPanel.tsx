import { Panel } from "@/components/ui";
import { PagedList, type PagedItem } from "@/components/patient/PagedList";
import { formatDate, plural } from "@/lib/format";
import type { MedicationEntry } from "@/lib/domain/types";

/** The order the details read in, when the record carries them. */
const DETAIL_ORDER: (keyof MedicationEntry)[] = ["dose", "frequency", "route", "form", "quantity", "status"];

const CAVEAT = "Dose and frequency are not carried by this record source.";

function detailLine(entry: MedicationEntry): string | undefined {
  const parts = DETAIL_ORDER.map((field) => entry[field]).filter((value): value is string => typeof value === "string" && value.trim() !== "");
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function isEnded(entry: MedicationEntry): boolean {
  return entry.status === "ended";
}

/** Distinct source labels, in first-seen order, read as one phrase. */
function sourceSentence(entries: MedicationEntry[]): string {
  const sources = [...new Set(entries.map((entry) => entry.source))];
  if (sources.length === 0) return "";
  const list = sources.length === 1 ? sources[0] : `${sources.slice(0, -1).join(", ")} and ${sources[sources.length - 1]}`;
  return `From the ${list}.`;
}

/**
 * The medicines on the record, current ones first, with every structured detail the
 * source carries and a plain line saying what it does not.
 */
export function MedicinesPanel({ medications }: { medications: MedicationEntry[] }) {
  const ordered = [...medications.filter((entry) => !isEnded(entry)), ...medications.filter(isEnded)];
  const items: PagedItem[] = ordered.map((entry, index) => ({
    key: `${entry.sourceId ?? entry.source}-${entry.name}-${index}`,
    meta: entry.at ? formatDate(entry.at) : entry.source,
    primary: entry.name,
    secondary: detailLine(entry),
    detail: entry.note,
  }));
  const carriesDosing = medications.some((entry) => entry.dose || entry.frequency);
  const footer = [sourceSentence(medications), carriesDosing ? undefined : CAVEAT].filter(Boolean).join(" ");

  return (
    <Panel title="Medicines" aside={plural(medications.length, "item")}>
      <PagedList items={items} empty="No medicines on the record." />
      {medications.length > 0 ? <p className="mt-3 text-[12px] leading-5 text-faint">{footer}</p> : null}
    </Panel>
  );
}
