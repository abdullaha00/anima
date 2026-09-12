/**
 * Population case-finding. A port of reference/cairn/casefind.py.
 *
 * The funnel is deliberate. The rules read every patient and apply explicit indicators, so
 * the shortlist is small, cheap and fully explainable before any model is involved. Every
 * flag can be traced to the record entry that caused it.
 *
 * The equity comparison: the palliative care register historically captured about 29% of
 * the people it should have, roughly 67% of cancer patients against 20% of those with
 * non-cancer conditions (Harrison et al., BJGP 2012). If Cairn's cohort is less skewed
 * towards cancer than the register beside it, that is a measurable claim. Report it from
 * the data, and report it even when it is unflattering.
 */

import {
  TIER_ORDER,
  WORKLIST_STATE_ORDER,
  type Assessment,
  type CaseState,
  type Equity,
  type NextStep,
  type Patient,
  type ReviewTier,
  type SweepResult,
  type WorklistRow,
  type WorklistState,
} from '@/lib/domain/types';
import { MODEL_DISCLOSURE, SIMULATED_CLINICIANS } from '@/lib/copy';
import { isCancer } from './catalogue';
import { inertIndicators } from './rules';

export const EQUITY_NOTE =
  'Descriptive only. Cairn reports indicators present in the record and makes no claim of predictive validity.';

const STATE_INDEX: Record<WorklistState, number> = Object.fromEntries(
  WORKLIST_STATE_ORDER.map((s, i) => [s, i]),
) as Record<WorklistState, number>;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** The oldest open or blocked next step (earliest due date), with its owner named from the participants. */
/** The latest of the record's signing date and its audit entries, or undefined when the record has neither. */
export function lastTouchedFor(c: CaseState | undefined): string | undefined {
  if (!c) return undefined;
  const stamps = [c.record.signedAt, ...c.record.audit.map((e) => e.at)].filter((x): x is string => !!x);
  return stamps.length ? stamps.reduce((a, b) => (b > a ? b : a)) : undefined;
}

/** A small stable string hash (djb2), so a simulated clinician never changes between renders. */
function stableHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The patient's usual GP when the record names one, else a deterministic simulated clinician. */
export function clinicianFor(p: Pick<Patient, 'id' | 'usualGp'>): string {
  if (p.usualGp) return p.usualGp;
  return SIMULATED_CLINICIANS[stableHash(p.id) % SIMULATED_CLINICIANS.length];
}

export function waitingOnFor(c: CaseState | undefined): WorklistRow['waitingOn'] {
  const steps = [...(c?.preparationSteps ?? []), ...(c?.outcome?.nextSteps ?? [])];
  const pending: NextStep[] = steps
    .filter((s) => s.status === 'open' || s.status === 'blocked')
    .sort((a, b) => a.due.localeCompare(b.due));
  const step = pending[0];
  if (!step) return undefined;
  const owner = c?.participants.find((p) => p.id === step.ownerId);
  return {
    what: step.what,
    ownerName: owner?.name ?? step.ownerId,
    ownerRole: owner?.roleLabel ?? owner?.role ?? 'role not recorded',
    due: step.due,
    status: step.status,
  };
}

function compareRows(a: WorklistRow, b: WorklistRow): number {
  const byState = STATE_INDEX[a.state] - STATE_INDEX[b.state];
  if (byState !== 0) return byState;
  const byTier = TIER_ORDER[a.assessment.tier] - TIER_ORDER[b.assessment.tier];
  if (byTier !== 0) return byTier;
  const ra = a.assessment.modelRank;
  const rb = b.assessment.modelRank;
  if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb;
  if (ra !== undefined && rb === undefined) return -1;
  if (ra === undefined && rb !== undefined) return 1;
  return b.assessment.signals.length - a.assessment.signals.length;
}

export type ScreeningMarker = NonNullable<WorklistRow['screening']>;

export interface SweepOptions {
  /** Defaults to 'rules+model' when any assessment carries a model rank, else 'rules'. */
  engineId?: string;
  /** The latest screening decision per patient, from screeningMarkers(). Absent when none has run. */
  screenings?: ReadonlyMap<string, ScreeningMarker>;
}

const DECISION_MARKER: Record<string, ScreeningMarker> = {
  above_threshold: 'above',
  below_threshold: 'below',
  not_assessed: 'not_assessed',
};

/**
 * The latest completed screening decision for every patient, read once for the whole list.
 * Loaded lazily so the sweep itself stays a pure function of its inputs. An empty or missing
 * screenings directory gives an empty map, and any unreadable screening is left out.
 */
