/**
 * The indicator catalogue. One table, editable by a doctor.
 *
 * Design rule, and it is the whole safety argument: nothing in this file produces a
 * number about a person. Each rule reports whether a recognised indicator is present in
 * the record, with the specific entry that fired it, and leaves the judgement to a
 * clinician. The tiers below are queue positions for a clinician, not measurements.
 *
 * Two groups live in the same table and are told apart by `provenance`:
 *
 *   'reference'  a direct port of reference/cairn/signals.py: same ids, labels, families,
 *                bases and thresholds. Shaped after SPICT and the GSF Proactive Identification
 *                Guidance.
 *   'adapted'    shaped to the fields the NHS-SIM record actually carries (a problem list,
 *                admissions with dates, an eGFR series), because the simulator records no
 *                frailty scale, NYHA class, MRC grade, performance status or weight-loss
 *                figure. PENDING CLINICAL SIGN-OFF: a doctor on the team reviews these
 *                this afternoon. Set `enabled: false` to switch one off without deleting it.
 *
 * To change a threshold, edit the `threshold` sentence and the `test` beside it; keep the
 * two in step, because the sentence is what the doctors read.
 *
 * `requires` lists the Patient fields a rule reads. When a field is absent from every
 * patient in a data source, the rule is reported as inert ("no data") rather than left
 * to look like "no indicator". Never invent a field: a rule whose field is missing simply
 * does not fire.
 */

import type {
  Patient,
  ReviewTier,
  Signal,
  SignalFamily,
  Condition,
  Admission,
  LabResult,
  ExtractedFinding,
} from '@/lib/domain/types';
import { formatDate, monthsBetween, plural } from '@/lib/format';

export interface RuleContext {
  /** The simulation clock, ISO. Windows ("in the past 12 months") are measured from here. */
  nowIso: string;
}

export interface IndicatorRule {
  id: string;
  label: string;
  family: SignalFamily;
  basis: string;
  /** 'reference' = direct port of reference/cairn/signals.py; 'adapted' = shaped to the fields NHS-SIM actually carries, pending clinical sign-off */
  provenance: 'reference' | 'adapted';
  enabled: boolean;
  /** The Patient fields this rule needs; used to report the rule as inert when the data source lacks them */
  requires: (keyof Patient)[];
  /** Plain-English description of the threshold, shown to the doctors editing this file */
  threshold: string;
  test: (p: Patient, ctx: RuleContext) => boolean;
  evidence: (p: Patient, ctx: RuleContext) => { text: string; recordedAt?: string };
}

// ---------------------------------------------------------------------------
// Helpers shared by the rules. Kept small so the table below reads on its own.
// ---------------------------------------------------------------------------

/** Case-insensitive substring match over the condition terms, exactly as `_has` in signals.py. */
export function hasCondition(p: Patient, ...terms: string[]): boolean {
  const cs = (p.conditions ?? []).map((c) => c.toLowerCase());
  return terms.some((term) => cs.some((c) => c.includes(term.toLowerCase())));
}

/** Emergency admissions within `months` of the clock, most recent first. Mirrors `_admissions` in signals.py. */
export function emergencyAdmissionsWithin(p: Patient, months: number, nowIso: string): Admission[] {
  return (p.admissions ?? [])
    .filter((a) => a.emergency && monthsBetween(a.at, nowIso) <= months)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** The most recent laboratory result for an analyte, if the record carries one. */
export function latestLab(p: Patient, analyte: string): LabResult | undefined {
  const wanted = analyte.toLowerCase();
  return (p.labs ?? [])
    .filter((l) => l.analyte.toLowerCase() === wanted || l.name.toLowerCase().includes(wanted))
    .sort((a, b) => b.at.localeCompare(a.at))[0];
}

/** Problem-list and directory entries whose term matches any of the given words. */
function matchingConditions(p: Patient, terms: string[]): Condition[] {
  const lower = terms.map((t) => t.toLowerCase());
  return (p.conditionDetail ?? []).filter((c) => lower.some((t) => c.term.toLowerCase().includes(t)));
}

/**
 * The most recent free-text finding for a field, if the adapter found one. Findings
 * carry the sentence they came from, so the evidence can quote the record rather
 * than show a bare number whose origin the clinician cannot check.
 */
export function findingFor(p: Patient, field: ExtractedFinding['field']): ExtractedFinding | undefined {
  return (p.extracted ?? [])
    .filter((f) => f.field === field)
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0];
}

