import type { Participant } from "@/lib/domain/types";
import type { Stage2Assessment } from "@/lib/cairn/types";
import { addParticipantForm } from "@/app/actions";
import { citationLine } from "@/lib/stage2/present";
import { Button, Chip } from "@/components/ui";
import { Citations, fieldsContain } from "@/components/review/Citations";
import { FIELD_CLASS, LABEL_CLASS, SELECT_CLASS } from "./form-classes";
import { PARTICIPANT_ROLES, guessRole } from "./roles";

/**
 * The care team the record review suggests, one row per role with the reason and the record
 * entries behind it. A row that already matches someone on the case says so; the others
 * carry a plain form that adds the person to the participants, with the role guessed and
 * open to change. Nothing is added without the clinician pressing the button.
 */
export function ReviewTeamSuggestions({
  patientId,
  careTeam,
  participants,
}: {
  patientId: string;
  careTeam: Stage2Assessment["careTeam"];
  participants: Participant[];
}) {
  if (careTeam.length === 0) return null;

  // Already on the case if the suggested role, or the named person, matches a participant.
  const onTeam = (role: string, name?: string) =>
    participants.some(
      (p) => fieldsContain([p.roleLabel, p.role, p.name], role) || (!!name && fieldsContain([p.name], name)),
    );

  return (
    <section aria-labelledby="review-team-heading" className="mt-5 border-t border-line pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="review-team-heading" className="text-[14px] font-bold tracking-[-0.01em] text-ink">
          Suggested by the record review
        </h3>
        <span className="text-[12px] text-faint tnum">{careTeam.length} suggested</span>
      </div>
      <p className="prose-clinical mt-1 mb-4 text-[13px] font-medium leading-5 text-secondary">
        A read-only reading of the whole record, checked by a second pass. Each suggestion carries its reason and the
        record entries behind it. Nobody joins the team unless you add them.
      </p>
      <ul className="flex flex-col divide-y divide-line border-t border-line">
        {careTeam.map((entry, i) => {
          const already = onTeam(entry.role, entry.name);
          const guessed = guessRole(entry.role);
          const evidence = entry.evidence[0] ? citationLine(entry.evidence[0]) : "record review";
          return (
            <li
              key={`${entry.role}-${i}`}
              className="flex flex-col gap-4 py-5 last:pb-0 md:flex-row md:items-start md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[15px] font-semibold leading-6 text-ink">{entry.role}</span>
                  {entry.meetingPriority === "core" ? (
                    <Chip tone="brand">Core to the meeting</Chip>
                  ) : (
                    <Chip>Optional</Chip>
                  )}
                  {already ? <Chip>already on the team</Chip> : null}
                </div>
                {entry.name || entry.organisation ? (
                  <p className="text-[13px] font-medium leading-5 text-secondary">
                    {[entry.name, entry.organisation].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {/* What they would own comes first; the reason for suggesting them follows. */}
                <p className="prose-clinical mt-2 text-[14px] leading-6 text-ink">{entry.ownership}</p>
                <p className="prose-clinical text-[14px] leading-6 text-secondary">{entry.reason}</p>
                <Citations evidence={entry.evidence} className="mt-1" />
              </div>

              {already ? null : (
                <form
                  action={addParticipantForm}
                  className="flex shrink-0 flex-col items-stretch gap-2 md:w-64 md:items-end"
                >
                  <input type="hidden" name="patientId" value={patientId} />
                  <input type="hidden" name="name" value={entry.name ?? entry.role} />
                  <input type="hidden" name="roleLabel" value={entry.role} />
                  <input type="hidden" name="organisation" value={entry.organisation ?? "to confirm"} />
                  <input type="hidden" name="reasonForInclusion" value={entry.reason} />
                  <input type="hidden" name="evidence" value={evidence} />
                  <input type="hidden" name="channel" value="professional" />
                  {entry.meetingPriority === "core" ? <input type="hidden" name="required" value="on" /> : null}
                  <label className={`${FIELD_CLASS} w-full`}>
                    <span className={LABEL_CLASS}>Role on the case</span>
                    <select name="role" required defaultValue={guessed} className={SELECT_CLASS}>
                      {PARTICIPANT_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button type="submit" variant="quiet" className="w-full md:w-auto">
                    Add to the team
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
