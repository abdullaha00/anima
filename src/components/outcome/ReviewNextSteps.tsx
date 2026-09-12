import type { Participant } from "@/lib/domain/types";
import type { Stage2Assessment } from "@/lib/cairn/types";
import { addNextStepForm } from "@/app/actions";
import { Button, Notice, Panel } from "@/components/ui";
import { Citations, keywords } from "@/components/review/Citations";
import { FIELD_CLASS, INPUT_CLASS, LABEL_CLASS, SELECT_CLASS } from "@/components/team/form-classes";

/**
 * The owner whose role, role label or name best matches the suggested owner. The whole
 * phrase wins; otherwise the head noun ("pharmacist", "nurse", "gp") has to match, so
 * "Community pharmacist" never lands on the community nurse. No match leaves the choice open.
 */
function guessOwner(owners: Participant[], suggested: string): string {
  const fieldsOf = (p: Participant) => [p.roleLabel, p.role, p.name].map((f) => (f ?? "").toLowerCase());
  const phrase = suggested.trim().toLowerCase();
  const whole = owners.find((p) => fieldsOf(p).some((h) => h.length >= 2 && (h.includes(phrase) || phrase.includes(h))));
  if (whole) return whole.id;
  const words = keywords(suggested);
  const head = words[words.length - 1];
  if (!head) return "";
  let best: { id: string; score: number } | undefined;
  for (const p of owners) {
    const hay = fieldsOf(p);
    if (!hay.some((h) => h.includes(head))) continue;
    const score = words.filter((w) => hay.some((h) => h.includes(w))).length;
    if (!best || score > best.score) best = { id: p.id, score };
  }
  return best?.id ?? "";
}

function plusDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Immediate actions the record review suggests, each with a form that records it as a next
 * step with one named owner and a date. Until the outcome is recorded the forms are shown
 * disabled, because next steps belong to the outcome.
 */
export function ReviewNextSteps({
  patientId,
  actions,
  owners,
  nowIso,
  enabled,
}: {
  patientId: string;
  actions: Stage2Assessment["immediateActions"];
  /** Professional participants who can own a next step. Never "the team". */
  owners: Participant[];
  nowIso: string;
  enabled: boolean;
}) {
  if (actions.length === 0) return null;
  const due = plusDays(nowIso, 7);
  return (
    <Panel title="Suggested next steps, from the record review" aside={`${actions.length} suggested`}>
      <div className="flex flex-col gap-5">
        {!enabled ? (
          <Notice kind="quiet">
            Next steps are recorded with the outcome; you can add these once the outcome is recorded.
          </Notice>
        ) : null}
        <ul className="flex flex-col divide-y divide-line">
          {actions.map((a, i) => (
            <li
              key={i}
              className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-6 text-ink">{a.action}</p>
                <p className="text-[13px] font-medium leading-5 text-secondary">
                  owner: {a.owner} · urgency: {a.urgency}
                </p>
                <p className="prose-clinical mt-2 text-[14px] leading-6 text-ink">{a.reason}</p>
                <Citations evidence={a.evidence} className="mt-1" />
              </div>
              <form action={addNextStepForm} className="shrink-0 md:w-72">
                <fieldset disabled={!enabled} className="flex flex-col gap-2 disabled:opacity-60">
                  <input type="hidden" name="patientId" value={patientId} />
                  <input type="hidden" name="what" value={a.action} />
                  <input type="hidden" name="createdFrom" value="record review" />
                  <label className={FIELD_CLASS}>
                    <span className={LABEL_CLASS}>Owner, one named person</span>
                    <select name="ownerId" required defaultValue={guessOwner(owners, a.owner)} className={SELECT_CLASS}>
                      <option value="" disabled>
                        choose a person
                      </option>
                      {owners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.roleLabel ?? p.role}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={FIELD_CLASS}>
                    <span className={LABEL_CLASS}>Due, a date</span>
                    <input type="date" name="due" required defaultValue={due} className={INPUT_CLASS} />
                  </label>
                  <div>
                    <Button type="submit" variant="quiet" disabled={!enabled} className="w-full md:w-auto">
                      Add as a next step
                    </Button>
                  </div>
                </fieldset>
              </form>
            </li>
          ))}
        </ul>
        <p className="text-[12px] leading-5 text-faint">
          Suggestions, not decisions. A next step exists only once you add it, with an owner and a date.
        </p>
      </div>
    </Panel>
  );
}
