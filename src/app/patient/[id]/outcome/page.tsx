import Link from "next/link";
import type { ThreadMessage } from "@/lib/domain/types";
import { loadPatientContext } from "@/lib/patient-context";
import { CLINICIAN, THREAD_NOT_RECORD_LINE } from "@/lib/copy";
import { PatientStrip } from "@/components/shell/PatientStrip";
import { ButtonLink, Notice } from "@/components/ui";
import { OutcomeForm, type OutcomeMessageRef, type OutcomePerson, type OutcomeProposal } from "@/components/outcome/OutcomeForm";
import { OutcomeView } from "@/components/outcome/OutcomeView";

export const dynamic = "force-dynamic";

function shortLabel(m: ThreadMessage, author: string): string {
  const body = m.body.length > 56 ? `${m.body.slice(0, 56).trimEnd()}…` : m.body;
  return `${author} (${m.kind}): ${body}`;
}

export default async function OutcomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { patient, assessment, caseState, nowIso } = await loadPatientContext(id);

  const byId = new Map(caseState.participants.map((p) => [p.id, p]));
  const authorName = (authorId: string) => (authorId === CLINICIAN.id ? CLINICIAN.name : (byId.get(authorId)?.name ?? authorId));

  // Only professionals who take part in the thread attend, and only they own next steps.
  const owners = caseState.participants.filter((p) => p.channel === "professional" && !p.recipientOnly);
  const thread = caseState.threads.find((t) => t.channel === "professional");
  const threadMessages = thread?.messages ?? [];
  const messages = new Map(threadMessages.map((m) => [m.id, m]));
  const messageLabels: OutcomeMessageRef[] = threadMessages
    .filter((m) => m.kind !== "system")
    .map((m) => ({ id: m.id, label: shortLabel(m, authorName(m.authorId)) }));

  const base = `/patient/${patient.id}`;
  const outcome = caseState.outcome;

  return (
    <div>
      <PatientStrip patient={patient} assessment={assessment} caseState={caseState} current="/outcome" />

      <div className="mx-auto flex max-w-[72ch] flex-col gap-6 lg:mx-0 lg:max-w-[80ch]">
        <header className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-[1.5rem] font-medium leading-tight">
            {outcome ? "Outcome and next steps" : "Record the outcome"}
          </h2>
          {outcome ? (
            <ButtonLink href={`${base}/record`} variant="primary">
              Go to the record
            </ButtonLink>
          ) : null}
        </header>

        {outcome ? (
          <OutcomeView
            outcome={outcome}
            caseState={caseState}
            owners={owners}
            messages={messages}
            messageLabels={messageLabels}
          />
        ) : caseState.state === "coordinating" ? (
          <>
            <p className="prose-clinical text-[0.9375rem] leading-6 text-muted">{THREAD_NOT_RECORD_LINE}</p>
            <OutcomeForm
              patientId={patient.id}
              today={nowIso.slice(0, 10)}
              people={owners.map<OutcomePerson>((p) => ({
                id: p.id,
                name: p.name,
                role: p.roleLabel ?? p.role,
                accepted: p.status === "accepted",
                simulated: Boolean(p.simulated),
              }))}
              proposals={threadMessages
                .filter((m) => m.kind === "proposal" && m.proposes)
                .map<OutcomeProposal>((m) => ({
                  messageId: m.id,
                  authorName: authorName(m.authorId),
                  body: m.body,
                  field: m.proposes!.field,
                  value: m.proposes!.value,
                }))}
              messages={messageLabels}
            />
          </>
        ) : caseState.state === "paused" ? (
          <Notice kind="quiet" title="Paused">
            {caseState.pausedReason} The outcome can be recorded once the case is resumed from the{" "}
            <Link href={base} className="text-primary underline-offset-4 hover:underline">
              patient screen
            </Link>
            .
          </Notice>
        ) : (
          <Notice kind="quiet" title="Nothing to record yet">
            The outcome is assembled from the coordination thread once the team is coordinating. First{" "}
            {caseState.state === "flagged" ? (
              <>
                assemble the team from the{" "}
                <Link href={base} className="text-primary underline-offset-4 hover:underline">
                  patient screen
                </Link>
              </>
            ) : (
              <>
                open the{" "}
                <Link href={`${base}/thread`} className="text-primary underline-offset-4 hover:underline">
                  coordination thread
                </Link>{" "}
                and reach a decision
              </>
            )}
            .
          </Notice>
        )}
      </div>
    </div>
  );
}
