import type { Channel } from "@/lib/domain/types";
import { loadPatientContext } from "@/lib/patient-context";
import { PatientStrip } from "@/components/shell/PatientStrip";
import { THREAD_NOT_RECORD_LINE } from "@/lib/copy";
import { DEMO_PATIENT_IDS, DEMO_THREAD_PURPOSE, defaultPurpose } from "@/lib/coordination/fixtures";
import { FAMILY_ALLOWED_TOPICS } from "@/lib/coordination/family-guard";
import { RECORD_FIELDS, fieldLabel } from "@/lib/record/fields";
import { ButtonLink, EmptyLine, Notice, Panel } from "@/components/ui";
import { ChannelTabs } from "@/components/thread/ChannelTabs";
import { ThreadHeader } from "@/components/thread/ThreadHeader";
import { ThreadEntries } from "@/components/thread/ThreadEntries";
import { Composer } from "@/components/thread/Composer";
import { resolveAuthor } from "@/components/thread/authors";
import { OpenThreadForm } from "@/components/team/OpenThreadForm";

export const dynamic = "force-dynamic";

const FAMILY_PURPOSE =
  "Keep the family informed about what matters, place preferences, who is involved and practical arrangements, and take their questions.";

/**
 * Screen 4: the coordination thread. Two channels, never one. The thread is how a
 * decision was reached; the record is the decision.
 */
export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { patient, assessment, caseState } = await loadPatientContext(id);
  const channel: Channel = query.channel === "family" ? "family" : "professional";
  const thread = caseState.threads.find((t) => t.channel === channel);
  const family = channel === "family";

  const purpose = family
    ? FAMILY_PURPOSE
    : DEMO_PATIENT_IDS.includes(patient.id)
      ? DEMO_THREAD_PURPOSE
      : defaultPurpose(patient, assessment);
  const familyParticipants = caseState.participants.filter((p) => p.channel === "family" && !p.recipientOnly);
  const teamProposed = caseState.participants.length > 0;

  const proposals = (thread?.messages ?? [])
    .filter((m) => m.kind === "proposal" && m.proposes)
    .map((m) => ({
      id: m.id,
      label: `${fieldLabel(m.proposes!.field)} → ${m.proposes!.value} (${resolveAuthor(caseState, m.authorId).name})`,
    }));
  const fields = RECORD_FIELDS.filter((f) => !family || f.familySafe).map((f) => ({ name: f.name, label: f.label }));

  return (
    <div>
      <PatientStrip patient={patient} assessment={assessment} caseState={caseState} current="/thread" />

      <ChannelTabs patientId={patient.id} current={channel} />
      <p className="prose-clinical py-4 text-[13px] font-medium leading-5 text-secondary">{THREAD_NOT_RECORD_LINE}</p>

      {!thread ? (
        <Panel className="mt-2 max-w-2xl">
          <h2 className="font-display text-[22px] leading-tight text-ink">
            {family ? "No family channel is open" : "No coordination thread is open"}
          </h2>
          {!teamProposed ? (
            <div className="mt-4 flex flex-col gap-4">
              <EmptyLine>The team has not been proposed yet, so there is nobody to include.</EmptyLine>
              <div>
                <ButtonLink href={`/patient/${patient.id}/team`} variant="primary">
                  Go to the care team
                </ButtonLink>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-5">
              {family ? (
                <>
                  <p className="prose-clinical text-[15px] leading-6 text-secondary">
                    Nothing posts to the family channel automatically. Every entry is written or approved by a
                    clinician, and it never carries clinical recommendations, ceilings of treatment or CPR content.
                  </p>
                  {familyParticipants.length === 0 ? (
                    <Notice kind="quiet">
                      No carer or next of kin is on the participants list. The channel can still be opened; add the
                      family participant on the care team screen when the conversation names someone.
                    </Notice>
                  ) : (
                    <p className="text-[13px] font-medium leading-5 text-secondary">
                      Family participants: {familyParticipants.map((p) => `${p.name}, ${p.roleLabel ?? p.role}`).join("; ")}.
                    </p>
                  )}
                </>
              ) : (
                <p className="prose-clinical text-[15px] leading-6 text-secondary">
                  Scoped to this patient and this decision, with a closed participant list, a stated purpose, and an
                  audit of who has read it. Colleagues other than the signed-in clinician are simulated.
                </p>
              )}
              <OpenThreadForm
                patientId={patient.id}
                channel={channel}
                defaultPurpose={purpose}
                note={
                  family
                    ? "Nothing posts automatically; every entry is written or approved by a clinician."
                    : undefined
                }
              />
            </div>
          )}
        </Panel>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="flex flex-col gap-8">
            <ThreadHeader thread={thread} caseState={caseState} />

            <Panel as="div">
              <section aria-labelledby="entries-heading">
                <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-4">
                  <h2 id="entries-heading" className="font-display text-[22px] leading-tight text-ink">
                    Contributions
                  </h2>
                  <span className="text-[13px] font-medium text-secondary tnum">
                    {thread.messages.length} entries · {proposals.length} proposals
                  </span>
                </div>
                <ThreadEntries thread={thread} caseState={caseState} />
              </section>
            </Panel>

            <Panel as="div">
              <section aria-labelledby="composer-heading">
                <h2
                  id="composer-heading"
                  className="mb-5 border-b border-line pb-4 text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink"
                >
                  Add to the thread
                </h2>
                <Composer
                  patientId={patient.id}
                  threadId={thread.id}
                  channel={channel}
                  proposals={proposals}
                  fields={fields}
                  allowedTopics={FAMILY_ALLOWED_TOPICS}
                />
              </section>
            </Panel>

            {!family ? (
              <div className="flex flex-wrap items-center gap-4">
                <ButtonLink href={`/patient/${patient.id}/outcome`} variant="quiet">
                  Record the outcome
                </ButtonLink>
                <span className="text-[13px] font-medium text-secondary">
                  Decisions, attendees and next steps with a named owner and a date.
                </span>
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-4">
            <Panel title={family ? "Family channel" : "Professional thread"}>
              {family ? (
                <div className="flex flex-col gap-2 text-[13px] font-medium leading-5 text-secondary">
                  <p>Never in the professional thread. Content limited to:</p>
                  <ul className="list-disc pl-5">
                    {FAMILY_ALLOWED_TOPICS.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  <p>Anything else is refused in place, with the reason, before it reaches the family.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-[13px] font-medium leading-5 text-secondary">
                  <p>A proposal names a record field and a value. Agreements and concerns attach to it.</p>
                  <p>
                    The outcome is assembled from these proposals, and a named clinician promotes a decision into the
                    record and signs. The thread itself never travels.
                  </p>
                </div>
              )}
            </Panel>
            {caseState.threads.length > 1 ? (
              <Panel title="Other channel">
                <ButtonLink href={`/patient/${patient.id}/thread?channel=${family ? "professional" : "family"}`} variant="quiet">
                  {family ? "Professional thread" : "Family channel"}
                </ButtonLink>
              </Panel>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