/** The finding behind a field's current value: present only when the value came from text. */
function textBehind(p: Patient, field: ExtractedFinding['field'], value: unknown): ExtractedFinding | undefined {
  const f = findingFor(p, field);
  return f !== undefined && f.value === value ? f : undefined;
}

/** "from a consultation on 3 Mar 2026: "..."" */
function cite(f: ExtractedFinding): string {
  return `from a ${f.sourceKind} on ${formatDate(f.at)}: "${f.quote}"`;
}

/** A value with its provenance: the quote when it came from text, else the bare statement. */
function valueEvidence(
  p: Patient,
  field: ExtractedFinding['field'],
  value: unknown,
  label: string,
  fallback: string,
): { text: string; recordedAt?: string } {
  const f = textBehind(p, field, value);
  return f ? { text: `${label}, ${cite(f)}`, recordedAt: f.at } : { text: fallback };
}

/** A condition named only in free text (not in the directory or the problem list). */
function conditionFromText(p: Patient, terms: string[]): ExtractedFinding | undefined {
  const lower = terms.map((t) => t.toLowerCase());
  return (p.extracted ?? [])
    .filter((f) => f.field === 'condition' && typeof f.value === 'string' && lower.some((t) => String(f.value).toLowerCase().includes(t)))
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0];
}

/**
 * Cite the actual record entry behind a condition rule. Prefers the problem list, names
 * the status and date, and says plainly when the directory and the problem list disagree.
 * Falls back to the reference wording when only the plain condition terms are available.
 */
export function conditionEvidence(
  p: Patient,
  terms: string[],
  fallback: string,
): { text: string; recordedAt?: string } {
  const matches = matchingConditions(p, terms);
  if (matches.length === 0) {
    const found = conditionFromText(p, terms);
    if (found) return { text: `${String(found.value)} found in a ${found.sourceKind} on ${formatDate(found.at)}: "${found.quote}"`, recordedAt: found.at };
    return { text: fallback };
  }

  const problem = matches.filter((c) => c.source === 'problem list');
  const directory = matches.filter((c) => c.source === 'directory');

  const active = problem.find((c) => c.status !== 'resolved');
  if (active) {
    const status = active.status ?? 'status not recorded';
    const code = active.code ? ` (${active.code})` : '';
    return {
      text: `${active.term} on the problem list, ${status}, recorded ${formatDate(active.recordedAt)}${code}`,
      recordedAt: active.recordedAt,
    };
  }

  const resolved = problem.find((c) => c.status === 'resolved');
  if (resolved && directory.length > 0) {
    return {
      text:
        `${directory[0].term} listed in the patient directory; the problem list marks it resolved on ` +
        `${formatDate(resolved.recordedAt)}. Conflicting entries, check the record.`,
      recordedAt: resolved.recordedAt,
    };
  }
  if (resolved) {
    return {
      text: `${resolved.term} on the problem list, marked resolved on ${formatDate(resolved.recordedAt)}. Check the record.`,
      recordedAt: resolved.recordedAt,
    };
  }

  return { text: `${directory[0].term} listed in the patient directory`, recordedAt: directory[0].recordedAt };
}

// ---------------------------------------------------------------------------
// Condition term lists. Lower case; matching is substring and case-insensitive.
// ---------------------------------------------------------------------------

export const CANCER_TERMS = ['cancer', 'carcinoma', 'metastatic', 'lymphoma', 'leukaemia', 'myeloma'];

export function isCancer(p: Patient): boolean {
  return hasCondition(p, ...CANCER_TERMS);
}

