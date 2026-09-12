import Link from "next/link";
import type { CaseState, MeetingOutcome, Participant, ThreadMessage } from "@/lib/domain/types";
import { CLINICIAN } from "@/lib/copy";
import { formatDate, formatDateTime } from "@/lib/format";
import { fieldLabel } from "@/lib/record/fields";
import { EmptyLine, Microlabel, Mono, Notice, Panel, ProvenanceLine, SimulatedTag } from "@/components/ui";
import { PromotionBlock } from "./PromotionBlock";
import { NextSteps } from "./NextSteps";

function PersonList({ ids, byId }: { ids: string[]; byId: Map<string, Participant> }) {
  if (ids.length === 0) return <EmptyLine>none</EmptyLine>;
  return (
    <ul className="flex flex-col gap-1.5 text-[15px] leading-6">
      {ids.map((id) => {
        const p = byId.get(id);
        return (
          <li key={id}>
            {p ? (
              <>
                <span className="font-medium text-ink">{p.name}</span>
                <span className="text-[13px] font-medium text-secondary"> · {p.roleLabel ?? p.role}</span>
                {p.simulated ? <SimulatedTag className="ml-2" /> : null}
              </>
            ) : (
              <Mono className="text-muted">{id}</Mono>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The recorded outcome, read-only, with promotion into the record decision by decision. */
export function OutcomeView({
  outcome,
  caseState,
  owners,
  messages,
  messageLabels,
}: {
  outcome: MeetingOutcome;
  caseState: CaseState;
  owners: Participant[];
  messages: Map<string, ThreadMessage>;
  messageLabels: { id: string; label: string }[];
}) {
  const byId = new Map(caseState.participants.map((p) => [p.id, p]));
  const authorName = (id: string) => (id === CLINICIAN.id ? CLINICIAN.name : (byId.get(id)?.name ?? id));
  const record = caseState.record;
  const threadHref = `/patient/${caseState.patientId}/thread`;
  const promotable = outcome.decisions.filter((d) => d.intoRecordField).length;

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <Microlabel className="mb-3">Outcome, held {formatDate(outcome.heldAt)}</Microlabel>
        <p className="prose-clinical font-voice text-[20px] leading-[1.4] text-ink">{outcome.summary}</p>
        <p className="mt-3 font-mono text-[12px] leading-5 text-faint">recorded by {outcome.recordedBy}</p>
      </Panel>

      <div className="grid gap-6 sm:grid-cols-2">
        <Panel title="Attended">
          <PersonList ids={outcome.attendees} byId={byId} />
        </Panel>
        <Panel title="Apologies">
          <PersonList ids={outcome.apologies} byId={byId} />
        </Panel>
      </div>

      <Panel
        title="Decisions"
        aside={promotable ? `${promotable} carry a record field` : "none carry a record field"}
      >
        {outcome.decisions.length === 0 ? (
          <EmptyLine>No decisions recorded.</EmptyLine>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {outcome.decisions.map((d, i) => {
              const from = d.fromMessageId ? messages.get(d.fromMessageId) : undefined;
              const current = d.intoRecordField ? record.fields[d.intoRecordField] : undefined;
              return (
                <li key={i} className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <Mono className="mt-1 text-faint tnum">{i + 1}.</Mono>
                    <div className="flex flex-col gap-1">
                      <p className="text-[15px] leading-6 text-ink">{d.text}</p>
                      {from ? (
                        <p className="text-[13px] font-medium leading-5 text-secondary">
                          From the coordination thread, {authorName(from.authorId)}: &ldquo;{from.body}&rdquo;{" "}
                          <Link href={threadHref} className="text-primary-hover underline-offset-4 hover:underline">
                            open the thread
                          </Link>
                          <Mono className="ml-2 text-faint">{from.id}</Mono>
                        </p>
                      ) : d.fromMessageId ? (
                        <p className="font-mono text-[12px] text-faint">from {d.fromMessageId}</p>
                      ) : null}
                    </div>
                  </div>

                  {d.intoRecordField ? (
                    <div className="ml-8 grid grid-cols-1 gap-4 border-t border-dashed border-line-strong pt-4 md:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <span className="microlabel">Current record: {fieldLabel(d.intoRecordField)}</span>
                        {current ? (
                          <>
                            <p className="text-[15px] leading-6 text-ink">{current.value}</p>
                            <ProvenanceLine
                              recordedBy={current.recordedBy}
                              recordedAt={current.recordedAt}
                              source={current.source}
                            />
                          </>
                        ) : (
                          <EmptyLine>not recorded</EmptyLine>
                        )}
                      </div>
                      {d.promotedAt ? (
                        <div className="flex flex-col gap-1">
                          <span className="microlabel">Proposed</span>
                          <p className="text-[15px] font-medium leading-6 text-ink">{d.proposedValue ?? "no value carried"}</p>
                          <Notice kind="affirm" className="mt-2">
                            Promoted into the record on {formatDateTime(d.promotedAt)}, recorded by {CLINICIAN.name}. The
                            record still needs a signature.
                          </Notice>
                        </div>
                      ) : d.proposedValue ? (
                        <PromotionBlock patientId={caseState.patientId} decisionIndex={i} proposedValue={d.proposedValue} />
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="microlabel">Proposed</span>
                          <EmptyLine>no value carried, so there is nothing to promote</EmptyLine>
                        </div>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {promotable ? (
          <p className="mt-5 border-t border-line pt-4 text-[12px] leading-5 text-faint">
            Promotion never signs. Recorded-by is the accepting clinician, not the person who proposed it.
          </p>
        ) : null}
      </Panel>

      <Panel title="Next steps" aside={`${outcome.nextSteps.filter((s) => s.status === "open").length} open`}>
        <NextSteps patientId={caseState.patientId} steps={outcome.nextSteps} owners={owners} messages={messageLabels} />
      </Panel>
    </div>
  );
}
