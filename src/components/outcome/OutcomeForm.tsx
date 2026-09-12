"use client";

import { useActionState, useState } from "react";
import type { RecordFieldName } from "@/lib/domain/types";
import { recordOutcome, type ActionResult, type DecisionInput, type NextStepInput } from "@/app/actions";
import { RECORD_FIELDS, fieldLabel } from "@/lib/record/fields";
import { Button, Notice, SimulatedTag } from "@/components/ui";
import { CHECK_CLASS, INPUT_CLASS, SELECT_CLASS, TEXTAREA_CLASS } from "@/components/ui/form";

/** A professional participant who can attend and can own a next step. */
export interface OutcomePerson {
  id: string;
  name: string;
  role: string;
  accepted: boolean;
  simulated: boolean;
}

/** A proposal from the professional thread, ready to become a decision. */
export interface OutcomeProposal {
  messageId: string;
  authorName: string;
  body: string;
  field: RecordFieldName;
  value: string;
}

/** A thread message a next step can cite as its origin. */
export interface OutcomeMessageRef {
  id: string;
  label: string;
}

interface AddedDecision {
  key: number;
  text: string;
  field: "" | RecordFieldName;
  value: string;
}

interface NextStepRow {
  key: number;
  what: string;
  ownerId: string;
  due: string;
  createdFrom: string;
}

const NEXT_STEP_RULE = "Every next step has one named owner and a date.";

let keySeq = 1;
function nextKey(): number {
  keySeq += 1;
  return keySeq;
}

/**
 * The outcome is assembled from the professional thread rather than retyped: proposals
 * become decisions, participants become attendees, and next steps cite the entry they
 * came from. Decisions and next steps are kept in React state and serialised into hidden
 * inputs, so the same form posts to the plain action with the error shown in place.
 */
