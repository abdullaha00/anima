import type { CaseState } from "@/lib/domain/types";
import type { MortalityInput, MortalityResult } from "@/lib/stage1/mortality-schema";
import { latestScreeningFor, verifiedLinkedReview, type CompletedScreening } from "@/lib/stage1/linked-review";
import { softenWording } from "@/lib/stage2/read";
import { sourceName } from "@/lib/stage2/present";
import { formatDate } from "@/lib/format";
import { Chip, EmptyLine, Microlabel, Panel, type ChipTone } from "@/components/ui";
import { ClinicalReview } from "@/components/screening/ClinicalReview";

/**
 * The three-month screening for one patient: the decision in words, the record entries the
 * screening read, what points the other way, and its limitations. The estimate itself is
 * never shown; the decision and the evidence are what a clinician can check.
 */

type Evidence = MortalityResult["supportingEvidence"][number];
type InputRecord = MortalityInput["records"][number];

const DECISION: Record<MortalityResult["decision"], { tone: ChipTone; label: string }> = {
  above_threshold: { tone: "info", label: "Above the review threshold" },
  below_threshold: { tone: "neutral", label: "Below the review threshold" },
  not_assessed: { tone: "neutral", label: "Not assessed" },
};

const STATUS_WORD: Record<MortalityResult["status"], string> = {
  scored: "scored",
  abstained: "abstained",
  ineligible: "ineligible",
  failed: "failed",
};

const DATE_FIELDS = ["createdAt", "updatedAt", "modifiedAt", "recordedAt", "authoredOn", "effectiveDateTime", "issued", "date", "timestamp"];

/** A figure that could read as the estimate or the threshold: a percentage, a decimal fraction or a "1 in 4" ratio. */
const FIGURE = /\d+(?:\.\d+)?\s*%|\b0?\.\d+\b|\b\d+\s*(?:in|out of)\s*\d+\b/;

/** The first sentence of the text that carries no figure, in Cairn's wording. Falls back to the first sentence with figures removed. */
function firstSentence(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const { value } = softenWording(text.trim());
  const sentences = value.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const clean = sentences.find(s => !FIGURE.test(s));
  const chosen = clean ?? sentences[0]?.replace(new RegExp(FIGURE.source, "g"), "").replace(/\s{2,}/g, " ").trim();
  if (!chosen) return undefined;
  return /[.!?]$/.test(chosen) ? chosen : `${chosen}.`;
}

function humanise(s: string): string {
  const t = s.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Where an entry came from and when, read from the frozen record rather than invented. */
function entryParts(record: InputRecord | undefined): { source: string; date?: string } {
  const value = record && typeof record.value === "object" && record.value && !Array.isArray(record.value) ? (record.value as Record<string, unknown>) : undefined;
  const kind = value && typeof value.kind === "string" ? value.kind : value && typeof value.resourceType === "string" ? value.resourceType : undefined;
  const sourcePath = record?.sourcePaths.find(p => p.startsWith("record/"));
  const source = kind ? humanise(kind) : sourcePath ? humanise(sourceName(sourcePath)) : "Record entry";
  let date: string | undefined;
  for (const field of DATE_FIELDS) {
    const raw = value?.[field];
    const ms = typeof raw === "number" ? raw : typeof raw === "string" ? Date.parse(raw) : NaN;
    if (Number.isFinite(ms)) { date = formatDate(new Date(ms).toISOString()); break; }
  }
  return { source, date };
}

/**
 * One record entry the screening read: where and when on the first line with the entry's
 * id set small on the right, the exact quote from the record, then the screening's reading
 * of it underneath in a quieter tone.
 */
function EvidenceItem({ evidence: e, record }: { evidence: Evidence; record?: InputRecord }) {
  const { source, date } = entryParts(record);
  const reading = firstSentence(e.interpretation) ?? softenWording(e.interpretation).value;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {/* Source and date stay together; the id sits on the right at sm+ and drops to its own line on a phone. */}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0 text-[12px] leading-5">
        <span className="font-semibold text-secondary">{source}</span>
        {date ? (
          <>
            <span aria-hidden="true" className="text-faint">&middot;</span>
            <span className="whitespace-nowrap text-faint tnum">{date}</span>
          </>
        ) : null}
        <span className="basis-full break-all font-mono text-[11px] text-faint tnum sm:ml-auto sm:basis-auto sm:pl-3">{e.recordId}</span>
      </div>
      <p className="max-w-[72ch] break-words text-[13px] leading-5 text-ink">&ldquo;{e.quote.trim()}&rdquo;</p>
      <p className="max-w-[72ch] break-words text-[13px] leading-5 text-secondary">{reading}</p>
    </div>
  );
}

