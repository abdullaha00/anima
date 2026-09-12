import type { Patient } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";
import { LabelValue, Mono, Panel } from "@/components/ui";

const NOT_CARRIED = "not carried by this record source";

/**
 * Personal details, read-only, from the patient record. Anything the source does not carry
 * says so in words. Never a placeholder value: a plausible-looking blank is worse than a gap.
 */
export function RecordPersonalDetails({ patient }: { patient: Patient }) {
  const gp = [patient.usualGp, patient.practice].filter(Boolean).join(", ");
  return (
    <section id="details" aria-labelledby="details-heading" className="scroll-mt-[112px]">
      <Panel as="div" heading="h2" title={<span id="details-heading">Personal details</span>}>
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <LabelValue label="Full name">{patient.name ?? <span className="text-muted">name not recorded</span>}</LabelValue>
          <LabelValue label="Date of birth">
            <span className="tnum">{formatDate(patient.birthDate)}</span>
          </LabelValue>
          <LabelValue label="Age">
            {patient.age !== undefined ? <span className="tnum">{patient.age}</span> : <span className="text-muted">age not recorded</span>}
          </LabelValue>
          <LabelValue label="NHS number">
            <span className="text-muted">{NOT_CARRIED}</span>
          </LabelValue>
          <LabelValue label="Address">
            <span className="text-muted">{NOT_CARRIED}</span>
          </LabelValue>
          <LabelValue label="GP">{gp || <span className="text-muted">GP not recorded</span>}</LabelValue>
        </dl>
        <p className="mt-5 border-t border-line pt-3 text-[12px] leading-5 text-faint">
          Auto-filled from the patient record. <Mono className="text-faint">{patient.id}</Mono>
        </p>
      </Panel>
    </section>
  );
}
