import type { CairnRecord, RecordEntry, RecordFieldName } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";
import { RECORD_FIELDS, type RecordFieldDef } from "@/lib/record/fields";
import { Disclosure, Panel, ProvenanceLine } from "@/components/ui";
import { FieldEntryForm } from "./FieldEntryForm";

const GROUPS: RecordFieldDef["group"][] = ["the person", "clinical recommendations", "capacity and representation"];

function hasProvenance(e: RecordEntry): boolean {
  return Boolean(e.value && e.source && e.recordedBy);
}

/** Who, from what, when: the parts of a provenance line that make two lines the same. */
function provenanceKey(e: RecordEntry): string {
  return `${e.recordedBy}|${e.source}|${formatDateTime(e.recordedAt)}`;
}

/**
 * Where most of a group's fields share one provenance, that line is said once under the
 * heading and only the exceptions keep their own. Returns nothing when no key repeats.
 */
function hoistedProvenance(entries: { name: RecordFieldName; entry: RecordEntry }[]):
  | { key: string; entry: RecordEntry; mixed: boolean }
  | undefined {
  const counts = new Map<string, number>();
  for (const { entry } of entries) {
    const key = provenanceKey(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let commonKey: string | undefined;
  let commonCount = 0;
  for (const [key, count] of counts) {
    if (count > commonCount) {
      commonKey = key;
      commonCount = count;
    }
  }
  if (commonKey === undefined || commonCount < 2) return undefined;
  const first = entries.find(({ entry }) => provenanceKey(entry) === commonKey);
  if (!first) return undefined;
  return { key: commonKey, entry: first.entry, mixed: counts.size > 1 };
}

/**
 * The record, grouped and in order. The person's words come first and are set in the
 * voice face. Every present field carries its provenance; where a group shares one, it is
 * given once under the heading. An entry without provenance is marked, because it blocks
 * signing. A missing field says so and says what is needed.
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
      {GROUPS.map((group) => {
        const fields = RECORD_FIELDS.filter((f) => f.group === group);
        const sourced = fields.flatMap((f) => {
          const entry = record.fields[f.name];
          return entry && hasProvenance(entry) ? [{ name: f.name, entry }] : [];
        });
        const hoisted = hoistedProvenance(sourced);
        const headingId = `group-${group.replace(/\s+/g, "-")}`;
        return (
          <Panel key={group} as="div">
            <section aria-labelledby={headingId}>
              <div className="mb-2 flex flex-col gap-1.5 border-b border-line pb-4">
                <h3
                  id={headingId}
                  className="text-[18px] font-semibold leading-tight first-letter:uppercase tracking-[-0.01em] text-ink"
                >
                  {group}
                </h3>
                {hoisted ? (
                  <div className="flex flex-wrap gap-x-1 text-[12px] leading-5 text-faint tnum">
                    {hoisted.mixed ? <span>Unless noted,</span> : null}
                    <ProvenanceLine
                      recordedBy={hoisted.entry.recordedBy}
                      recordedAt={hoisted.entry.recordedAt}
                      source={hoisted.entry.source}
                    />
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col divide-y divide-line">
                {fields.map((f) => {
                  const entry = record.fields[f.name];
                  const serif = f.group === "the person";
                  const unsourced = entry !== undefined && !hasProvenance(entry);
                  const ownLine = entry !== undefined && !unsourced && (!hoisted || provenanceKey(entry) !== hoisted.key);
                  return (
                    <div key={f.name} id={`field-${f.name}`} className="flex scroll-mt-[112px] flex-col gap-1 py-5 last:pb-0">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <h4 className="text-[12px] font-semibold leading-5 text-muted">{f.label}</h4>
                        {f.required ? <span className="text-[12px] leading-5 text-muted">required</span> : null}
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
                          ) : ownLine ? (
                            <ProvenanceLine recordedBy={entry.recordedBy} recordedAt={entry.recordedAt} source={entry.source} />
                          ) : null}
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
                            <Disclosure label={<><span aria-hidden="true">Record this from the conversation</span><span className="sr-only">Record {f.label} from the conversation</span></>}>
                              <FieldEntryForm
                                patientId={patientId}
                                field={f.name}
                                label={f.label}
                                defaultSource={defaultSource}
                                serif={serif}
                              />
                            </Disclosure>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </Panel>
        );
      })}
    </div>
  );
}
