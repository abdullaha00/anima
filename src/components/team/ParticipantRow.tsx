import type { ReactNode } from "react";
import type { Participant } from "@/lib/domain/types";
import { removeParticipantForm, setParticipantRequiredForm } from "@/app/actions";
import { CLINICIAN } from "@/lib/copy";
import { Button, Chip, Disclosure, Mono, SimulatedTag } from "@/components/ui";
import { INPUT_CLASS } from "./form-classes";

/**
 * The parts of an evidence sentence a clinician checks against the record: indicator codes
 * (GEN_ADMISSIONS, REC_HEART), simulated patient ids (SIM-000001), record, message and
 * thread ids (r-1234, m-…, t-…) and dates (13 Aug 2026). Only these are set in mono; the
 * sentence around them stays in the interface sans so it wraps like prose.
 */
const DATA_TOKEN =
  /(\b[A-Z]{2,4}_[A-Z_]+\b|\bSIM-\d+\b|\b[rmt]-[A-Za-z0-9]+\b|\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]* \d{4}\b)/;

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
 * One participant: the name, then role and organisation set as prominently as the name,
 * then the reason and the evidence underneath. Every row can be checked against the
 * record; nobody is here without a reason. Removal sits behind a disclosure so the
 * everyday view carries only what a clinician reads.
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
  const canToggle = controls === "full" && !holdsRecord;

  return (
    <li className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[15px] font-bold leading-6 text-ink">{p.name}</span>
          {p.simulated ? <SimulatedTag /> : null}
        </div>
        <p className="text-[13px] font-medium leading-5 text-secondary">
          {p.roleLabel ?? p.role} · {p.organisation}
        </p>
        <p className="prose-clinical mt-2 text-[14px] leading-6 text-ink">{p.reasonForInclusion}</p>
        <p className="prose-clinical text-[13px] leading-5 text-secondary">
          <span className="text-faint">evidence: </span>
          <EvidenceText text={p.evidence} />
          {p.source === "added by clinician" ? <span className="text-faint"> · added by clinician</span> : null}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Chip>{p.required ? "required" : "optional"}</Chip>
          <Chip>{p.status}</Chip>
          {holdsRecord ? <Mono className="ml-1 text-faint">signed-in clinician; holds the record</Mono> : null}
        </div>
      </div>

      {canToggle || canRemove ? (
        <div className="flex shrink-0 flex-col items-stretch gap-1 md:items-end">
          {canToggle ? (
            <form action={setParticipantRequiredForm}>
              <input type="hidden" name="patientId" value={patientId} />
              <input type="hidden" name="participantId" value={p.id} />
              <input type="hidden" name="required" value={p.required ? "false" : "true"} />
              <Button type="submit" variant="quiet" className="w-full px-3.5 text-[13px] md:w-auto">
                {p.required ? "Mark optional" : "Mark required"}
              </Button>
            </form>
          ) : null}
          {canRemove ? (
            <Disclosure label="Remove from the team">
              {/* A sibling of the toggle form above, never nested inside it. */}
              <form action={removeParticipantForm} className="flex flex-wrap items-center gap-2 md:justify-end">
                <input type="hidden" name="patientId" value={patientId} />
                <input type="hidden" name="participantId" value={p.id} />
                <div className="w-64 max-w-full text-[13px]">
                  <input
                    name="reason"
                    aria-label={`Reason for removing ${p.name}, optional`}
                    placeholder="reason for removal, optional"
                    className={INPUT_CLASS}
                  />
                </div>
                <Button type="submit" variant="quiet" className="px-3.5 text-[13px]">
                  Remove
                </Button>
              </form>
            </Disclosure>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
