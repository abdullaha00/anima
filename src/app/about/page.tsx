import { INDICATORS } from "@/lib/scoring/catalogue";
import { AUDIENCE_FIELDS, AUDIENCE_LABELS, AUDIENCES } from "@/lib/record/audiences";
import { fieldLabel } from "@/lib/record/fields";
import { getPatients } from "@/lib/data/source";
import { Microlabel, Mono, PageHeader, Panel } from "@/components/ui";
import { COMPARATOR_LINE } from "@/lib/copy";

export const dynamic = "force-dynamic";

const TH = "microlabel border-b-2 border-line px-3 py-2.5 text-left font-semibold";
const TD = "border-b border-line px-3 py-2.5 text-[13px] leading-5 align-top";

/** The tables a judge can be shown: the indicator catalogue and the audience allowlists. */
export default async function AboutPage() {
  const { meta } = await getPatients();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="How Cairn works"
        intro={
          <>
            Cairn reads the record and reports which recognised indicators of deteriorating health are present,
            with the record entry behind each one. It then convenes the people who need to be part of the
            decision, each with a reason traced to the record, and turns what they agree into a structured
            record that a named clinician signs. It never scores a person, cannot sign, and shares nothing
            unsigned.
          </>
        }
      />

      <Panel title="The indicator catalogue" aside="one editable table, src/lib/scoring/catalogue.ts">
        <p className="prose-clinical mb-5 text-[13px] font-medium leading-5 text-secondary">
          Shaped after SPICT and the GSF guidance, which are review prompts rather than validated
          individual-level tools. Reference rules are a direct port of the Python reference. Adapted rules
          read the fields this data source actually carries and are pending clinical sign-off.
        </p>
        <div className="-mx-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Code</th>
                <th className={TH}>Indicator</th>
                <th className={TH}>Family</th>
                <th className={TH}>Threshold</th>
                <th className={TH}>Shaped after</th>
                <th className={TH}>Provenance</th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {INDICATORS.map((r) => (
                <tr key={r.id}>
                  <td className={`${TD} whitespace-nowrap`}>
                    <Mono>{r.id}</Mono>
                  </td>
                  <td className={`${TD} font-medium text-ink`}>{r.label}</td>
                  <td className={`${TD} text-secondary`}>{r.family}</td>
                  <td className={`${TD} text-secondary tnum`}>{r.threshold}</td>
                  <td className={`${TD} text-secondary`}>{r.basis}</td>
                  <td className={`${TD} text-secondary`}>
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map((a) => {
            const fields = AUDIENCE_FIELDS[a];
            return (
              <div key={a} className="flex flex-col gap-2">
                <Microlabel>{AUDIENCE_LABELS[a]}</Microlabel>
                {fields === "all" ? (
                  <p className="text-[15px] leading-6 text-ink">The full record</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line text-[15px] leading-6 text-ink">
                    {fields.map((f) => (
                      <li key={f} className="py-1">
                        {fieldLabel(f)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="The data behind this demonstration">
        <ul className="prose-clinical flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-6 text-secondary">
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
