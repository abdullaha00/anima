"use client";

import { useEffect, useState } from "react";
import { Chip, Disclosure, Panel } from "@/components/ui";
import { RECOMMENDATION_LABEL } from "@/lib/stage2/present";
import type { Stage2Assessment } from "@/lib/cairn/types";

type StageOne = {
  decision: string;
  explanation: string;
  supportingEvidence: { interpretation: string }[];
  contradictoryEvidence: { interpretation: string }[];
  limitations: string[];
};

type SavedReview = {
  savedAt: string;
  stage1: StageOne;
  stage2: Stage2Assessment;
};

function List({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-[13px] text-muted">Nothing additional was recorded.</p>;
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-5 text-secondary marker:text-line-strong">
      {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
    </ul>
  );
}

export function LiveReassessment({ patientId }: { patientId: string }) {
  const [review, setReview] = useState<SavedReview>();

  useEffect(() => {
    const raw = sessionStorage.getItem(`cairn:reassessment:${patientId}`);
    if (!raw) return;
    try {
      setReview(JSON.parse(raw) as SavedReview);
    } catch {
      sessionStorage.removeItem(`cairn:reassessment:${patientId}`);
    }
  }, [patientId]);

  if (!review) return null;
  const recommendation = RECOMMENDATION_LABEL[review.stage2.recommendation];
  const evidence = review.stage1.supportingEvidence.map((item) => item.interpretation);
  const counterEvidence = review.stage1.contradictoryEvidence.map((item) => item.interpretation);

  return (
    <Panel title="Fresh live re-assessment" tone="brand">
      <div className="flex flex-col gap-5">
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Chip tone="affirm">Phase 1 complete</Chip>
            <span className="text-[12px] font-semibold text-muted">{review.stage1.decision.replaceAll("_", " ")}</span>
          </div>
          <p className="max-w-[72ch] text-[15px] leading-6 text-ink">{review.stage1.explanation}</p>
          <Disclosure className="mt-2" label="Show Phase 1 evidence">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1.5 text-[12px] font-semibold text-muted">Evidence supporting review</h4>
                <List items={evidence} />
              </div>
              <div>
                <h4 className="mb-1.5 text-[12px] font-semibold text-muted">Contradictory evidence</h4>
                <List items={counterEvidence} />
              </div>
            </div>
          </Disclosure>
        </section>

        <section className="border-t border-line pt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Chip tone={recommendation.tone}>Phase 2 complete · {recommendation.label}</Chip>
            <span className="text-[12px] text-muted">{recommendation.line}</span>
          </div>
          <p className="max-w-[72ch] text-[15px] leading-6 text-ink">{review.stage2.summary}</p>
          <Disclosure className="mt-2" label="Show ownership and immediate actions">
            <div className="flex flex-col gap-4">
              <div>
                <h4 className="mb-1 text-[12px] font-semibold text-muted">Proposed owner</h4>
                <p className="text-[14px] text-ink">{review.stage2.meeting.proposedOwner}</p>
              </div>
              <div>
                <h4 className="mb-1.5 text-[12px] font-semibold text-muted">Core care team</h4>
                <List items={review.stage2.careTeam.filter((member) => member.meetingPriority === "core").map((member) => `${member.name ?? member.role}${member.organisation ? ` · ${member.organisation}` : ""}: ${member.reason}`)} />
              </div>
              <div>
                <h4 className="mb-1.5 text-[12px] font-semibold text-muted">Immediate actions</h4>
                <List items={review.stage2.immediateActions.map((item) => `${item.action} — ${item.owner}, ${item.urgency}`)} />
              </div>
            </div>
          </Disclosure>
        </section>

        <p className="border-t border-line pt-3 text-[12px] leading-5 text-faint">
          Generated from the live simulator record in this browser session. Clinical decision support only; a named clinician decides.
        </p>
      </div>
    </Panel>
  );
}
