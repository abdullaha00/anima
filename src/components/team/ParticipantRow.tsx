import type { ReactNode } from "react";
import type { Participant } from "@/lib/domain/types";
import { removeParticipantForm } from "@/app/actions";
import { CLINICIAN } from "@/lib/copy";
import { Button, Mono, SimulatedTag } from "@/components/ui";

/**
 * The parts of an evidence sentence a clinician checks against the record: indicator codes
 * (GEN_ADMISSIONS, REC_HEART), simulated patient ids (SIM-000001) and record, message and
 * thread ids (r-1234, m-…, t-…). Only these are set in mono; the sentence around them,
 * dates included, stays in the interface sans so it wraps like prose.
 */
const DATA_TOKEN = /(\b[A-Z]{2,4}_[A-Z_]+\b|\bSIM-\d+\b|\b[rmt]-[A-Za-z0-9]+\b)/;

export function EvidenceText({ text }: { text: string }): ReactNode {
  // With one capturing group, split() returns matches at the odd indices.
  return text.split(DATA_TOKEN).map((part, i) =>
    i % 2 === 1 ? (
      <Mono key={i} className="text-secondary">
        {part}
      </Mono>
    ) : (
      part
    ),
  );
}

/**
 * One participant: the name, then role and organisation, then the reason and the evidence
 * underneath. Every row can be checked against the record; nobody is here without a
 * reason. Removal is one quiet button; the signed-in clinician holds the record and stays.
 */
export function ParticipantRow({
  participant: p,
  patientId,
  controls = "none",
}: {
  participant: Participant;
  patientId: string;
  controls?: "full" | "remove" | "none";
}) {
  const holdsRecord = p.id === CLINICIAN.id;
  const canRemove = controls !== "none" && !holdsRecord;

  return (
    <li className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[15px] font-bold leading-6 text-ink">{p.name}</span>
          {p.simulated ? <SimulatedTag /> : null}
        </div>
        <p className="text-[13px] font-medium leading-5 text-secondary">
          {p.roleLabel ?? p.role} · {p.organisation}
        </p>
        <p className="prose-clinical mt-2 text-[14px] leading-6 text-ink">{p.reasonForInclusion}</p>
        <div className="mt-2 flex flex-col gap-0.5">
          <span className="text-[12px] font-semibold leading-5 text-secondary">Evidence</span>
          <p className="prose-clinical max-w-[72ch] break-words text-[13px] leading-5 text-secondary">
            <EvidenceText text={p.evidence} />
            {p.source === "added by clinician" ? <span className="text-faint"> · added by clinician</span> : null}
          </p>
        </div>
      </div>

      {canRemove ? (
        <form action={removeParticipantForm} className="shrink-0 md:pt-0.5">
          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="participantId" value={p.id} />
          <Button type="submit" variant="quiet" className="px-3.5 text-[13px]">
            <span aria-hidden="true">Remove</span>
            <span className="sr-only">Remove {p.name} from the team</span>
          </Button>
        </form>
      ) : null}
    </li>
  );
}
