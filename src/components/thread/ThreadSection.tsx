import Link from "next/link";
import type { Channel, CoordinationThread } from "@/lib/domain/types";
import type { PatientContext } from "@/lib/patient-context";
import type { RecordReview } from "@/lib/stage2/read";
import { THREAD_NOT_RECORD_LINE } from "@/lib/copy";
import { DEMO_PATIENT_IDS, DEMO_THREAD_PURPOSE, defaultPurpose } from "@/lib/coordination/fixtures";
import { FAMILY_ALLOWED_TOPICS } from "@/lib/coordination/family-guard";
import { RECORD_FIELDS, fieldLabel } from "@/lib/record/fields";
import { ButtonLink, EmptyLine, Notice, Panel } from "@/components/ui";
import { ThreadHeader } from "@/components/thread/ThreadHeader";
import { ThreadEntries } from "@/components/thread/ThreadEntries";
import { Composer } from "@/components/thread/Composer";
import { resolveAuthor } from "@/components/thread/authors";
import { OpenThreadForm } from "@/components/team/OpenThreadForm";
import { DraftCommunications, MeetingBriefing } from "@/components/thread/ReviewPanels";
import { isFamilyAudience } from "@/components/review/Citations";

const FAMILY_PURPOSE =
  "Keep the family informed about what matters, place preferences, who is involved and practical arrangements, and take their questions.";

const SUBHEADING = "text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink";
const GRID = "grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start";
const ANCHOR = "text-primary-hover underline-offset-4 hover:underline";

/**
 * Coordination thread: two channels, never one. The professional thread comes first, the
 * family channel sits under its own heading with its standing rules, and both stay on
 * screen. The thread is how a decision was reached; the record is the decision.
 */
