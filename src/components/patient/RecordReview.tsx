import type { ReactNode } from "react";
import type { EvidenceReference } from "@/lib/cairn/types";
import type { ReviewStatus } from "@/lib/stage2/read";
import { FALSE_POSITIVE_LABEL, PLANNING_LABEL, RECOMMENDATION_LABEL, VERIFICATION_LABEL, citationLine } from "@/lib/stage2/present";
import { formatDate, formatDateTime } from "@/lib/format";
import { Chip, Microlabel, Notice, Panel } from "@/components/ui";

/**
 * The Stage 2 record review for one patient: a read-only agent's reading of the whole
 * record, independently checked by a second pass. It is a prompt for clinical review and
 * clinical decision support only; a named clinician decides. Every statement shown carries
 * its citations into the record. The assessment's numeric confidence is never rendered.
 */

/** Citations under a statement: "GP record · r-54 · 12 Sept 2026 · detail", one per line. */
function Citations({ evidence }: { evidence: EvidenceReference[] }) {
  if (!evidence.length) return null;
  // The statement is the point; the sources sit one click away so the panel stays readable.
  return (
    <details className="mt-1">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center text-[12px] font-medium text-faint hover:text-primary-hover hover:underline">
        {evidence.length === 1 ? "1 source in the record" : `${evidence.length} sources in the record`}
      </summary>
      <ul className="mt-1 flex flex-col gap-0.5 border-l-2 border-line pl-3">
        {evidence.map((e, i) => (
          <li key={`${e.sourcePath}-${e.recordId ?? ""}-${i}`} className="text-[12px] leading-5 text-secondary tnum">
            {citationLine(e)}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** A small labelled list. Renders nothing when there is nothing to say. */
function SmallList({ label, items, voice = false }: { label: string; items: string[]; voice?: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <Microlabel>{label}</Microlabel>
      <ul className={`mt-1 flex flex-col ${voice ? "gap-1.5" : "gap-1"}`}>
        {items.map((s) => (
          <li key={s} className={voice ? "font-voice text-[17px] leading-[1.4] text-ink" : "text-[14px] leading-6 text-secondary"}>
            {voice ? <>&ldquo;{s}&rdquo;</> : s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-[13px] font-semibold text-ink">{children}</h3>;
}

/** A collapsed section, so the panel stays scannable. Keyboard reachable: summary is focusable. */
function Folded({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="border-t border-line pt-3">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-[13px] font-semibold text-ink underline-offset-4 hover:text-primary-hover hover:underline">
        {title}
      </summary>
      <div className="flex flex-col gap-3 pb-2 pt-1">{children}</div>
    </details>
  );
}

export function RecordReview({ status, patientName }: { status: ReviewStatus; patientName: string }) {
  const { review, pending, failed } = status;

  if (!review) {
    return (
      <Panel title="Record review">
        <div className="flex flex-col gap-3">
          <p className="text-[14px] leading-6 text-muted">No record review has been run for this patient.</p>
          {pending ? (
            <Notice kind="info">
              Record review {pending.status} since {formatDateTime(pending.createdAt)}.
            </Notice>
          ) : failed ? (
            <Notice kind="warn">The last record review failed.</Notice>
          ) : null}
        </div>
      </Panel>
    );
  }

  const a = review.assessment;
  const rec = RECOMMENDATION_LABEL[a.recommendation];
  const fam = a.patientAndFamily;
  const care = a.careBaseline;
  const fp = a.falsePositiveReview;
  const dq = a.dataQuality;

  return (
    <Panel title="Record review" tone="brand" aside={`${VERIFICATION_LABEL[a.verification.verdict]} · ${formatDateTime(review.completedAt)}`}>
      <div className="flex flex-col gap-5">
        {pending ? (
          <Notice kind="info">
            A fresh record review is {pending.status} since {formatDateTime(pending.createdAt)}.
          </Notice>
        ) : null}

        {/* 1. The reading, then the summary in the reviewer's own sentence. */}
        <div>
          <Chip tone={rec.tone}>{rec.label}</Chip>
          <p className="mt-2 text-[15px] leading-6 text-ink">{rec.line}</p>
          <p className="font-voice mt-3 text-[18px] leading-[1.4] text-ink">{a.summary}</p>
        </div>

        {/* 2. What the record shows */}
        <div className="border-t border-line pt-4">
          <Heading>What the record shows</Heading>
          {a.evidenceForReview.length ? (
            <ul className="flex flex-col gap-3">
              {a.evidenceForReview.map((e) => (
                <li key={e.signal}>
                  <p className="text-[15px] font-semibold leading-6 text-ink">{e.signal}</p>
                  <p className="text-[14px] leading-6 text-secondary">{e.significance}</p>
                  <Citations evidence={e.evidence} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] leading-6 text-muted">Nothing in the record was singled out for review.</p>
          )}
        </div>

        {/* 3. Existing planning */}
        <div className="border-t border-line pt-4">
          <Heading>Existing planning</Heading>
          <p className="text-[15px] leading-6 text-ink">{PLANNING_LABEL[a.existingPlanning.status]}</p>
          {a.existingPlanning.details.length ? (
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-[14px] leading-6 text-secondary">
              {a.existingPlanning.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
          <Citations evidence={a.existingPlanning.evidence} />
        </div>

        {/* 4 to 7 are folded so the panel stays scannable. */}
        <div className="flex flex-col">
          <Folded title="What they and their family want">
            <SmallList label={`In ${patientName}’s own words`} items={fam.patientWishes} voice />
            <SmallList label="Family wishes" items={fam.familyWishes} />
            <SmallList label="Legal and care planning records" items={fam.legalAndCarePlanningRecords} />
            <SmallList label="Contact preferences" items={fam.contactPreferences} />
            <SmallList label="Uncertainties" items={fam.uncertainties} />
            {!fam.patientWishes.length &&
            !fam.familyWishes.length &&
            !fam.legalAndCarePlanningRecords.length &&
            !fam.contactPreferences.length &&
            !fam.uncertainties.length ? (
              <p className="text-[14px] leading-6 text-muted">Nothing recorded about their wishes in the sources read.</p>
            ) : null}
            <Citations evidence={fam.evidence} />
          </Folded>

          <Folded title="Care at present">
            <div>
              <Microlabel>Residence</Microlabel>
              <p className="mt-1 text-[14px] leading-6 text-secondary">{care.residence}</p>
            </div>
            <div>
              <Microlabel>Function and mobility</Microlabel>
              <p className="mt-1 text-[14px] leading-6 text-secondary">{care.functionAndMobility}</p>
            </div>
            <SmallList label="Current clinical support" items={care.currentClinicalSupport} />
            <SmallList label="Family and carer support" items={care.familyAndCarerSupport} />
            <SmallList label="Gaps" items={care.gaps} />
            <Citations evidence={care.evidence} />
          </Folded>

          <Folded title="Could this be a false positive?">
            <p className="text-[15px] leading-6 text-ink">{FALSE_POSITIVE_LABEL[fp.verdict]}</p>
            <SmallList label="Alternative explanations" items={fp.alternativeExplanations} />
            <SmallList label="Reasons a conversation may be inappropriate" items={fp.reasonsConversationMayBeInappropriate} />
            <SmallList label="Reasons not to offer false reassurance" items={fp.reasonsNotToOfferFalseReassurance} />
            <Citations evidence={fp.evidence} />
          </Folded>

          <Folded title="Data quality">
            <p className="text-[14px] leading-6 text-secondary">{dq.coverageSummary}</p>
            <SmallList label="Missing sources" items={dq.missingSources} />
            <SmallList label="Failed sources" items={dq.failedSources} />
            <SmallList label="Contradictions" items={dq.contradictions} />
          </Folded>
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <p className="text-[12px] leading-5 text-faint">
            Clinical decision support only. A named clinician decides. Generated {formatDate(a.generatedAt)},{" "}
            {review.source === "run" ? "from a worker run" : "committed for the demonstration"}.
          </p>
        </div>
      </div>
    </Panel>
  );
}
