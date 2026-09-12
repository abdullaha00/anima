import type { NextStep, Participant } from "@/lib/domain/types";
import { addNextStepForm, setNextStepStatusForm } from "@/app/actions";
import { formatDate } from "@/lib/format";
import { Button, Chip, Disclosure, EmptyLine, Mono, SimulatedTag } from "@/components/ui";
import { FIELD_CLASS, INPUT_CLASS, LABEL_CLASS, SELECT_CLASS } from "@/components/team/form-classes";

function personLine(p: Participant | undefined, id: string) {
  if (!p) return <Mono className="text-muted">{id}</Mono>;
  return (
    <span>
      <span className="font-medium text-ink">{p.name}</span>
      <span className="text-secondary"> · {p.roleLabel ?? p.role}</span>
      {p.simulated ? <SimulatedTag className="ml-2" /> : null}
    </span>
  );
}

const TH = "microlabel border-b-2 border-line px-3 py-2.5 text-left font-semibold";
const TD = "border-b border-line px-3 py-2.5 text-[13px] leading-5 align-top";

/**
 * The next steps from the outcome, each with one named owner and a date. Status changes
 * and additions post to the FormData wrappers; a blocked step requires a reason.
 */
export function NextSteps({
  patientId,
  steps,
  owners,
  messages,
}: {
  patientId: string;
  steps: NextStep[];
  /** Professional participants who can own a next step. Never "the team". */
  owners: Participant[];
  messages: { id: string; label: string }[];
}) {
  const byId = new Map(owners.map((p) => [p.id, p]));
  return (
    <div className="flex flex-col gap-4">
      {steps.length === 0 ? (
        <EmptyLine>No next steps recorded.</EmptyLine>
      ) : (
        <div className="-mx-3 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>What</th>
                <th className={TH}>Owner</th>
                <th className={TH}>Due</th>
                <th className={TH}>Status</th>
                <th className={TH}>
                  <span className="sr-only">Change status</span>
                </th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {steps.map((s) => (
                <tr key={s.id}>
                  <td className={`${TD} text-ink`}>
                    <div>{s.what}</div>
                    {s.createdFrom ? (
                      <div className="font-mono text-[12px] text-faint">from {s.createdFrom}</div>
                    ) : null}
                  </td>
                  <td className={TD}>{personLine(byId.get(s.ownerId), s.ownerId)}</td>
                  <td className={`${TD} whitespace-nowrap text-ink tnum`}>{formatDate(s.due)}</td>
                  <td className={TD}>
                    <Chip
                      className={
                        s.status === "done"
                          ? "border-affirm-border bg-affirm-soft text-affirm"
                          : s.status === "blocked"
                            ? "font-semibold text-ink"
                            : ""
                      }
                    >
                      {s.status}
                    </Chip>
                    {s.status === "blocked" && s.blockedReason ? (
                      <div className="mt-1 text-[13px] text-secondary">{s.blockedReason}</div>
                    ) : null}
                  </td>
                  <td className={`${TD} py-1.5`}>
                    <div className="flex flex-wrap items-start gap-2">
                      {s.status !== "done" ? (
                        <form action={setNextStepStatusForm}>
                          <input type="hidden" name="patientId" value={patientId} />
                          <input type="hidden" name="nextStepId" value={s.id} />
                          <input type="hidden" name="status" value="done" />
                          <Button type="submit" variant="quiet" className="px-3.5 text-[13px]">
                            <span aria-hidden="true">Mark done</span><span className="sr-only">Mark done: {s.what}</span>
                          </Button>
                        </form>
                      ) : (
                        <form action={setNextStepStatusForm}>
                          <input type="hidden" name="patientId" value={patientId} />
                          <input type="hidden" name="nextStepId" value={s.id} />
                          <input type="hidden" name="status" value="open" />
                          <Button type="submit" variant="quiet" className="px-3.5 text-[13px]">
                            Reopen
                          </Button>
                        </form>
                      )}
                      {s.status !== "blocked" ? (
                        <Disclosure label="Mark blocked" className="px-2">
                          <form action={setNextStepStatusForm} className="flex flex-col gap-2">
                            <input type="hidden" name="patientId" value={patientId} />
                            <input type="hidden" name="nextStepId" value={s.id} />
                            <input type="hidden" name="status" value="blocked" />
                            <label className={FIELD_CLASS}>
                              <span className={LABEL_CLASS}>Reason, required</span>
                              <input name="blockedReason" required minLength={3} className={INPUT_CLASS} />
                            </label>
                            <div>
                              <Button type="submit" variant="quiet" className="px-3.5 text-[13px]">
                                Save as blocked
                              </Button>
                            </div>
                          </form>
                        </Disclosure>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[12px] leading-5 text-faint">Open next steps appear on the worklist with their owner.</p>

      <details className="border-t border-line pt-3">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-[14px] font-semibold text-primary-hover underline-offset-4 hover:underline">
          Add a next step
        </summary>
        <form action={addNextStepForm} className="grid gap-4 pb-2 pt-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <input type="hidden" name="patientId" value={patientId} />
          <label className={`${FIELD_CLASS} sm:col-span-3`}>
            <span className={LABEL_CLASS}>What needs to happen</span>
            <input id="add-step-what" name="what" required className={INPUT_CLASS} />
          </label>
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>Owner, one named person</span>
            <select id="add-step-owner" name="ownerId" required defaultValue="" className={SELECT_CLASS}>
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
            <input id="add-step-due" type="date" name="due" required className={INPUT_CLASS} />
          </label>
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>From thread entry, optional</span>
            <select id="add-step-from" name="createdFrom" defaultValue="" className={SELECT_CLASS}>
              <option value="">none</option>
              {messages.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-3">
            <Button type="submit" variant="quiet">
              Add the next step
            </Button>
          </div>
        </form>
      </details>
    </div>
  );
}