export function ThreadSection({ ctx, review }: { ctx: PatientContext; review?: RecordReview }) {
  const { patient, assessment, caseState } = ctx;
  const base = `/patient/${patient.id}`;
  const professional = caseState.threads.find((t) => t.channel === "professional");
  const family = caseState.threads.find((t) => t.channel === "family");
  const teamProposed = caseState.participants.length > 0;
  const familyParticipants = caseState.participants.filter((p) => p.channel === "family" && !p.recipientOnly);
  const professionalPurpose = DEMO_PATIENT_IDS.includes(patient.id)
    ? DEMO_THREAD_PURPOSE
    : defaultPurpose(patient, assessment);

  // Drafts from the record review are drafts: nothing is posted to either channel by Cairn.
  const communications = review?.assessment.communications ?? [];
  const professionalDrafts = communications.filter((c) => !isFamilyAudience(c.audience));
  const familyDrafts = communications.filter((c) => isFamilyAudience(c.audience));

  const entryCount = (professional?.messages.length ?? 0) + (family?.messages.length ?? 0);

  // Review panels sit beside an open thread; with nothing open yet they stack under the
  // main card, so a short card is never left beside a long column.
  const professionalReview = (aside: boolean) => (
    <>
      {review ? <MeetingBriefing meeting={review.assessment.meeting} collapsed={aside} /> : null}
      <DraftCommunications communications={professionalDrafts} audience="professional" collapsed={aside} />
    </>
  );
  const familyReview = (aside: boolean) => (
    <DraftCommunications communications={familyDrafts} audience="family" collapsed={aside} />
  );

  const composerFor = (thread: CoordinationThread, channel: Channel) => {
    const isFamily = channel === "family";
    const proposals = thread.messages
      .filter((m) => m.kind === "proposal" && m.proposes)
      .map((m) => ({
        id: m.id,
        label: `${fieldLabel(m.proposes!.field)}: ${m.proposes!.value} (${resolveAuthor(caseState, m.authorId).name})`,
      }));
    const fields = RECORD_FIELDS.filter((f) => !isFamily || f.familySafe).map((f) => ({ name: f.name, label: f.label }));
    return (
      <>
        <Panel as="div">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-4">
            <h4 className="text-[15px] font-bold leading-6 tracking-[-0.01em] text-ink">Contributions</h4>
            <span className="text-[13px] font-medium text-secondary tnum">
              {thread.messages.length} entries{isFamily ? "" : ` · ${proposals.length} proposals`}
            </span>
          </div>
          <ThreadEntries thread={thread} caseState={caseState} />
        </Panel>

        <Panel as="div">
          <h4 className="mb-5 border-b border-line pb-4 text-[15px] font-bold leading-6 tracking-[-0.01em] text-ink">
            Add to the {isFamily ? "family channel" : "thread"}
          </h4>
          <Composer
            patientId={patient.id}
            threadId={thread.id}
            channel={channel}
            proposals={proposals}
            fields={fields}
            allowedTopics={FAMILY_ALLOWED_TOPICS}
            submitVariant={isFamily ? "quiet" : "primary"}
          />
        </Panel>
      </>
    );
  };

  const teamFirst = (
    <div className="mt-4 flex flex-col gap-4">
      <EmptyLine>The team has not been proposed yet, so there is nobody to include.</EmptyLine>
      <p className="text-[13px] font-medium leading-5 text-secondary">
        First assemble the{" "}
        <Link href={`${base}/record#team`} className={ANCHOR}>
          care team
        </Link>
        .
      </p>
    </div>
  );

  return (
    <section id="thread" aria-labelledby="thread-heading" className="scroll-mt-[112px]">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="thread-heading" className="font-display text-[22px] leading-tight text-ink">
          Coordination thread
        </h2>
        {entryCount ? (
          <span className="text-[13px] font-medium text-secondary tnum">
            {entryCount} entries across {caseState.threads.length === 2 ? "both channels" : "one channel"}
          </span>
        ) : null}
      </div>
      <p className="prose-clinical mb-6 text-[13px] font-medium leading-5 text-secondary">{THREAD_NOT_RECORD_LINE}</p>

      {/* Professional thread, first and plain-spoken. */}
      <div className="flex flex-col gap-5">
        <h3 className={SUBHEADING}>Professional thread</h3>
        <div className={GRID}>
          <div className="flex min-w-0 flex-col gap-6">
            {professional ? (
              <>
                <ThreadHeader thread={professional} caseState={caseState} />
                {composerFor(professional, "professional")}
                <div className="flex flex-wrap items-center gap-4">
                  <ButtonLink href={`${base}/record#outcome`} variant="quiet">
                    Record the outcome
                  </ButtonLink>
                  <span className="text-[13px] font-medium text-secondary">
                    Decisions, attendees and next steps with a named owner and a date.
                  </span>
                </div>
              </>
            ) : (
              <Panel as="div">
                <h4 className="text-[15px] font-bold leading-6 tracking-[-0.01em] text-ink">No coordination thread is open</h4>
                {!teamProposed ? (
                  teamFirst
                ) : caseState.state === "paused" ? (
                  <Notice kind="quiet" title="Paused" className="mt-4">
                    {caseState.pausedReason}
                  </Notice>
                ) : (
                  <div className="mt-4 flex flex-col gap-5">
                    <p className="prose-clinical text-[15px] leading-6 text-secondary">
                      Scoped to this patient and this decision, with a closed participant list, a stated purpose, and an
                      audit of who has read it. Colleagues other than the signed-in clinician are simulated.
                    </p>
                    <OpenThreadForm patientId={patient.id} channel="professional" defaultPurpose={professionalPurpose} />
                  </div>
                )}
              </Panel>
            )}
            {!professional ? professionalReview(false) : null}
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            {professional ? professionalReview(true) : null}
            <Panel title="Professional thread">
              <div className="flex flex-col gap-2 text-[13px] font-medium leading-5 text-secondary">
                <p>A proposal names a record field and a value. Agreements and concerns attach to it.</p>
                <p>
                  The outcome is assembled from these proposals, and a named clinician promotes a decision into the
                  record and signs. The thread itself never travels.
                </p>
              </div>
            </Panel>
          </aside>
        </div>
      </div>

      {/* Family channel: its own heading, its own rules, never mixed with the professional thread. */}
      <div className="mt-10 flex flex-col gap-5 border-t border-dashed border-line-strong pt-8">
        <div>
          <h3 className={SUBHEADING}>Family channel</h3>
          <p className="prose-clinical mt-2 text-[13px] font-medium leading-5 text-secondary">
            Never in the professional thread. Nothing posts here automatically: every entry is written or approved by a
            clinician, and it never carries clinical recommendations, ceilings of treatment or CPR content.
          </p>
        </div>
        <div className={GRID}>
          <div className="flex min-w-0 flex-col gap-6">
            {family ? (
              <>
                <ThreadHeader thread={family} caseState={caseState} />
                {composerFor(family, "family")}
              </>
            ) : (
              <Panel as="div">
                <h4 className="text-[15px] font-bold leading-6 tracking-[-0.01em] text-ink">No family channel is open</h4>
                {!teamProposed ? (
                  teamFirst
                ) : caseState.state === "paused" ? (
                  <Notice kind="quiet" title="Paused" className="mt-4">
                    {caseState.pausedReason}
                  </Notice>
                ) : (
                  <div className="mt-4 flex flex-col gap-5">
                    {familyParticipants.length === 0 ? (
                      <Notice kind="quiet">
                        No carer or next of kin is on the participants list. The channel can still be opened; add the
                        family participant in the{" "}
                        <Link href={`${base}/record#team`} className={ANCHOR}>
                          care team
                        </Link>{" "}
                        when the conversation names someone.
                      </Notice>
                    ) : (
                      <p className="text-[13px] font-medium leading-5 text-secondary">
                        Family participants: {familyParticipants.map((p) => `${p.name}, ${p.roleLabel ?? p.role}`).join("; ")}.
                      </p>
                    )}
                    <OpenThreadForm
                      patientId={patient.id}
                      channel="family"
                      defaultPurpose={FAMILY_PURPOSE}
                      note="Nothing posts automatically; every entry is written or approved by a clinician."
                      submitVariant="quiet"
                    />
                  </div>
                )}
              </Panel>
            )}
            {!family ? familyReview(false) : null}
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <Panel title="Family channel rules">
              <div className="flex flex-col gap-2 text-[13px] font-medium leading-5 text-secondary">
                <p>Content limited to:</p>
                <ul className="list-disc pl-5">
                  {FAMILY_ALLOWED_TOPICS.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <p>Anything else is refused in place, with the reason, before it reaches the family.</p>
              </div>
            </Panel>
            {family ? familyReview(true) : null}
          </aside>
        </div>
      </div>
    </section>
  );
}
