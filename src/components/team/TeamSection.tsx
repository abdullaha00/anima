import type { PatientContext } from "@/lib/patient-context";
import type { RecordReview } from "@/lib/stage2/read";
import { assembleTeamForm } from "@/app/actions";
import { Button, EmptyLine, Notice, Panel } from "@/components/ui";
import { ParticipantRow } from "@/components/team/ParticipantRow";
import { AddParticipantForm } from "@/components/team/AddParticipantForm";
import { ReviewTeamSuggestions } from "@/components/team/ReviewTeamSuggestions";

const SUBHEADING = "text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink";

/**
 * Care team: who needs to be involved, and why. Every participant carries a reason traced
 * to the record. One card: the proposed professional team, Cairn's suggestions from the
 * review, and the form to add someone.
 */
export function TeamSection({ ctx, review }: { ctx: PatientContext; review?: RecordReview }) {
  const { patient, caseState } = ctx;
  const { participants, state } = caseState;

  const professionals = participants.filter((p) => p.channel === "professional" && !p.recipientOnly);

  return (
    <section id="team" aria-labelledby="team-heading" className="scroll-mt-[112px]">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="team-heading" className="font-display text-[22px] leading-tight text-ink">
          Care team
        </h2>
        {professionals.length ? (
          <span className="text-[13px] font-medium text-secondary tnum">{professionals.length} in the team</span>
        ) : null}
      </div>

      {participants.length === 0 ? (
        <Panel heading="h3" as="div" tone="brand">
          <h3 className={SUBHEADING}>Who needs to be involved, and why</h3>
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
        <Panel heading="h3" as="div" tone="brand">
          <h3 className={SUBHEADING}>Who needs to be involved, and why</h3>
          <p className="prose-clinical mt-2 mb-5 text-[13px] font-medium leading-5 text-secondary">
            Every participant carries a reason and the record entry behind it, so the list can be checked rather than
            trusted. Colleagues other than the signed-in clinician are simulated for this demonstration.
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
            <ReviewTeamSuggestions patientId={patient.id} careTeam={review.assessment.careTeam} participants={participants} />
          ) : null}
          <AddParticipantForm patientId={patient.id} />
        </Panel>
      )}
    </section>
  );
}
