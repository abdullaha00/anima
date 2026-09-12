import type { ReactNode } from "react";
import type { EvidenceReference } from "@/lib/cairn/types";
import type { ReviewStatus } from "@/lib/stage2/read";
import { RECOMMENDATION_LABEL, citationLine } from "@/lib/stage2/present";
import { formatDate, formatDateTime } from "@/lib/format";
import { Chip, Disclosure, Microlabel, Notice, Panel } from "@/components/ui";

/**
 * The Stage 2 record review for one patient: a read-only agent's reading of the whole
 * record, independently checked by a second pass. It is a prompt for clinical review and
 * clinical decision support only; a named clinician decides. The numeric confidence is
 * never rendered.
 *
 * Layout: the two-line verdict and the summary are all that shows by default. The rest of
 * the reading (what the record shows, what the person and their family want, care at
 * present) folds under one disclosure, with citations one click deeper again. The person's
 * own words are not repeated here; the patient page carries them at size.
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

/** One part of the full review: a hairline, a sentence-case heading, the content. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-3 text-[13px] font-semibold leading-5 text-ink">{title}</h3>
      {children}
    </section>
  );
}

/** A labelled list inside a part. Renders nothing when there is nothing to say. */
function Facts({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="max-w-[72ch]">
      <Microlabel>{label}</Microlabel>
      <ul className="mt-1.5 flex list-disc flex-col gap-1.5 pl-5 marker:text-line-strong">
        {items.map((s) => (
          <li key={s} className="pl-1 text-[14px] leading-6 text-ink">
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="max-w-[72ch]">
      <Microlabel>{label}</Microlabel>
      <p className="mt-1 text-[14px] leading-6 text-ink">{value}</p>
    </div>
  );
}

export function RecordReview({ status }: { status: ReviewStatus }) {
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
  const nothingAboutWishes = !fam.familyWishes.length && !fam.contactPreferences.length && !fam.uncertainties.length;

  return (
    <Panel title="Record review">
      <div className="flex flex-col gap-4">
        {pending ? (
          <Notice kind="info">
            A fresh record review is {pending.status} since {formatDateTime(pending.createdAt)}.
          </Notice>
        ) : null}

        {/* The verdict in two lines, then the reviewer's summary at a comfortable measure. */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Chip tone={rec.tone} className="px-2.5 py-1.5 text-[12px]">
              {rec.label}
            </Chip>
            <p className="text-[14px] leading-6 text-secondary">{rec.line}</p>
          </div>
          <p className="max-w-[72ch] text-[16px] leading-[1.6] text-ink">{a.summary}</p>
        </div>

        <Disclosure label="Show the full review">
          <div className="flex flex-col gap-5">
            {/* What the record shows: one tile per finding, so four findings read as four things. */}
            <Part title="What the record shows">
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
            </Part>

            <Part title="What they and their family want">
              <div className="flex flex-col gap-4">
                <Facts label="Family wishes" items={fam.familyWishes} />
                <Facts label="Contact preferences" items={fam.contactPreferences} />
                <Facts label="Uncertainties" items={fam.uncertainties} />
                {nothingAboutWishes ? (
                  <p className="text-[14px] leading-6 text-muted">Nothing recorded about their wishes in the sources read.</p>
                ) : null}
                <Citations evidence={fam.evidence} />
              </div>
            </Part>

            <Part title="Care at present">
              <div className="flex flex-col gap-4">
                <Pair label="Residence" value={care.residence} />
                <Pair label="Function and mobility" value={care.functionAndMobility} />
                <Facts label="Current clinical support" items={care.currentClinicalSupport} />
                <Facts label="Family and carer support" items={care.familyAndCarerSupport} />
                <Facts label="Gaps" items={care.gaps} />
                <Citations evidence={care.evidence} />
              </div>
            </Part>

            <p className="border-t border-line pt-4 text-[12px] leading-5 text-faint">
              Clinical decision support only. A named clinician decides. Generated {formatDate(a.generatedAt)},{" "}
              {review.source === "run" ? "from a worker run" : "committed for the demonstration"}
              {review.wordingAdjusted ? "; wording adjusted to Cairn's language rules where the review used terms Cairn avoids" : ""}.
            </p>
          </div>
        </Disclosure>
      </div>
    </Panel>
  );
}
