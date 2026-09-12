import type { CairnRecord } from "@/lib/domain/types";
import { readiness } from "@/lib/record/record";
import { RECORD_FIELDS, fieldLabel } from "@/lib/record/fields";
import { Panel } from "@/components/ui";

/** What still stands between this draft and a signature. Computed from the record itself. */
export function ReadinessPanel({ record }: { record: CairnRecord }) {
  const r = readiness(record);
  const recorded = RECORD_FIELDS.filter((f) => record.fields[f.name] !== undefined).length;
  const signed = record.status === "signed" || record.status === "shared";

  return (
    <Panel
      as="aside"
      title="Readiness"
      aside={
        <span className="tnum">
          {recorded} of {RECORD_FIELDS.length} recorded
        </span>
      }
      className="lg:sticky lg:top-6"
    >
      {signed ? (
        <p className="text-[0.9375rem] leading-6 text-affirm">Signed. The record is complete and immutable.</p>
      ) : r.ready ? (
        <p className="text-[0.9375rem] font-medium leading-6 text-affirm">Ready to sign</p>
      ) : (
        <div className="flex flex-col gap-4">
          {r.missing.length ? (
            <div className="flex flex-col gap-1">
              <span className="microlabel">Required, not yet recorded</span>
              <ul className="flex flex-col gap-1 text-[0.9375rem] leading-6">
                {r.missing.map((f) => (
                  <li key={f}>{fieldLabel(f)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {r.unsourced.length ? (
            <div className="flex flex-col gap-1">
              <span className="microlabel">Recorded without a source</span>
              <ul className="flex flex-col gap-1 text-[0.9375rem] leading-6">
                {r.unsourced.map((f) => (
                  <li key={f}>{fieldLabel(f)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-[0.8125rem] leading-5 text-muted">
            Each field needs a value, a source and a named recorder before a clinician can sign.
          </p>
        </div>
      )}
    </Panel>
  );
}
