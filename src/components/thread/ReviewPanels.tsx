import type { ReactNode } from "react";
import type { Stage2Assessment } from "@/lib/cairn/types";
import { checkFamilyContent } from "@/lib/coordination/family-guard";
import { Disclosure, Microlabel, Notice, Panel } from "@/components/ui";
import {
  Citations,
  DRAFT_ONLY_LINE,
  FAMILY_DRAFT_LINE,
} from "@/components/review/Citations";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Microlabel>{label}</Microlabel>
      <p className="text-[14px] leading-6 text-ink">{children}</p>
    </div>
  );
}

function PlainList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <Microlabel>{label}</Microlabel>
      <ul className="list-disc pl-5 text-[14px] leading-6 text-ink">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Long review material beside an open thread folds away by default, so the side column
 * never runs thousands of pixels past the thread it sits next to. Native details, no script.
 */
function Collapsible({
  collapsed,
  summary,
  children,
}: {
  collapsed?: boolean;
  summary: string;
  children: ReactNode;
}) {
  if (!collapsed) return <>{children}</>;
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-primary hover:text-primary-hover">
        <span className="group-open:hidden">{summary}</span>
        <span className="hidden group-open:inline">Hide</span>
        <span
          aria-hidden="true"
          className="text-[11px] text-faint transition-transform group-open:rotate-180"
        >
          &#9662;
        </span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

/**
 * The meeting briefing the record review prepared: who should lead, when, how to hold it
 * and what it is for. Who, when, format and the first objective are read at a glance; the
 * rest of the objectives, the agenda and the briefing notes sit behind one disclosure.
 * Every note carries its citations.
 */
export function MeetingBriefing({
  meeting,
  collapsed,
}: {
  meeting: Stage2Assessment["meeting"];
  collapsed?: boolean;
}) {
  const [firstObjective, ...furtherObjectives] = meeting.objectives;
  const hasMore =
    furtherObjectives.length > 0 || meeting.agenda.length > 0 || meeting.briefingNotes.length > 0;
  return (
    <Panel title="Meeting briefing, from the record review">
      <Collapsible collapsed={collapsed} summary="Show the briefing">
        <div className="flex flex-col gap-4">
          <Field label="Who should lead">{meeting.proposedOwner}</Field>
          <Field label="When">{meeting.urgency}</Field>
          <Field label="Format and accessibility">
            {meeting.formatAndAccessibility}
          </Field>
          {firstObjective ? <Field label="Objective">{firstObjective}</Field> : null}
          {hasMore ? (
            <Disclosure label="Agenda and notes">
              <div className="flex flex-col gap-4">
                <PlainList label="Further objectives" items={furtherObjectives} />
                <PlainList label="Agenda" items={meeting.agenda} />
                {meeting.briefingNotes.length ? (
                  <div className="flex flex-col gap-1">
                    <Microlabel>Briefing notes</Microlabel>
                    <ul className="flex flex-col gap-3">
                      {meeting.briefingNotes.map((n, i) => (
                        <li key={i} className="flex flex-col gap-0.5">
                          <p className="text-[14px] leading-6 text-ink">{n.note}</p>
                          <Citations evidence={n.evidence} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Disclosure>
          ) : null}
          <p className="border-t border-line pt-3 text-[12px] leading-5 text-faint">
            A prompt for the clinician who runs the meeting, not a decision.
            Nothing here is posted to the thread.
          </p>
        </div>
      </Collapsible>
    </Panel>
  );
}

/**
 * Draft communications from the record review. Drafts only: Cairn never shares anything
 * itself. The audience and the cautions are what a clinician must read first, so they stay
 * in view; the draft body sits behind a disclosure. Family drafts sit on the family
 * channel with their cautions and the standing line; drafts for professionals sit on the
 * professional thread.
 */
export function DraftCommunications({
  communications,
  audience,
  collapsed,
}: {
  communications: Stage2Assessment["communications"];
  audience: "family" | "professional";
  collapsed?: boolean;
}) {
  if (communications.length === 0) return null;
  const family = audience === "family";
  return (
    <Panel
      title={
        family
          ? "Draft for the family, from the record review"
          : "Draft communications"
      }
    >
      <Collapsible
        collapsed={collapsed}
        summary={
          communications.length === 1
            ? "Show the draft"
            : `Show ${communications.length} drafts`
        }
      >
        <ul className="flex flex-col divide-y divide-line">
          {communications.map((c, i) => {
            // The family channel's content rules apply to a draft as they would to an entry.
            const guard = family
              ? checkFamilyContent(c.draft)
              : { ok: true as const };
            return (
              <li
                key={i}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-[15px] font-semibold leading-6 text-ink">{c.audience}</h4>
                  <p className="text-[13px] font-medium leading-5 text-secondary">{c.channel}</p>
                </div>
                <p className="text-[13px] font-medium leading-5 text-secondary">
                  {family ? FAMILY_DRAFT_LINE : DRAFT_ONLY_LINE}
                </p>
                {!guard.ok ? (
                  <Notice
                    kind="refuse"
                    title="Would be refused in the family channel"
                  >
                    {guard.reason}: &ldquo;{guard.matched}&rdquo;. Rewrite
                    before any of this reaches the family.
                  </Notice>
                ) : null}
                {c.cautions.length ? (
                  <div className="flex flex-col gap-1">
                    <Microlabel>Cautions</Microlabel>
                    <ul className="list-disc pl-5 text-[14px] leading-6 text-ink">
                      {c.cautions.map((x, j) => (
                        <li key={j}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <Disclosure label="Show the draft">
                  <div className="flex flex-col gap-3">
                    <blockquote className="prose-clinical font-voice text-[17px] leading-[1.45] text-ink">
                      {c.draft}
                    </blockquote>
                    <Citations evidence={c.evidence} />
                  </div>
                </Disclosure>
              </li>
            );
          })}
        </ul>
      </Collapsible>
    </Panel>
  );
}