function EvidenceList({ items, records }: { items: Evidence[]; records: Map<string, InputRecord> }) {
  return (
    <ul className="flex min-w-0 flex-col gap-3 border-l-2 border-stone-200 pl-3">
      {items.map((e, i) => (
        <li key={`${e.recordId}-${e.pointer}-${i}`}>
          <EvidenceItem evidence={e} record={records.get(e.recordId)} />
        </li>
      ))}
    </ul>
  );
}

/** Where the screened record came from, in plain words. Never the raw provenance string. */
function provenanceLine(s: CompletedScreening): string {
  if (s.coverage.kind === "cached" || s.coverage.kind === "authored") return "Synthetic cohort, record as of 30 days before the index date.";
  return `Record collected from the simulator on ${formatDate(s.coverage.collectedAt ?? s.input.indexTime)}.`;
}

export async function ScreeningPanel({ patientId, caseState }: { patientId: string; caseState: CaseState }) {
  let screening: CompletedScreening | undefined;
  try {
    screening = await latestScreeningFor(patientId);
  } catch {
    screening = undefined;
  }

  if (!screening) {
    return (
      <Panel title="Screening">
        <EmptyLine>No screening has been run for this patient.</EmptyLine>
      </Panel>
    );
  }

  const { id, input, result } = screening;
  const decision = DECISION[result.decision];
  const chipLabel = result.decision === "not_assessed" ? `Not assessed: ${STATUS_WORD[result.status]}` : decision.label;
  const sentence = result.decision === "not_assessed" ? (firstSentence(result.reason) ?? firstSentence(result.explanation)) : firstSentence(result.explanation);
  const records = new Map(input.records.map(r => [r.id, r]));
  const limitations = [...new Set(result.limitations.map(l => firstSentence(l) ?? l))];

  let review: Awaited<ReturnType<typeof verifiedLinkedReview>> | undefined;
  if (result.stage2JobId && result.decision === "above_threshold") {
    try {
      review = await verifiedLinkedReview(id);
    } catch {
      review = undefined;
    }
  }
  const previous = caseState.screeningReviews?.find(r => r.screeningId === id);
  const step = caseState.preparationSteps?.find(s => s.id === previous?.preparationStepId);

  return (
    <Panel title="Screening" aside="Three-month screening of the whole record">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Chip tone={decision.tone} className="text-[12px]">{chipLabel}</Chip>
        {sentence ? <p className="min-w-0 max-w-[65ch] text-[14px] leading-6 text-ink">{sentence}</p> : null}
      </div>

      <div className="mt-5">
        <Microlabel className="mb-2">What the screening read</Microlabel>
        {result.supportingEvidence.length ? (
          <EvidenceList items={result.supportingEvidence} records={records} />
        ) : (
          <EmptyLine>No record entries were cited.</EmptyLine>
        )}
      </div>

      {result.contradictoryEvidence.length ? (
        <div className="mt-5">
          <Microlabel className="mb-2">Points the other way</Microlabel>
          <EvidenceList items={result.contradictoryEvidence} records={records} />
        </div>
      ) : null}

      {limitations.length ? (
        <div className="mt-5">
          <Microlabel className="mb-1.5">Limitations</Microlabel>
          <ul className="flex max-w-[72ch] list-disc flex-col gap-1 break-words pl-4 text-[13px] leading-5 text-secondary marker:text-faint">
            {limitations.map(l => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-5 text-[12px] leading-5 text-faint">
        Unvalidated prototype, not calibrated. {provenanceLine(screening)} Snapshot{" "}
        <span className="font-mono tnum">{result.snapshotHash.slice(0, 8)}</span> &middot; <span className="tnum">{formatDate(screening.completedAt)}</span>.
      </p>

      {review ? (
        <div className="mt-6">
          <ClinicalReview
            screeningId={id}
            patientId={input.patientId}
            participants={caseState.participants}
            previous={previous}
            step={step}
            enabled={process.env.CAIRN_DEMO_ACTIONS === "true"}
          />
        </div>
      ) : null}
    </Panel>
  );
}