export async function screeningMarkers(): Promise<Map<string, ScreeningMarker>> {
  const out = new Map<string, ScreeningMarker>();
  try {
    const { latestScreeningsByPatient } = await import('@/lib/stage1/linked-review');
    for (const [patientId, s] of await latestScreeningsByPatient()) {
      const marker = DECISION_MARKER[s.result.decision];
      if (marker) out.set(patientId, marker);
    }
  } catch {
    // The worklist does not depend on the screening store being present or readable.
  }
  return out;
}

export function sweep(
  patients: Patient[],
  assessments: Assessment[],
  cases: Map<string, CaseState>,
  nowIso: string,
  opts: SweepOptions = {},
): SweepResult {
  void nowIso; // the clock is carried for callers that need to date the sweep; the counts below do not depend on it
  const byPatient = new Map<string, Assessment>();
  for (const a of assessments) byPatient.set(a.patientId, a);

  const byTier: Record<ReviewTier, number> = {
    'review this week': 0,
    'review this month': 0,
    'consider at next contact': 0,
    'no prompt': 0,
  };
  const imdPopulation = new Map<number, number>();
  const imdFlagged = new Map<number, number>();

  let alreadyOnRegister = 0;
  let anyModelRank = false;
  const rows: WorklistRow[] = [];

  for (const p of patients) {
    if (p.onPalliativeRegister) alreadyOnRegister += 1;
    if (p.imdQuintile !== undefined) imdPopulation.set(p.imdQuintile, (imdPopulation.get(p.imdQuintile) ?? 0) + 1);

    const a = byPatient.get(p.id);
    if (!a) continue;
    byTier[a.tier] += 1;
    if (a.tier === 'no prompt') continue;

    if (a.modelRank !== undefined) anyModelRank = true;
    if (p.imdQuintile !== undefined) imdFlagged.set(p.imdQuintile, (imdFlagged.get(p.imdQuintile) ?? 0) + 1);

    const c = cases.get(p.id);
    rows.push({
      patientId: p.id,
      name: p.name,
      age: p.age,
      conditions: p.conditions,
      assessment: a,
      state: c?.state ?? 'flagged',
      pausedReason: c?.pausedReason,
      clinician: clinicianFor(p),
      waitingOn: waitingOnFor(c),
      isCancer: isCancer(p),
      imdQuintile: p.imdQuintile,
      lastTouchedAt: lastTouchedFor(c),
      screening: opts.screenings?.get(p.id),
    });
  }

  rows.sort(compareRows);

  const newRows = rows.filter((r) => !r.assessment.alreadyOnRegister && !r.assessment.hasPlan);
  const cohortCancer = rows.filter((r) => r.isCancer).length;
  const newCancer = newRows.filter((r) => r.isCancer).length;

  const imdAvailable = imdPopulation.size > 0;
  const flagRateByImdQuintile: Record<string, number> = {};
  for (const q of [...imdPopulation.keys()].sort((x, y) => x - y)) {
    const pop = imdPopulation.get(q) ?? 0;
    if (pop > 0) flagRateByImdQuintile[String(q)] = round3((imdFlagged.get(q) ?? 0) / pop);
  }

  const equity: Equity = {
    // Share of the identified cohort that is cancer. The historical register comparator is
    // roughly 2 in 3 cancer, so a lower cancer share here is the claim.
    cohortCancerShare: rows.length ? round3(cohortCancer / rows.length) : null,
    cohortNonCancerShare: rows.length ? round3(1 - cohortCancer / rows.length) : null,
    newlyIdentifiedNonCancerShare: newRows.length ? round3(1 - newCancer / newRows.length) : null,
    flagRateByImdQuintile,
    imdAvailable,
    note: EQUITY_NOTE,
  };

  const engineId = opts.engineId ?? (anyModelRank ? 'rules+model' : 'rules');

  return {
    funnel: {
      patientsScanned: patients.length,
      alreadyOnRegister,
      indicatorsPresent: rows.length,
      notOnRegisterOrPlan: newRows.length,
      reviewThisWeek: byTier['review this week'],
      promptedForReview: byTier['review this week'] + byTier['review this month'],
      waitingOnSomeone: rows.filter((r) => r.waitingOn !== undefined).length,
    },
    byTier,
    equity,
    rows,
    inertIndicators: inertIndicators(patients),
    engineId,
    ...(anyModelRank ? { modelDisclosure: MODEL_DISCLOSURE } : {}),
  };
}
