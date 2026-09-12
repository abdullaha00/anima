import type { CairnRecord, RecordEntry } from "@/lib/domain/types";
import { RECORD_FIELDS, type RecordFieldDef } from "@/lib/record/fields";
import { ProvenanceLine } from "@/components/ui";
import { FieldEntryForm } from "./FieldEntryForm";

const GROUPS: RecordFieldDef["group"][] = ["the person", "clinical recommendations", "capacity and representation"];

function hasProvenance(e: RecordEntry): boolean {
  return Boolean(e.value && e.source && e.recordedBy);
}

/**
 * The record, grouped and in order. The person's words come first and are set in the
 * serif. Every present field carries its provenance line; an entry without one is marked,
 * because it blocks signing. A missing field says so and says what is needed.
 */
export function RecordFields({
  record,
  patientId,
  defaultSource,
  locked,
}: {
  record: CairnRecord;
  patientId: string;
  defaultSource: string;
  /** True once signed: fields are read-only and no entry form is offered. */
  locked: boolean;
}) {
  return (
    <div className="flex flex-col gap-10">
      {GROUPS.map((group) => (
        <section key={group} aria-labelledby={`group-${group.replace(/\s+/g, "-")}`} className="flex flex-col gap-6">
          <h3
            id={`group-${group.replace(/\s+/g, "-")}`}
            className="microlabel border-b border-line pb-2 text-ink"
          >
            {group}
          </h3>
          {RECORD_FIELDS.filter((f) => f.group === group).map((f) => {
            const entry = record.fields[f.name];
            const serif = f.group === "the person";
            const unsourced = entry !== undefined && !hasProvenance(entry);
            return (
              <div key={f.name} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h4 className="text-[1rem] font-medium leading-6">{f.label}</h4>
                  {f.required ? (
                    <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted">required</span>
                  ) : null}
                </div>
                <p className="text-[0.8125rem] leading-5 text-muted">{f.description}</p>

                {entry ? (
                  <div className="mt-1 flex flex-col gap-1">
                    <p
                      className={
                        serif
                          ? "prose-clinical font-voice text-[1.25rem] leading-[1.45] text-ink"
                          : "prose-clinical text-[0.9375rem] leading-6 text-ink"
                      }
                    >
                      {serif ? <>&ldquo;{entry.value}&rdquo;</> : entry.value}
                    </p>
                    {unsourced ? (
                      <p className="font-mono text-[0.75rem] leading-5 text-refuse">no provenance: blocks signing</p>
                    ) : (
                      <ProvenanceLine recordedBy={entry.recordedBy} recordedAt={entry.recordedAt} source={entry.source} />
                    )}
                    {unsourced && !locked ? (
                      <FieldEntryForm
                        patientId={patientId}
                        field={f.name}
                        label={f.label}
                        defaultSource={defaultSource}
                        defaultValue={entry.value}
                        serif={serif}
                      />
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-1 flex flex-col gap-1">
                    <p className="text-[0.9375rem] leading-6 text-muted italic">
                      not recorded{f.required ? ", and required before signature" : ""}
                    </p>
                    {!locked ? (
                      <FieldEntryForm
                        patientId={patientId}
                        field={f.name}
                        label={f.label}
                        defaultSource={defaultSource}
                        serif={serif}
                      />
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
