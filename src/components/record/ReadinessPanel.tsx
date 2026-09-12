import type { CairnRecord } from "@/lib/domain/types";
import { readiness } from "@/lib/record/record";
import { REQUIRED_FIELDS, fieldLabel } from "@/lib/record/fields";

/**
 * One compact line at the top of the signature section: how many required fields are
 * recorded, and a link to each one still missing. Computed from the record itself.
 */
export function ReadinessLine({ record }: { record: CairnRecord }) {
  const r = readiness(record);
  const recorded = REQUIRED_FIELDS.filter((f) => record.fields[f] !== undefined).length;
  const signed = record.status === "signed" || record.status === "shared";

  if (signed) {
    return <p className="text-[14px] font-medium leading-6 text-affirm">Signed. The record is complete and immutable.</p>;
  }

  return (
    <div className="flex flex-col gap-1 text-[14px] leading-6">
      <p className={r.ready ? "font-medium text-affirm" : "text-ink"}>
        <span className="font-semibold tnum">
          {recorded} of {REQUIRED_FIELDS.length}
        </span>{" "}
        required fields recorded{r.ready ? ". Ready to sign." : "."}
      </p>
      {r.missing.length ? (
        <p className="text-[13px] leading-5 text-secondary">
          Still needed:{" "}
          {r.missing.map((f, i) => (
            <span key={f}>
              {i > 0 ? ", " : ""}
              <a href={`#field-${f}`} className="text-primary-hover underline-offset-4 hover:underline">
                {fieldLabel(f)}
              </a>
            </span>
          ))}
          .
        </p>
      ) : null}
      {r.unsourced.length ? (
        <p className="text-[13px] leading-5 text-secondary">
          Recorded without a source:{" "}
          {r.unsourced.map((f, i) => (
            <span key={f}>
              {i > 0 ? ", " : ""}
              <a href={`#field-${f}`} className="text-primary-hover underline-offset-4 hover:underline">
                {fieldLabel(f)}
              </a>
            </span>
          ))}
          .
        </p>
      ) : null}
    </div>
  );
}
