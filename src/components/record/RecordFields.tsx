import type { CairnRecord, RecordEntry } from "@/lib/domain/types";
import { RECORD_FIELDS, type RecordFieldDef } from "@/lib/record/fields";
import { Panel, ProvenanceLine } from "@/components/ui";
import { FieldEntryForm } from "./FieldEntryForm";

const GROUPS: RecordFieldDef["group"][] = ["the person", "clinical recommendations", "capacity and representation"];

function hasProvenance(e: RecordEntry): boolean {
  return Boolean(e.value && e.source && e.recordedBy);
}

/**
 * The record, grouped and in order. The person's words come first and are set in the
 * voice face. Every present field carries its provenance line; an entry without one is
 * marked, because it blocks signing. A missing field says so and says what is needed.
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
    <div className="flex flex-col gap-6">
      {GROUPS.map((group) => (
        <Panel key={group} as="div">
          <section aria-labelledby={`group-${group.replace(/\s+/g, "-")}`}>
            <h3
              id={`group-${group.replace(/\s+/g, "-")}`}
              className="mb-2 border-b border-line pb-4 text-[18px] font-semibold leading-tight first-letter:uppercase tracking-[-0.01em] text-ink"
            >
              {group}
            </h3>
            <div className="flex flex-col divide-y divide-line">
              {RECORD_FIELDS.filter((f) => f.group === group).map((f) => {
                const entry = record.fields[f.name];
                const serif = f.group === "the person";
                const unsourced = entry !== undefined && !hasProvenance(entry);
                return (
                  <div key={f.name} className="flex flex-col gap-1 py-5 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <h4 className="text-[13px] font-semibold leading-5 text-ink">{f.label}</h4>
                      {f.required ? (
                        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">required</span>
                      ) : null}
                    </div>
                    <p className="text-[12px] leading-5 text-faint">{f.description}</p>

                    {entry ? (
                      <div className="mt-2 flex flex-col gap-1">
                        <p
                          className={
                            serif
                              ? "prose-clinical font-voice text-[20px] leading-[1.4] text-ink"
                              : "prose-clinical text-[15px] leading-6 text-ink"
                          }
                        >
                          {serif ? <>&ldquo;{entry.value}&rdquo;</> : entry.value}
                        </p>
                        {unsourced ? (
                          <p className="font-mono text-[12px] leading-5 text-refuse">no provenance: blocks signing</p>
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
                      <div className="mt-2 flex flex-col gap-1">
                        <p className="text-[15px] leading-6 text-muted">
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
            </div>
          </section>
        </Panel>
      ))}
    </div>
  );
}
