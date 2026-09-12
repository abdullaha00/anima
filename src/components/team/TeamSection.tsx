import type { PatientContext } from "@/lib/patient-context";
import type { RecordReview } from "@/lib/stage2/read";
import { assembleTeamForm } from "@/app/actions";
import { DEMO_PATIENT_IDS, DEMO_THREAD_PURPOSE, defaultPurpose } from "@/lib/coordination/fixtures";
import { Button, ButtonLink, Chip, EmptyLine, Microlabel, Notice, Panel, Section } from "@/components/ui";
import { ParticipantRow } from "@/components/team/ParticipantRow";
import { RemovedGroup } from "@/components/team/RemovedGroup";
import { AddParticipantForm } from "@/components/team/AddParticipantForm";
import { OpenThreadForm } from "@/components/team/OpenThreadForm";
import { ReviewTeamSuggestions } from "@/components/team/ReviewTeamSuggestions";

const SUBHEADING = "text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink";

/**
 * Care team: who needs to be involved, and why. Every participant carries a reason traced
 * to the record. The proposed professional team is the one card; the family channel and the
 * recipients of the signed record sit under it as quiet groupings on the ground, visibly
 * apart from the professional thread.
 */
export function TeamSection({ ctx, review }: { ctx: PatientContext; review?: RecordReview }) {
  const { patient, assessment, caseState } = ctx;
  const { participants, state } = caseState;
  const base = `/patient/${patient.id}`;

  const professionals = participants.filter((p) => p.channel === "professional" && !p.recipientOnly);
  const recipients = participants.filter((p) => p.recipientOnly);
  const family = participants.filter((p) => p.channel === "family" && !p.recipientOnly);
  const professionalThread = caseState.threads.find((t) => t.channel === "professional");
  const purpose = DEMO_PATIENT_IDS.includes(patient.id) ? DEMO_THREAD_PURPOSE : defaultPurpose(patient, assessment);
  const requiredCount = professionals.filter((p) => p.required).length;

  return (
    <section id="team" aria-labelledby="team-heading" className="scroll-mt-[112px]">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="team-heading" className="font-display text-[22px] leading-tight text-ink">
          Care team
        </h2>
        {participants.length ? (
          <span className="text-[13px] font-medium text-secondary tnum">
            {professionals.length} in the thread, {requiredCount} required
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {participants.length === 0 ? (
            <Panel heading="h3" as="div" tone="brand">
              <h3 className={SUBHEADING}>Who needs to be involved, and why</h3>
              {state === "flagged" ? (
                <form action={assembleTeamForm} className="mt-4 flex flex-col gap-4">
                  <input type="hidden" name="patientId" value={patient.id} />
                  <p className="prose-clinical text-[15px] leading-6 text-secondary">
                    The team has not been proposed yet. Cairn reads the indicators and the recorded needs and proposes
                    who should be involved, each with a reason and the record entry behind it. You add and remove from
                    there.
                  </p>
                  <div>
                    <Button type="submit" variant="primary">
                      Assemble the team
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-4 flex flex-col gap-3">
                  <EmptyLine>No participants have been proposed for this case.</EmptyLine>
                  {state === "paused" ? (
                    <Notice kind="quiet" title="Paused">
                      {caseState.pausedReason}
                    </Notice>
                  ) : null}
                </div>
              )}
            </Panel>
          ) : (
            <>
              <Panel heading="h3" as="div" tone="brand">
                <h3 className={SUBHEADING}>Who needs to be involved, and why</h3>
                <p className="prose-clinical mt-2 mb-5 text-[13px] font-medium leading-5 text-secondary">
                  Every participant carries a reason and the record entry behind it, so the list can be checked rather
                  than trusted. Colleagues other than the signed-in clinician are simulated for this demonstration.
                </p>
                {professionals.length ? (
                  <ul className="flex flex-col divide-y divide-line border-t border-line pt-5">
                    {professionals.map((p) => (
                      <ParticipantRow key={p.id} participant={p} patientId={patient.id} controls="full" />
                    ))}
                  </ul>
                ) : (
                  <EmptyLine>No professional participants remain on this case.</EmptyLine>
                )}
                {review ? (
                  <ReviewTeamSuggestions
                    patientId={patient.id}
                    careTeam={review.assessment.careTeam}
                    participants={participants}
                  />
                ) : null}
                <AddParticipantForm patientId={patient.id} />
              </Panel>

              {/* Quiet groupings on the ground: the professional team above is the one card. */}
              <Section title="Family channel" aside={family.length ? `${family.length} on the channel` : undefined}>
                <p className="prose-clinical mb-4 text-[13px] font-medium leading-5 text-secondary">
                  Never in the professional thread. Content limited to what matters, place preferences, who is involved,
                  practical arrangements and questions. Nothing is posted there automatically.
                </p>
                {family.length ? (
                  <ul className="flex flex-col divide-y divide-line">
                    {family.map((p) => (
                      <ParticipantRow key={p.id} participant={p} patientId={patient.id} controls="remove" />
                    ))}
                  </ul>
                ) : (
                  <EmptyLine>No carer or next of kin is recorded. Add one above if the conversation names someone.</EmptyLine>
                )}
              </Section>

              <Section
                title="Recipients of the signed record"
                aside={recipients.length ? `${recipients.length} recipients` : undefined}
              >
                <p className="prose-clinical mb-4 text-[13px] font-medium leading-5 text-secondary">
                  They receive the signed record and never join the thread.
                </p>
                {recipients.length ? (
                  <ul className="flex flex-col divide-y divide-line">
                    {recipients.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 first:pt-0 last:pb-0">
                        <span className="text-[15px] font-bold leading-6 text-ink">{p.name}</span>
                        {p.organisation !== p.name ? (
                          <span className="text-[13px] font-medium text-secondary">{p.organisation}</span>
                        ) : null}
                        <Chip className="sm:ml-auto">recipient of the signed record</Chip>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyLine>No recipients listed. Out of hours and the ambulance service are added on sharing.</EmptyLine>
                )}
              </Section>

              <RemovedGroup removed={caseState.removedParticipants} />
            </>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Panel heading="h3" title="Next action">
            {professionalThread ? (
              <div className="flex min-w-0 flex-col gap-4">
                <p className="text-[15px] leading-6 text-secondary">
                  The professional coordination thread is open with {professionalThread.participantIds.length}{" "}
                  participants.
                </p>
                <ButtonLink href={`${base}/record#thread`} variant="primary">
                  Go to the coordination thread
                </ButtonLink>
              </div>
            ) : state === "team assembled" ? (
              <div className="flex min-w-0 flex-col gap-3">
                <Microlabel>Open the coordination thread</Microlabel>
                <p className="text-[13px] font-medium leading-5 text-secondary">
                  Scoped to this patient and this decision, with a closed participant list and an audit of who has read
                  it.
                </p>
                <OpenThreadForm patientId={patient.id} channel="professional" defaultPurpose={purpose} />
              </div>
            ) : state === "paused" ? (
              <Notice kind="quiet" title="Paused">
                {caseState.pausedReason}
              </Notice>
            ) : state === "flagged" ? (
              <p className="text-[15px] leading-6 text-secondary">
                Assemble the team first. Opening the coordination thread follows.
              </p>
            ) : (
              <p className="text-[15px] leading-6 text-secondary">No coordination thread has been opened for this case.</p>
            )}
          </Panel>

          <Panel heading="h3" title="How the team was proposed">
            <p className="prose-clinical text-[13px] font-medium leading-5 text-secondary">
              The usual GP is always included and holds the record. Specialists follow the indicators present. Frailty
              or a change in care needs brings the community matron and social care. Five or more medicines brings a
              pharmacist. Out of hours and the ambulance service are recipients only.
            </p>
          </Panel>
        </aside>
      </div>
    </section>
  );
}