const HEART_TERMS = ['heart failure'];
const LUNG_TERMS = ['copd', 'pulmonary fibrosis'];
const NEURO_TERMS = ['motor neurone', 'parkinson', 'multiple sclerosis', 'dementia'];
const RENAL_STAGE_TERMS = ['ckd stage 4', 'ckd stage 5', 'esrf'];
const RENAL_ANY_TERMS = ['ckd', 'kidney'];
const LIVER_TERMS = ['cirrhosis', 'liver failure'];
const ADVANCED_CANCER_TERMS = ['metastatic', 'advanced cancer'];
const FRAILTY_TERMS = ['frailty'];

const EGFR_ADVANCED_BELOW = 30; // mL/min/1.73m²; below this is CKD stage 4 or 5 by eGFR

// ---------------------------------------------------------------------------
// THE TABLE
// ---------------------------------------------------------------------------

export const INDICATORS: IndicatorRule[] = [
  // --- General indicators of deteriorating health (SPICT-style), reference ---------------

  {
    id: 'GEN_ADMISSIONS',
    label: 'Two or more unplanned admissions in the past year',
    family: 'service-use',
    basis: 'SPICT general indicator',
    provenance: 'reference',
    enabled: true,
    requires: ['admissions'],
    threshold: 'Two or more emergency admissions within the 12 months before the simulation clock',
    test: (p, ctx) => emergencyAdmissionsWithin(p, 12, ctx.nowIso).length >= 2,
    evidence: (p, ctx) => {
      const adm = emergencyAdmissionsWithin(p, 12, ctx.nowIso);
      return {
        text: `${plural(adm.length, 'emergency admission')} in 12 months (most recent ${formatDate(adm[0]?.at)})`,
        recordedAt: adm[0]?.at,
      };
    },
  },
  {
    id: 'GEN_FRAILTY',
    label: 'Moderate to severe frailty',
    family: 'general',
    basis: 'Clinical Frailty Scale / electronic frailty index',
    provenance: 'reference',
    enabled: true,
    requires: ['frailtyCfs'],
    threshold: 'Clinical Frailty Scale 6 or above',
    test: (p) => (p.frailtyCfs ?? 0) >= 6,
    evidence: (p) => {
      const f = textBehind(p, 'frailtyCfs', p.frailtyCfs);
      if (f) return { text: `Clinical Frailty Scale ${p.frailtyCfs}, ${cite(f)}`, recordedAt: f.at };
      return {
        text: `Clinical Frailty Scale ${p.frailtyCfs} recorded ${formatDate(p.frailtyRecordedAt)}`,
        recordedAt: p.frailtyRecordedAt,
      };
    },
  },
  {
    id: 'GEN_WEIGHT',
    label: 'Progressive weight loss or low BMI',
    family: 'general',
    basis: 'SPICT general indicator',
    provenance: 'reference',
    enabled: true,
    requires: ['weightLossPct'],
    threshold: 'Weight loss of 10% or more over the past 6 months',
    test: (p) => (p.weightLossPct ?? 0) >= 10,
    evidence: (p) =>
      valueEvidence(p, 'weightLossPct', p.weightLossPct, `${p.weightLossPct}% weight loss`, `${p.weightLossPct}% weight loss over the past 6 months`),
  },
  {
    id: 'GEN_CARE_NEEDS',
    label: 'New or increased care needs',
    family: 'general',
    basis: 'SPICT general indicator',
    provenance: 'reference',
    enabled: true,
    requires: ['carePackageIncreasedAt'],
    threshold: 'A recorded increase in the care package (any date present)',
    test: (p) => Boolean(p.carePackageIncreasedAt),
    evidence: (p) => {
      const f = textBehind(p, 'carePackageIncreasedAt', p.carePackageIncreasedAt);
      if (f) return { text: `Care package increased, ${cite(f)}`, recordedAt: f.at };
      return {
        text: `Care package increased ${formatDate(p.carePackageIncreasedAt)}`,
        recordedAt: p.carePackageIncreasedAt,
      };
    },
  },
  {
    id: 'GEN_PERFORMANCE',
    label: 'Poor performance status, largely dependent',
    family: 'general',
    basis: 'SPICT general indicator',
    provenance: 'reference',
    enabled: true,
    requires: ['performanceStatus'],
    threshold: 'Performance status 3 or above',
    test: (p) => (p.performanceStatus ?? 0) >= 3,
    evidence: (p) =>
      valueEvidence(p, 'performanceStatus', p.performanceStatus, `Performance status ${p.performanceStatus}`, `Performance status ${p.performanceStatus} recorded`),
  },

  // --- Disease-specific indicators, reference ------------------------------------------

  {
    id: 'DIS_CANCER',
    label: 'Advanced or metastatic cancer with declining function',
    family: 'disease-specific',
    basis: 'SPICT cancer indicator',
    provenance: 'reference',
    enabled: true,
    requires: ['conditions', 'performanceStatus'],
    threshold: 'A condition term containing "metastatic" or "advanced cancer", and performance status 2 or above',
    test: (p) => hasCondition(p, ...ADVANCED_CANCER_TERMS) && (p.performanceStatus ?? 0) >= 2,
    evidence: (p) => {
      const c = conditionEvidence(p, ADVANCED_CANCER_TERMS, 'Advanced or metastatic cancer recorded');
      const ps = valueEvidence(p, 'performanceStatus', p.performanceStatus, `performance status ${p.performanceStatus}`, `performance status ${p.performanceStatus}`);
      return { text: `${c.text}; ${ps.text}`, recordedAt: c.recordedAt ?? ps.recordedAt };
    },
  },
  {
    id: 'DIS_HEART',
    label: 'Heart failure with symptoms at rest or on minimal exertion',
    family: 'disease-specific',
    basis: 'SPICT heart and vascular indicator',
    provenance: 'reference',
    enabled: true,
    requires: ['conditions', 'nyha'],
    threshold: 'A condition term containing "heart failure", and NYHA class 3 or above',
    test: (p) => hasCondition(p, ...HEART_TERMS) && (p.nyha ?? 0) >= 3,
    evidence: (p) => {
      const c = conditionEvidence(p, HEART_TERMS, 'Heart failure recorded');
      const grade = valueEvidence(p, 'nyha', p.nyha, `NYHA class ${p.nyha}`, `NYHA class ${p.nyha}`);
      return { text: `${c.text}; ${grade.text}`, recordedAt: c.recordedAt ?? grade.recordedAt };
    },
  },
  {
    id: 'DIS_RESP',
    label: 'Severe chronic lung disease with breathlessness at rest',
    family: 'disease-specific',
    basis: 'SPICT respiratory indicator',
    provenance: 'reference',
    enabled: true,
    requires: ['conditions', 'mrcDyspnoea'],
    threshold: 'A condition term containing "copd" or "pulmonary fibrosis", and MRC dyspnoea grade 4 or above',
    test: (p) => hasCondition(p, ...LUNG_TERMS) && (p.mrcDyspnoea ?? 0) >= 4,
    evidence: (p) => {
      const c = conditionEvidence(p, LUNG_TERMS, 'Chronic lung disease recorded');
      const grade = valueEvidence(p, 'mrcDyspnoea', p.mrcDyspnoea, `MRC dyspnoea grade ${p.mrcDyspnoea}`, `MRC dyspnoea grade ${p.mrcDyspnoea}`);
      return { text: `${c.text}; ${grade.text}`, recordedAt: c.recordedAt ?? grade.recordedAt };
    },
  },
  {
    id: 'DIS_NEURO',
    label: 'Progressive neurological disease with declining function',
    family: 'disease-specific',
    basis: 'SPICT neurological indicator',
    provenance: 'reference',
    enabled: true,
    requires: ['conditions'],
    threshold: 'A condition term containing "motor neurone", "parkinson", "multiple sclerosis" or "dementia"',
    test: (p) => hasCondition(p, ...NEURO_TERMS),
    evidence: (p) => conditionEvidence(p, NEURO_TERMS, 'Progressive neurological condition on the problem list'),
  },
  {
    id: 'DIS_RENAL',
    label: 'Advanced kidney disease, stage 4 or 5, deteriorating',
    family: 'disease-specific',
    basis: 'SPICT kidney indicator',
    provenance: 'reference',
    enabled: true,
    requires: ['conditions'],
    threshold: 'A condition term containing "ckd stage 4", "ckd stage 5" or "esrf"',
    test: (p) => hasCondition(p, ...RENAL_STAGE_TERMS),
    evidence: (p) => conditionEvidence(p, RENAL_STAGE_TERMS, 'Advanced chronic kidney disease recorded'),
  },
  {
    id: 'DIS_LIVER',
    label: 'Advanced liver disease with complications',
    family: 'disease-specific',
    basis: 'SPICT liver indicator',
    provenance: 'reference',
    enabled: true,
    requires: ['conditions'],
    threshold: 'A condition term containing "cirrhosis" or "liver failure"',
    test: (p) => hasCondition(p, ...LIVER_TERMS),
    evidence: (p) => conditionEvidence(p, LIVER_TERMS, 'Advanced liver disease recorded'),
  },

  // --- Record-shaped indicators, adapted. PENDING CLINICAL SIGN-OFF (this afternoon). ----
  //
  // The simulator carries a problem list, dated admissions and an eGFR series, and does not
  // carry a frailty scale, NYHA class, MRC grade or performance status. These rules read what
  // is actually there. Each one is written so it never fires alongside its reference sibling:
  // when the severity grade IS recorded, the reference rule decides and this one stays quiet.

  {
    id: 'REC_HEART',
    label: 'Heart failure on the problem list, severity grade not recorded',
    family: 'disease-specific',
    basis: 'Shaped after the SPICT heart and vascular indicator; NYHA class is not present in this record source',
    provenance: 'adapted',
    enabled: true,
    requires: ['conditions'],
    threshold: 'A condition term containing "heart failure", with no NYHA class on the record (DIS_HEART decides when one is recorded)',
    test: (p) => hasCondition(p, ...HEART_TERMS) && p.nyha === undefined,
    evidence: (p) => {
      const c = conditionEvidence(p, HEART_TERMS, 'Heart failure recorded');
      return { text: `${c.text}; NYHA class not recorded in this record source`, recordedAt: c.recordedAt };
    },
  },
  {
    id: 'REC_RESP',
    label: 'Chronic lung disease on the problem list, breathlessness grade not recorded',
    family: 'disease-specific',
    basis: 'Shaped after the SPICT respiratory indicator; MRC dyspnoea grade is not present in this record source',
    provenance: 'adapted',
    enabled: true,
    requires: ['conditions'],
    threshold: 'A condition term containing "copd" or "pulmonary fibrosis", with no MRC dyspnoea grade on the record (DIS_RESP decides when one is recorded)',
    test: (p) => hasCondition(p, ...LUNG_TERMS) && p.mrcDyspnoea === undefined,
    evidence: (p) => {
      const c = conditionEvidence(p, LUNG_TERMS, 'Chronic lung disease recorded');
      return { text: `${c.text}; MRC dyspnoea grade not recorded in this record source`, recordedAt: c.recordedAt };
    },
  },
  {
    id: 'REC_FRAILTY',
    label: 'Frailty recorded on the problem list, Clinical Frailty Scale not recorded',
    family: 'general',
    basis: 'Shaped after the Clinical Frailty Scale / eFI general indicator',
    provenance: 'adapted',
    enabled: true,
    requires: ['conditions'],
    threshold: 'A condition term containing "frailty", with no Clinical Frailty Scale on the record (GEN_FRAILTY decides when one is recorded)',
    test: (p) => hasCondition(p, ...FRAILTY_TERMS) && p.frailtyCfs === undefined,
    evidence: (p) => {
      const c = conditionEvidence(p, FRAILTY_TERMS, 'Frailty recorded');
      return { text: `${c.text}; Clinical Frailty Scale not recorded in this record source`, recordedAt: c.recordedAt };
    },
  },
  {
    id: 'REC_RENAL_EGFR',
    label: 'Chronic kidney disease with latest eGFR below 30',
    family: 'disease-specific',
    basis: 'SPICT kidney indicator (stage 4 or 5 by eGFR)',
    provenance: 'adapted',
    enabled: true,
    requires: ['conditions', 'labs'],
    threshold: 'A condition term containing "ckd" or "kidney", and the most recent eGFR result below 30 mL/min/1.73m² (DIS_RENAL decides when a stage term is recorded)',
    test: (p) => {
      if (hasCondition(p, ...RENAL_STAGE_TERMS)) return false;
      if (!hasCondition(p, ...RENAL_ANY_TERMS)) return false;
      const egfr = latestLab(p, 'egfr');
      return egfr !== undefined && egfr.value < EGFR_ADVANCED_BELOW;
    },
    evidence: (p) => {
      const egfr = latestLab(p, 'egfr');
      const c = conditionEvidence(p, RENAL_ANY_TERMS, 'Chronic kidney disease recorded');
      const unit = egfr?.unit || 'mL/min/1.73m²';
      return {
        text: `eGFR ${egfr?.value} ${unit} on ${formatDate(egfr?.at)}, ${c.text}`,
        recordedAt: egfr?.at,
      };
    },
  },
  {
    id: 'REC_ADMISSION_RECENT',
    label: 'Unplanned hospital attendance in the past 3 months',
    family: 'service-use',
    basis: 'SPICT general indicator (service use)',
    provenance: 'adapted',
    enabled: true,
    requires: ['admissions'],
    threshold: 'One or more emergency admissions within the 3 months before the simulation clock, when fewer than two fell in the past 12 months (GEN_ADMISSIONS decides otherwise)',
    test: (p, ctx) =>
      emergencyAdmissionsWithin(p, 12, ctx.nowIso).length < 2 &&
      emergencyAdmissionsWithin(p, 3, ctx.nowIso).length >= 1,
    evidence: (p, ctx) => {
      const recent = emergencyAdmissionsWithin(p, 3, ctx.nowIso)[0];
      const complaint = recent?.summary ? `: ${recent.summary}` : '';
      return {
        text: `Unplanned hospital attendance on ${formatDate(recent?.at)}${complaint}`,
        recordedAt: recent?.at,
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Review tiers. Ported from `tier_for` in signals.py.
//
// These describe how strongly the record prompts a review, and they deliberately carry no
// numbers. A tier is a queue position for a clinician.
//
// Service use alone never prompts an end-of-life conversation. Two admissions in a year
// describes a great many people who are not approaching the end of life, so admissions
// count only alongside a clinical indicator. Erring towards a smaller, better-founded list
// is the right trade here: a bloated list gets ignored, and an ignored list helps nobody.
// ---------------------------------------------------------------------------

export interface FamilyCounts {
  disease: number;
  general: number;
  service: number;
}

export interface TierRule {
  tier: ReviewTier;
  /** Plain-English statement of the rule, for the doctors editing this file */
  when: string;
  test: (c: FamilyCounts) => boolean;
}

/** Evaluated top to bottom; the first rule that matches wins. */
export const TIER_RULES: TierRule[] = [
  {
    tier: 'review this week',
    when: 'A disease-specific indicator, plus two or more general or service-use indicators',
    test: (c) => c.disease >= 1 && c.general + c.service >= 2,
  },
  {
    tier: 'review this month',
    when: 'A disease-specific indicator plus one general or service-use indicator, or two or more general indicators',
    test: (c) => (c.disease >= 1 && c.general + c.service >= 1) || c.general >= 2,
  },
  {
    tier: 'consider at next contact',
    when: 'Any disease-specific indicator, or any general indicator, on its own',
    test: (c) => c.disease >= 1 || c.general >= 1,
  },
  {
    tier: 'no prompt',
    when: 'Nothing above matched. Service use on its own never prompts.',
    test: () => true,
  },
];

export function countFamilies(signals: Signal[]): FamilyCounts {
  return {
    disease: signals.filter((s) => s.family === 'disease-specific').length,
    general: signals.filter((s) => s.family === 'general').length,
    service: signals.filter((s) => s.family === 'service-use').length,
  };
}

export function tierFor(signals: Signal[]): ReviewTier {
  const counts = countFamilies(signals);
  const match = TIER_RULES.find((r) => r.test(counts));
  return match ? match.tier : 'no prompt';
}
