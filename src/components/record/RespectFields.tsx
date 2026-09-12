import type { CairnRecord, Patient, RecordFieldName } from "@/lib/domain/types";
import type { RecordReview } from "@/lib/stage2/read";
import {
  CAPACITY_OPTIONS,
  CPR_OPTIONS,
  ESCALATION_OPTIONS,
  FORM_GROUPS,
  RECORD_FIELDS,
  type RecordFieldDef,
  type RecordFieldGroup,
} from "@/lib/record/fields";
import { draftFor } from "@/lib/record/drafts";
import { Disclosure, Panel } from "@/components/ui";
import { FieldEntryForm, type FieldEntryKind } from "./FieldEntryForm";

/** The three ReSPECT sections on the form: anchor, title and the line under it. */
const SECTION: Record<Exclude<RecordFieldGroup, "other">, { id: string; title: string; intro: string }> = {
  "what matters": {
    id: "matters",
    title: "What matters to the patient",
    intro: "Their words come first. Set in the voice face, quoted, never paraphrased.",
  },
  "clinical context": {
    id: "clinical",
    title: "Clinical context",
    intro: "The picture a colleague needs before reading the recommendations.",
  },
  "emergency care": {
    id: "emergency",
    title: "Recommendations for emergency care",
    intro: "Recommendations, not legally binding. Clinical judgement applies. This is not a DNACPR form.",
  },
};

const VOICE_FIELDS: RecordFieldName[] = ["what_matters", "concerns_and_fears"];

/** A rationale field is rendered under its decision, not as a row of its own. */
const RATIONALE_OF: Partial<Record<RecordFieldName, RecordFieldName>> = {
  cpr_recommendation: "cpr_rationale",
  escalation_ceiling: "escalation_rationale",
};
const RATIONALE_FIELDS = new Set(Object.values(RATIONALE_OF));

function entryKind(name: RecordFieldName): { kind: FieldEntryKind; options?: readonly string[] } {
  switch (name) {
    case "capacity_assessment":
      return { kind: "select", options: CAPACITY_OPTIONS };
    case "escalation_ceiling":
      return { kind: "select", options: ESCALATION_OPTIONS };
    case "cpr_recommendation":
      return { kind: "segmented", options: CPR_OPTIONS };
    default:
      return { kind: "text" };
  }
}

interface FieldProps {
  def: RecordFieldDef;
  record: CairnRecord;
  patient: Patient;
  review?: RecordReview;
  nowIso: string;
  locked: boolean;
  /** True for a rationale rendered under its decision. */
  nested?: boolean;
}

/**
 * One field: label, description, then either the recorded value or the entry control.
 * Cairn's draft, where there is one, is prefilled and named as a draft; the clinician
 * confirms or changes it. Nothing is written until they do. A recorded value on an unsigned
 * record keeps a quiet Edit that reopens the same form, prefilled. Provenance is carried on
 * the entry and shown to recipients, not on the form.
 */
function Field({ def: f, record, patient, review, nowIso, locked, nested = false }: FieldProps) {
  const entry = record.fields[f.name];
  const serif = VOICE_FIELDS.includes(f.name);
  const { kind, options } = entryKind(f.name);
  const draft = !locked && !entry ? draftFor(f.name, patient, review?.assessment, { runId: review?.runId, nowIso }) : undefined;

  const draftNote = draft
    ? kind === "text"
      ? "Drafted by Cairn. Edit, then record."
      : "Cairn pre-selected this. Confirm or change it."
    : undefined;
  const buttonLabel = kind === "segmented" ? "Confirm CPR recommendation" : undefined;

  return (
    <div
      id={`field-${f.name}`}
      className={`flex scroll-mt-[112px] flex-col gap-1 ${nested ? "mt-4 border-l-2 border-line pl-4" : "py-5 first:pt-0 last:pb-0"}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="text-[12px] font-semibold leading-5 text-muted">{nested ? "Rationale" : f.label}</h3>
        {f.required ? <span className="text-[12px] leading-5 text-muted">required</span> : null}
      </div>
      {f.description ? <p className="text-[12px] leading-5 text-faint">{f.description}</p> : null}

      {entry ? (
        <div className="mt-2 flex flex-col gap-1">
          <p className={serif ? "prose-clinical font-voice text-[20px] leading-[1.4] text-ink" : "prose-clinical text-[15px] leading-6 text-ink"}>
            {serif ? <>&ldquo;{entry.value}&rdquo;</> : entry.value}
          </p>
          {!locked ? (
            <Disclosure label="Edit" className="mt-1">
              <FieldEntryForm
                patientId={record.patientId}
                field={f.name}
                label={f.label}
                kind={kind}
                options={options}
                defaultSource={entry.source}
                defaultValue={entry.value}
                buttonLabel={buttonLabel}
                serif={serif}
              />
            </Disclosure>
          ) : null}
        </div>
      ) : locked ? (
        <p className="mt-2 text-[15px] leading-6 text-muted">not recorded</p>
      ) : (
        <FieldEntryForm
          patientId={record.patientId}
          field={f.name}
          label={f.label}
          kind={kind}
          options={options}
          defaultSource={draft?.source}
          defaultValue={draft?.value ?? (kind === "segmented" ? "No recorded decision" : "")}
          draftNote={draftNote}
          buttonLabel={buttonLabel}
          serif={serif}
        />
      )}
    </div>
  );
}

/**
 * The ReSPECT form: three sections, one panel each, fields separated by hairlines. While
 * the record is unsigned each field can be recorded and then edited; once signed, values only.
 */
export function RespectFields({
  record,
  patient,
  review,
  nowIso,
  locked,
}: {
  record: CairnRecord;
  patient: Patient;
  review?: RecordReview;
  nowIso: string;
  /** True once signed: fields are read-only and no entry form is offered. */
  locked: boolean;
}) {
  return (
    <>
      {FORM_GROUPS.map((group) => {
        if (group === "other") return null;
        const meta = SECTION[group];
        const fields = RECORD_FIELDS.filter((f) => f.group === group);
        const shared = { record, patient, review, nowIso, locked };
        return (
          <section key={group} id={meta.id} aria-labelledby={`${meta.id}-heading`} className="scroll-mt-[112px]">
            <Panel as="div" heading="h2" title={<span id={`${meta.id}-heading`}>{meta.title}</span>}>
              <div className="mb-2 border-b border-line pb-4">
                <p className="text-[13px] font-medium leading-5 text-secondary">{meta.intro}</p>
              </div>
              <div className="flex flex-col divide-y divide-line">
                {fields
                  .filter((f) => !RATIONALE_FIELDS.has(f.name))
                  .map((f) => {
                    const rationaleName = RATIONALE_OF[f.name];
                    const rationale = rationaleName ? fields.find((r) => r.name === rationaleName) : undefined;
                    return (
                      <div key={f.name} className="py-5 first:pt-0 last:pb-0">
                        <Field def={f} {...shared} />
                        {rationale ? <Field def={rationale} {...shared} nested /> : null}
                      </div>
                    );
                  })}
              </div>
            </Panel>
          </section>
        );
      })}
    </>
  );
}