export function OutcomeForm({
  patientId,
  today,
  people,
  proposals,
  messages,
}: {
  patientId: string;
  today: string;
  people: OutcomePerson[];
  proposals: OutcomeProposal[];
  messages: OutcomeMessageRef[];
}) {
  const [attendance, setAttendance] = useState<Record<string, "attended" | "apologies">>(() =>
    Object.fromEntries(people.map((p) => [p.id, p.accepted ? "attended" : "apologies"])),
  );
  const [chosen, setChosen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(proposals.map((p) => [p.messageId, true])),
  );
  const [added, setAdded] = useState<AddedDecision[]>([]);
  const [steps, setSteps] = useState<NextStepRow[]>([{ key: 1, what: "", ownerId: "", due: "", createdFrom: "" }]);
  const [clientError, setClientError] = useState<string | null>(null);

  const decisions: DecisionInput[] = [
    ...proposals
      .filter((p) => chosen[p.messageId])
      .map((p) => ({
        text: `Decision: ${p.body}`,
        fromMessageId: p.messageId,
        intoRecordField: p.field,
        proposedValue: p.value,
      })),
    ...added
      .filter((d) => d.text.trim() !== "")
      .map((d) => {
        const out: DecisionInput = { text: d.text.trim() };
        if (d.field) out.intoRecordField = d.field;
        if (d.value.trim()) out.proposedValue = d.value.trim();
        return out;
      }),
  ];

  const nextSteps: NextStepInput[] = steps
    .filter((s) => s.what.trim() !== "" || s.ownerId !== "" || s.due !== "")
    .map((s) => {
      const out: NextStepInput = { what: s.what.trim(), ownerId: s.ownerId, due: s.due };
      if (s.createdFrom) out.createdFrom = s.createdFrom;
      return out;
    });

  const attendees = people.filter((p) => attendance[p.id] === "attended").map((p) => p.id);
  const apologies = people.filter((p) => attendance[p.id] === "apologies").map((p) => p.id);

  const [state, formAction, pending] = useActionState(async (_prev: ActionResult | null, fd: FormData) => {
    const parsedSteps = JSON.parse(String(fd.get("nextSteps") ?? "[]")) as NextStepInput[];
    const incomplete = parsedSteps.some((s) => !s.what || !s.ownerId || !s.due);
    if (parsedSteps.length === 0 || incomplete) {
      return { ok: false, error: `${NEXT_STEP_RULE} Add at least one next step with a named owner and a due date.` };
    }
    return recordOutcome(String(fd.get("patientId") ?? ""), {
      heldAt: String(fd.get("heldAt") ?? ""),
      summary: String(fd.get("summary") ?? ""),
      attendees: fd.getAll("attendees").map(String),
      apologies: fd.getAll("apologies").map(String),
      decisions: JSON.parse(String(fd.get("decisions") ?? "[]")) as DecisionInput[],
      nextSteps: parsedSteps,
    });
  }, null);

  function updateStep(key: number, patch: Partial<NextStepRow>) {
    setSteps((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function updateAdded(key: number, patch: Partial<AddedDecision>) {
    setAdded((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        if (nextSteps.length === 0) {
          e.preventDefault();
          setClientError(`${NEXT_STEP_RULE} Add at least one next step before recording the outcome.`);
          return;
        }
        setClientError(null);
      }}
    >
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="decisions" value={JSON.stringify(decisions)} />
      <input type="hidden" name="nextSteps" value={JSON.stringify(nextSteps)} />
      {attendees.map((id) => (
        <input key={`att-${id}`} type="hidden" name="attendees" value={id} />
      ))}
      {apologies.map((id) => (
        <input key={`apo-${id}`} type="hidden" name="apologies" value={id} />
      ))}

      {/* When and what */}
      <section className="flex flex-col gap-4">
        <label className="flex max-w-xs flex-col gap-1">
          <span className="microlabel">Held on</span>
          <input id="outcome-held-at" type="date" name="heldAt" defaultValue={today} required className={INPUT_CLASS} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="microlabel">Summary of the conversation, required</span>
          <textarea
            id="outcome-summary"
            name="summary"
            required
            minLength={8}
            className={`${TEXTAREA_CLASS} prose-clinical font-serif text-[1.0625rem]`}
            placeholder="What the team discussed and where it landed, in plain words."
          />
        </label>
      </section>

      {/* Attendance */}
      <section aria-labelledby="attendance-heading" className="flex flex-col gap-3">
        <h3 id="attendance-heading" className="font-serif text-[1.125rem] font-medium">
          Attendance
        </h3>
        {people.length === 0 ? (
          <p className="text-[0.9375rem] text-muted italic">No professional participants on this case.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {people.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2">
                <span className="min-w-[14rem] flex-1 text-[0.9375rem]">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted"> · {p.role}</span>
                  {p.simulated ? <SimulatedTag className="ml-2" /> : null}
                </span>
                <span className="flex items-center gap-4" role="radiogroup" aria-label={`Attendance for ${p.name}`}>
                  {(["attended", "apologies"] as const).map((v) => (
                    <label key={v} className="inline-flex min-h-11 items-center gap-2 text-[0.9375rem]">
                      <input
                        type="radio"
                        name={`attendance-${p.id}`}
                        value={v}
                        checked={attendance[p.id] === v}
                        onChange={() => setAttendance((a) => ({ ...a, [p.id]: v }))}
                        className={CHECK_CLASS}
                      />
                      {v}
                    </label>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Decisions */}
      <section aria-labelledby="decisions-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h3 id="decisions-heading" className="font-serif text-[1.125rem] font-medium">
            Decisions
          </h3>
          <span className="text-[0.8125rem] text-muted">from proposals on the coordination thread</span>
        </div>
        {proposals.length === 0 ? (
          <p className="text-[0.9375rem] text-muted italic">
            No proposals on the professional thread yet. A decision can still be added below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {proposals.map((p) => (
              <li key={p.messageId} className="rounded-sm border border-line bg-surface px-4 py-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(chosen[p.messageId])}
                    onChange={(e) => setChosen((c) => ({ ...c, [p.messageId]: e.target.checked }))}
                    className={`${CHECK_CLASS} mt-1`}
                  />
                  <span className="flex flex-col gap-1">
                    <span className="text-[0.9375rem] leading-6">Decision: {p.body}</span>
                    <span className="text-[0.8125rem] text-muted">
                      into the record: <span className="text-ink">{fieldLabel(p.field)}</span> = &ldquo;{p.value}&rdquo;
                    </span>
                    <span className="font-mono text-[0.75rem] text-muted">
                      proposed by {p.authorName} · {p.messageId}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {added.map((d) => (
          <div key={d.key} className="grid gap-2 rounded-sm border border-dashed border-line-strong px-4 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="microlabel">Decision</span>
              <input
                value={d.text}
                onChange={(e) => updateAdded(d.key, { text: e.target.value })}
                className={INPUT_CLASS}
                placeholder="What was decided, in one sentence."
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="microlabel">Record field, optional</span>
              <select
                value={d.field}
                onChange={(e) => updateAdded(d.key, { field: e.target.value as "" | RecordFieldName })}
                className={SELECT_CLASS}
              >
                <option value="">none</option>
                {RECORD_FIELDS.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="microlabel">Proposed value, optional</span>
              <input
                value={d.value}
                onChange={(e) => updateAdded(d.key, { value: e.target.value })}
                className={INPUT_CLASS}
                disabled={!d.field}
              />
            </label>
            <div className="sm:col-span-2">
              <Button type="button" variant="link" onClick={() => setAdded((rows) => rows.filter((r) => r.key !== d.key))}>
                Remove this decision
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="quiet"
            onClick={() => setAdded((rows) => [...rows, { key: nextKey(), text: "", field: "", value: "" }])}
          >
            Add a decision
          </Button>
        </div>
      </section>

      {/* Next steps */}
      <section aria-labelledby="next-steps-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h3 id="next-steps-heading" className="font-serif text-[1.125rem] font-medium">
            Next steps
          </h3>
          <span className="text-[0.8125rem] text-muted">{NEXT_STEP_RULE}</span>
        </div>
        <ul className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <li key={s.key} className="grid gap-2 rounded-sm border border-line bg-surface px-4 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <label className="flex flex-col gap-1 sm:col-span-3">
                <span className="microlabel">What needs to happen</span>
                <input
                  id={`next-step-what-${s.key}`}
                  value={s.what}
                  onChange={(e) => updateStep(s.key, { what: e.target.value })}
                  className={INPUT_CLASS}
                  required={i === 0}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="microlabel">Owner, one named person</span>
                <select
                  value={s.ownerId}
                  onChange={(e) => updateStep(s.key, { ownerId: e.target.value })}
                  className={SELECT_CLASS}
                  required={i === 0}
                >
                  <option value="">choose a person</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="microlabel">Due, a date</span>
                <input
                  type="date"
                  value={s.due}
                  onChange={(e) => updateStep(s.key, { due: e.target.value })}
                  className={INPUT_CLASS}
                  required={i === 0}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="microlabel">From thread entry, optional</span>
                <select value={s.createdFrom} onChange={(e) => updateStep(s.key, { createdFrom: e.target.value })} className={SELECT_CLASS}>
                  <option value="">none</option>
                  {messages.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              {steps.length > 1 ? (
                <div className="sm:col-span-3">
                  <Button type="button" variant="link" onClick={() => setSteps((rows) => rows.filter((r) => r.key !== s.key))}>
                    Remove this next step
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div>
          <Button
            type="button"
            variant="quiet"
            onClick={() => setSteps((rows) => [...rows, { key: nextKey(), what: "", ownerId: "", due: "", createdFrom: "" }])}
          >
            Add another next step
          </Button>
        </div>
      </section>

      {clientError ? (
        <Notice kind="refuse" role="alert">
          {clientError}
        </Notice>
      ) : state?.ok === false ? (
        <Notice kind="refuse" role="alert">
          {state.error}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Recording the outcome" : "Record the outcome"}
        </Button>
        <span className="text-[0.8125rem] text-muted tnum">
          {decisions.length} {decisions.length === 1 ? "decision" : "decisions"}, {nextSteps.length}{" "}
          {nextSteps.length === 1 ? "next step" : "next steps"}, recorded by you as the named clinician
        </span>
      </div>
    </form>
  );
}
