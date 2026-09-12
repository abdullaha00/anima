import { INDICATORS } from "@/lib/scoring/catalogue";
import { AUDIENCE_FIELDS, AUDIENCE_LABELS, AUDIENCES } from "@/lib/record/audiences";
import { fieldLabel } from "@/lib/record/fields";
import { getPatients } from "@/lib/data/source";
import { Microlabel, Mono, Panel } from "@/components/ui";
import { COMPARATOR_LINE } from "@/lib/copy";

export const dynamic = "force-dynamic";

/** The tables a judge can be shown: the indicator catalogue and the audience allowlists. */
export default async function AboutPage() {
  const { meta } = await getPatients();
  return (
    <div className="flex flex-col gap-6">
      <header className="max-w-[65ch]">
        <h1 className="font-display text-[1.75rem] font-medium leading-tight tracking-tight">How Cairn works</h1>
        <p className="prose-clinical mt-2 text-muted">
          Cairn reads the record and reports which recognised indicators of deteriorating health are present,
          with the record entry behind each one. It then convenes the people who need to be part of the
          decision, each with a reason traced to the record, and turns what they agree into a structured
          record that a named clinician signs. It never scores a person, cannot sign, and shares nothing
          unsigned.
        </p>
      </header>

      <Panel title="The indicator catalogue" aside="one editable table, src/lib/scoring/catalogue.ts">
        <p className="prose-clinical mb-4 text-[0.9375rem] text-muted">
          Shaped after SPICT and the GSF guidance, which are review prompts rather than validated
          individual-level tools. Reference rules are a direct port of the Python reference. Adapted rules
          read the fields this data source actually carries and are pending clinical sign-off.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.875rem]">
            <thead>
              <tr className="text-left">
                <th className="microlabel py-2 pr-4 font-medium">Code</th>
                <th className="microlabel py-2 pr-4 font-medium">Indicator</th>
                <th className="microlabel py-2 pr-4 font-medium">Family</th>
                <th className="microlabel py-2 pr-4 font-medium">Threshold</th>
                <th className="microlabel py-2 pr-4 font-medium">Shaped after</th>
                <th className="microlabel py-2 font-medium">Provenance</th>
              </tr>
            </thead>
            <tbody>
              {INDICATORS.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="py-2 pr-4">
                    <Mono>{r.id}</Mono>
                  </td>
                  <td className="py-2 pr-4">{r.label}</td>
                  <td className="py-2 pr-4 text-muted">{r.family}</td>
                  <td className="py-2 pr-4 text-muted">{r.threshold}</td>
                  <td className="py-2 pr-4 text-muted">{r.basis}</td>
                  <td className="py-2 text-muted">
                    {r.provenance}
                    {!r.enabled ? ", switched off" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Who sees what once a clinician signs" aside="field-level allowlists, src/lib/record/audiences.ts">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map((a) => {
            const fields = AUDIENCE_FIELDS[a];
            return (
              <div key={a} className="flex flex-col gap-1">
                <Microlabel>{AUDIENCE_LABELS[a]}</Microlabel>
                {fields === "all" ? (
                  <p className="text-[0.9375rem]">The full record</p>
                ) : (
                  <ul className="text-[0.9375rem] leading-6">
                    {fields.map((f) => (
                      <li key={f}>{fieldLabel(f)}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="The data behind this demonstration">
        <ul className="prose-clinical list-disc pl-5 text-[0.9375rem] leading-6 text-muted">
          <li>
            Snapshot taken {meta.takenAt ? new Date(meta.takenAt).toLocaleString("en-GB") : "not yet"} from{" "}
            {meta.baseUrl}. {meta.patientCount.toLocaleString("en-GB")} directory rows,{" "}
            {meta.fullRecordCount.toLocaleString("en-GB")} full records.
          </li>
          {meta.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          <li>{COMPARATOR_LINE}</li>
          <li>Participant replies in the coordination thread are simulated and marked as such.</li>
        </ul>
      </Panel>
    </div>
  );
}
