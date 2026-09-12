import type { Participant } from "@/lib/domain/types";
import { removeParticipantForm, setParticipantRequiredForm } from "@/app/actions";
import { CLINICIAN } from "@/lib/copy";
import { Button, Chip, Mono, SimulatedTag } from "@/components/ui";
import { INPUT_CLASS } from "./form-classes";

/**
 * One participant: the name, then role and organisation set as prominently as the name,
 * then the reason in the interface sans and the evidence in mono underneath. Every row can
 * be checked against the record; nobody is here without a reason.
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
        <p className="font-mono text-[12px] leading-5 text-faint">
          evidence: {p.evidence}
          {p.source === "added by clinician" ? " · added by clinician" : ""}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Chip>{p.required ? "required" : "optional"}</Chip>
          <Chip>{p.status}</Chip>
          {holdsRecord ? <Mono className="ml-1 text-faint">signed-in clinician; holds the record</Mono> : null}
        </div>
      </div>

      {canToggle || canRemove ? (
        <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-end">
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
            <form action={removeParticipantForm} className="flex flex-wrap items-center gap-2">
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
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
