import type { ReactNode } from "react";
import type { EvidenceReference } from "@/lib/cairn/types";
import type { ReviewStatus } from "@/lib/stage2/read";
import { FALSE_POSITIVE_LABEL, PLANNING_LABEL, RECOMMENDATION_LABEL, VERIFICATION_LABEL, citationLine } from "@/lib/stage2/present";
import { formatDate, formatDateTime } from "@/lib/format";
import { Chip, Notice, Panel } from "@/components/ui";

/**
 * The Stage 2 record review for one patient: a read-only agent's reading of the whole
 * record, independently checked by a second pass. It is a prompt for clinical review and
 * clinical decision support only; a named clinician decides. Every statement shown carries
 * its citations into the record, one click away. The numeric confidence is never rendered.
 *
 * Layout: the reading and the summary first; then the findings as a grid of tiles; then two
 * columns for the person and their care; then the checks. Labels are quiet, content leads.
 */

function Citations({ evidence }: { evidence: EvidenceReference[] }) {
  if (!evidence.length) return null;
  return (
    <details className="mt-2">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-[12px] font-medium text-faint hover:text-primary-hover hover:underline">
        <span aria-hidden="true" className="text-[10px]">&#9656;</span>
        {evidence.length === 1 ? "1 source in the record" : `${evidence.length} sources in the record`}
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1 border-l-2 border-line pl-3">
        {evidence.map((e, i) => (
          <li key={`${e.sourcePath}-${e.recordId ?? ""}-${i}`} className="text-[12px] leading-5 text-secondary tnum">
            {citationLine(e)}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** A section head: quiet label, generous space above, content carries the weight. */
function Section({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <section className={`border-t border-line pt-5 ${className}`}>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</h3>
      {children}
    </section>
  );
}

/** A labelled list inside a section. Renders nothing when there is nothing to say. */
const SUBLABEL = "text-[12px] font-bold uppercase tracking-[0.04em] text-secondary";

function Facts({ label, items, voice = false }: { label: string; items: string[]; voice?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="max-w-[72ch]">
      <p className={SUBLABEL}>{label}</p>
      {voice ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((s) => (
            <li key={s} className="font-voice text-[17px] leading-[1.4] text-ink">
              &ldquo;{s}&rdquo;
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 marker:text-line-strong">
          {items.map((s) => (
            <li key={s} className="pl-1 text-[14px] leading-6 text-ink">
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="max-w-[72ch]">
      <p className={SUBLABEL}>{label}</p>
      <p className="mt-1.5 text-[14px] leading-6 text-ink">{value}</p>
    </div>
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
  const nothingAboutWishes =
    !fam.patientWishes.length &&
    !fam.familyWishes.length &&
    !fam.legalAndCarePlanningRecords.length &&
    !fam.contactPreferences.length &&
    !fam.uncertainties.length;

  return (
    <Panel title="Record review" tone="brand" aside={`${VERIFICATION_LABEL[a.verification.verdict]} · ${formatDateTime(review.completedAt)}`}>
      <div className="flex flex-col gap-6">
        {pending ? (
          <Notice kind="info">
            A fresh record review is {pending.status} since {formatDateTime(pending.createdAt)}.
          </Notice>
        ) : null}

        {/* The reading, then the reviewer's summary at a comfortable measure. */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Chip tone={rec.tone} className="px-2.5 py-1.5 text-[12px]">
              {rec.label}
            </Chip>
            <p className="text-[14px] leading-6 text-secondary">{rec.line}</p>
          </div>
          <p className="max-w-[72ch] text-[16px] leading-[1.6] text-ink">{a.summary}</p>
        </div>

        {/* What the record shows: one tile per finding, so four findings read as four things. */}
        <Section label="What the record shows">
          {a.evidenceForReview.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {a.evidenceForReview.map((e) => (
                <li key={e.signal} className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
                  <p className="text-[14px] font-semibold leading-5 text-ink">{e.signal}</p>
                  <p className="mt-1.5 text-[13px] leading-5 text-secondary">{e.significance}</p>
                  <Citations evidence={e.evidence} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] leading-6 text-muted">Nothing in the record was singled out for review.</p>
          )}
        </Section>

        {/* Existing planning: the one line a clinician checks first. */}
        <Section label="Existing planning">
          <p className="text-[15px] font-semibold leading-6 text-ink">{PLANNING_LABEL[a.existingPlanning.status]}</p>
          {a.existingPlanning.details.length ? (
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[14px] leading-6 text-secondary">
              {a.existingPlanning.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
          <Citations evidence={a.existingPlanning.evidence} />
        </Section>

        {/* The person and their care, side by side. */}
        <Section label="What they and their family want">
          <div className="flex flex-col gap-5">
              <Facts label={`In ${patientName}’s own words`} items={fam.patientWishes} voice />
              <Facts label="Family wishes" items={fam.familyWishes} />
              <Facts label="Legal and care planning records" items={fam.legalAndCarePlanningRecords} />
              <Facts label="Contact preferences" items={fam.contactPreferences} />
              <Facts label="Uncertainties" items={fam.uncertainties} />
              {nothingAboutWishes ? (
                <p className="text-[14px] leading-6 text-muted">Nothing recorded about their wishes in the sources read.</p>
              ) : null}
              <Citations evidence={fam.evidence} />
          </div>
        </Section>

        <Section label="Care at present">
          <div className="flex flex-col gap-5">
              <Pair label="Residence" value={care.residence} />
              <Pair label="Function and mobility" value={care.functionAndMobility} />
              <Facts label="Current clinical support" items={care.currentClinicalSupport} />
              <Facts label="Family and carer support" items={care.familyAndCarerSupport} />
              <Facts label="Gaps" items={care.gaps} />
              <Citations evidence={care.evidence} />
          </div>
        </Section>

        {/* The checks: could this be a false positive, and how good was the data. */}
        <Section label="Could this be a false positive?">
          <div className="flex flex-col gap-5">
              <p className="text-[15px] font-semibold leading-6 text-ink">{FALSE_POSITIVE_LABEL[fp.verdict]}</p>
              <Facts label="Alternative explanations" items={fp.alternativeExplanations} />
              <Facts label="Reasons a conversation may be inappropriate" items={fp.reasonsConversationMayBeInappropriate} />
              <Facts label="Reasons not to offer false reassurance" items={fp.reasonsNotToOfferFalseReassurance} />
              <Citations evidence={fp.evidence} />
          </div>
        </Section>

        <Section label="Data quality">
          <div className="flex flex-col gap-5">
              <p className="max-w-[72ch] text-[14px] leading-6 text-ink">{dq.coverageSummary}</p>
              <Facts label="Missing sources" items={dq.missingSources} />
              <Facts label="Failed sources" items={dq.failedSources} />
              {dq.contradictions.length ? (
                <div className="rounded-md border border-warn-border bg-warn-soft px-4 py-3">
                  <p className="text-[12px] font-semibold text-warn">Contradictions in the record</p>
                  <ul className="mt-1 flex flex-col gap-1 text-[13px] leading-5 text-ink">
                    {dq.contradictions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
          </div>
        </Section>

        <p className="border-t border-line pt-4 text-[12px] leading-5 text-faint">
          Clinical decision support only. A named clinician decides. Generated {formatDate(a.generatedAt)},{" "}
          {review.source === "run" ? "from a worker run" : "committed for the demonstration"}
          {review.wordingAdjusted ? "; wording adjusted to Cairn's language rules where the review used terms Cairn avoids" : ""}.
        </p>
      </div>
    </Panel>
  );
}
