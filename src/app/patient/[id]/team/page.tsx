import { loadPatientContext } from "@/lib/patient-context";
import { PatientStrip } from "@/components/shell/PatientStrip";
import { assembleTeamForm } from "@/app/actions";
import { DEMO_PATIENT_IDS, DEMO_THREAD_PURPOSE, defaultPurpose } from "@/lib/coordination/fixtures";
import { Button, ButtonLink, Chip, EmptyLine, Microlabel, Notice, Panel } from "@/components/ui";
import { ParticipantRow } from "@/components/team/ParticipantRow";
import { RemovedGroup } from "@/components/team/RemovedGroup";
import { AddParticipantForm } from "@/components/team/AddParticipantForm";
import { OpenThreadForm } from "@/components/team/OpenThreadForm";
import { ReviewTeamSuggestions } from "@/components/team/ReviewTeamSuggestions";
import { getReviewStatus } from "@/lib/stage2/read";

export const dynamic = "force-dynamic";

/**
 * Screen 3: who needs to be involved, and why. Every participant carries a reason traced
 * to the record. Recipients of the signed record and the family channel are kept visibly
 * apart from the professional thread.
 */
export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { patient, assessment, caseState } = await loadPatientContext(id);
  const { participants, state } = caseState;
  const { review } = await getReviewStatus(patient.id);

  const professionals = participants.filter((p) => p.channel === "professional" && !p.recipientOnly);
  const recipients = participants.filter((p) => p.recipientOnly);
  const family = participants.filter((p) => p.channel === "family" && !p.recipientOnly);
  const professionalThread = caseState.threads.find((t) => t.channel === "professional");
  const purpose = DEMO_PATIENT_IDS.includes(patient.id) ? DEMO_THREAD_PURPOSE : defaultPurpose(patient, assessment);
  const requiredCount = professionals.filter((p) => p.required).length;

  return (
    <div>
      <PatientStrip patient={patient} assessment={assessment} caseState={caseState} current="/team" />

      {participants.length === 0 ? (
        <Panel className="max-w-2xl">
          <h2 className="font-display text-[22px] leading-tight text-ink">Who needs to be involved, and why</h2>
          {state === "flagged" ? (
            <form action={assembleTeamForm} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="patientId" value={patient.id} />
              <p className="prose-clinical text-[15px] leading-6 text-secondary">
                The team has not been proposed yet. Cairn reads the indicators and the recorded needs and proposes who
                should be involved, each with a reason and the record entry behind it. You add and remove from there.
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
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="flex min-w-0 flex-col gap-8">
            <Panel as="div" tone="brand">
              <section aria-labelledby="team-heading">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 id="team-heading" className="font-display text-[22px] leading-tight text-ink">
                    Who needs to be involved, and why
                  </h2>
                  <span className="text-[13px] font-medium text-secondary tnum">
                    {professionals.length} in the thread, {requiredCount} required
                  </span>
                </div>
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
              </section>
            </Panel>

            <Panel as="div">
              <section aria-labelledby="family-heading">
                <h2 id="family-heading" className="text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink">
                  Family channel
                </h2>
                <p className="prose-clinical mt-2 mb-5 text-[13px] font-medium leading-5 text-secondary">
                  Never in the professional thread. Content limited to what matters, place preferences, who is involved,
                  practical arrangements and questions. Nothing is posted there automatically.
                </p>
                {family.length ? (
                  <ul className="flex flex-col divide-y divide-line border-t border-line pt-5">
                    {family.map((p) => (
                      <ParticipantRow key={p.id} participant={p} patientId={patient.id} controls="remove" />
                    ))}
                  </ul>
                ) : (
                  <EmptyLine>No carer or next of kin is recorded. Add one above if the conversation names someone.</EmptyLine>
                )}
              </section>
            </Panel>

            <Panel as="div">
              <section aria-labelledby="recipients-heading" className="border-t border-dashed border-line-strong pt-5">
                <h2 id="recipients-heading" className="text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink">
                  Recipients of the signed record
                </h2>
                <p className="prose-clinical mt-2 mb-4 text-[13px] font-medium leading-5 text-secondary">
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
              </section>
            </Panel>

            <RemovedGroup removed={caseState.removedParticipants} />
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <Panel title="Next action">
              {professionalThread ? (
                <div className="flex min-w-0 flex-col gap-4">
                  <p className="text-[15px] leading-6 text-secondary">
                    The professional coordination thread is open with {professionalThread.participantIds.length}{" "}
                    participants.
                  </p>
                  <ButtonLink href={`/patient/${patient.id}/thread`} variant="primary">
                    Go to the coordination thread
                  </ButtonLink>
                </div>
              ) : state === "team assembled" ? (
                <div className="flex min-w-0 flex-col gap-3">
                  <Microlabel>Open the coordination thread</Microlabel>
                  <p className="text-[13px] font-medium leading-5 text-secondary">
                    Scoped to this patient and this decision, with a closed participant list and an audit of who has
                    read it.
                  </p>
                  <OpenThreadForm patientId={patient.id} channel="professional" defaultPurpose={purpose} />
                </div>
              ) : state === "paused" ? (
                <Notice kind="quiet" title="Paused">
                  {caseState.pausedReason}
                </Notice>
              ) : (
                <p className="text-[15px] leading-6 text-secondary">
                  No coordination thread has been opened for this case.
                </p>
              )}
            </Panel>

            <Panel title="How the team was proposed">
              <p className="prose-clinical text-[13px] font-medium leading-5 text-secondary">
                The usual GP is always included and holds the record. Specialists follow the indicators present.
                Frailty or a change in care needs brings the community matron and social care. Five or more medicines
                brings a pharmacist. Out of hours and the ambulance service are recipients only.
              </p>
            </Panel>
          </aside>
        </div>
      )}
    </div>
  );
}
