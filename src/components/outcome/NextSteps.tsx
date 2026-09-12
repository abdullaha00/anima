import type { NextStep, Participant } from "@/lib/domain/types";
import { addNextStepForm, setNextStepStatusForm } from "@/app/actions";
import { formatDate } from "@/lib/format";
import { Button, EmptyLine, Mono, SimulatedTag } from "@/components/ui";
import { INPUT_CLASS, SELECT_CLASS } from "@/components/ui/form";

function personLine(p: Participant | undefined, id: string) {
  if (!p) return <Mono className="text-muted">{id}</Mono>;
  return (
    <span>
      <span className="font-medium">{p.name}</span>
      <span className="text-muted"> · {p.roleLabel ?? p.role}</span>
      {p.simulated ? <SimulatedTag className="ml-2" /> : null}
    </span>
  );
}

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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.9375rem]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="microlabel py-2 pr-4 font-medium">What</th>
                <th className="microlabel py-2 pr-4 font-medium">Owner</th>
                <th className="microlabel py-2 pr-4 font-medium">Due</th>
                <th className="microlabel py-2 pr-4 font-medium">Status</th>
                <th className="microlabel py-2 font-medium">
                  <span className="sr-only">Change status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.id} className="border-b border-line align-top">
                  <td className="py-3 pr-4">
                    <div>{s.what}</div>
                    {s.createdFrom ? (
                      <div className="font-mono text-[0.75rem] text-muted">from {s.createdFrom}</div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">{personLine(byId.get(s.ownerId), s.ownerId)}</td>
                  <td className="py-3 pr-4 whitespace-nowrap tnum">{formatDate(s.due)}</td>
                  <td className="py-3 pr-4">
                    <span className={s.status === "done" ? "text-affirm" : s.status === "blocked" ? "font-medium" : ""}>
                      {s.status}
                    </span>
                    {s.status === "blocked" && s.blockedReason ? (
                      <div className="text-[0.8125rem] text-muted">{s.blockedReason}</div>
                    ) : null}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap items-start gap-2">
                      {s.status !== "done" ? (
                        <form action={setNextStepStatusForm}>
                          <input type="hidden" name="patientId" value={patientId} />
                          <input type="hidden" name="nextStepId" value={s.id} />
                          <input type="hidden" name="status" value="done" />
                          <Button type="submit" variant="quiet" className="text-[0.875rem]">
                            Mark done
                          </Button>
                        </form>
                      ) : (
                        <form action={setNextStepStatusForm}>
                          <input type="hidden" name="patientId" value={patientId} />
                          <input type="hidden" name="nextStepId" value={s.id} />
                          <input type="hidden" name="status" value="open" />
                          <Button type="submit" variant="quiet" className="text-[0.875rem]">
                            Reopen
                          </Button>
                        </form>
                      )}
                      {s.status !== "blocked" ? (
                        <details className="text-[0.875rem]">
                          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center px-2 text-muted hover:text-ink">
                            Blocked
                          </summary>
                          <form action={setNextStepStatusForm} className="flex flex-col gap-2 pt-1">
                            <input type="hidden" name="patientId" value={patientId} />
                            <input type="hidden" name="nextStepId" value={s.id} />
                            <input type="hidden" name="status" value="blocked" />
                            <label className="flex flex-col gap-1">
                              <span className="microlabel">Reason, required</span>
                              <input name="blockedReason" required minLength={3} className={INPUT_CLASS} />
                            </label>
                            <div>
                              <Button type="submit" variant="quiet" className="text-[0.875rem]">
                                Mark blocked
                              </Button>
                            </div>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[0.8125rem] text-muted">Open next steps appear on the worklist with their owner.</p>

      <details className="rounded-md border border-dashed border-line-strong px-4 py-2">
        <summary className="min-h-11 cursor-pointer list-none py-2 text-[0.9375rem] text-muted hover:text-ink">
          Add a next step
        </summary>
        <form action={addNextStepForm} className="grid gap-3 pb-3 pt-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <input type="hidden" name="patientId" value={patientId} />
          <label className="flex flex-col gap-1 sm:col-span-3">
            <span className="microlabel">What needs to happen</span>
            <input id="add-step-what" name="what" required className={INPUT_CLASS} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="microlabel">Owner, one named person</span>
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
          <label className="flex flex-col gap-1">
            <span className="microlabel">Due, a date</span>
            <input id="add-step-due" type="date" name="due" required className={INPUT_CLASS} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="microlabel">From thread entry, optional</span>
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
