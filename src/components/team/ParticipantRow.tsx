import type { Participant } from "@/lib/domain/types";
import { removeParticipantForm, setParticipantRequiredForm } from "@/app/actions";
import { CLINICIAN } from "@/lib/copy";
import { Button, Mono, SimulatedTag } from "@/components/ui";
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
    <li className="py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[1rem] font-medium text-ink">{p.name}</span>
        {p.simulated ? <SimulatedTag /> : null}
        <span className="text-[1rem] text-muted">{p.roleLabel ?? p.role}</span>
        <span className="text-[1rem] text-muted">{p.organisation}</span>
        <span className="ml-auto text-[0.8125rem] text-muted">
          {p.required ? "required" : "optional"} · {p.status}
        </span>
      </div>
      <p className="prose-clinical mt-1.5 text-[0.9375rem] text-ink">{p.reasonForInclusion}</p>
      <p className="font-mono text-[0.75rem] leading-5 text-muted">
        evidence: {p.evidence}
        {p.source === "added by clinician" ? " · added by clinician" : ""}
      </p>

      {canToggle || canRemove ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          {canToggle ? (
            <form action={setParticipantRequiredForm}>
              <input type="hidden" name="patientId" value={patientId} />
              <input type="hidden" name="participantId" value={p.id} />
              <input type="hidden" name="required" value={p.required ? "false" : "true"} />
              <Button type="submit" variant="quiet" className="text-[0.875rem]">
                {p.required ? "Mark optional" : "Mark required"}
              </Button>
            </form>
          ) : null}
          {canRemove ? (
            <form action={removeParticipantForm} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="patientId" value={patientId} />
              <input type="hidden" name="participantId" value={p.id} />
              <input
                name="reason"
                aria-label={`Reason for removing ${p.name}, optional`}
                placeholder="reason for removal, optional"
                className={`${INPUT_CLASS} w-64 max-w-full text-[0.875rem]`}
              />
              <Button type="submit" variant="quiet" className="text-[0.875rem]">
                Remove
              </Button>
            </form>
          ) : null}
        </div>
      ) : holdsRecord ? (
        <Mono className="mt-2 block text-muted">signed-in clinician; holds the record</Mono>
      ) : null}
    </li>
  );
}
