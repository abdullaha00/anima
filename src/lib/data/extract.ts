/**
 * Free-text extraction: what the record actually says, quoted.
 *
 * The simulator hides much of a patient's record in prose: severity grades, frailty
 * scores, existing DNACPR or ReSPECT decisions, next of kin and even diagnoses sit in
 * consultation notes, discharge summaries, hospital notes and inter-service messages
 * rather than in structured fields. This module scans every narrative sentence by
 * sentence with conservative, case-insensitive patterns and returns one finding per
 * hit, each carrying the sentence it came from. Nothing here invents a value: if no
 * sentence matches, there is no finding.
 *
 * `applyFindings` folds findings into the Patient. A structured value always wins over
 * text; a finding only fills a field that is currently empty.
 */

import type { ExtractedFinding, Narrative, Patient } from '@/lib/domain/types';
import { formatDate } from '@/lib/format';

const MAX_QUOTE_CHARS = 220;
const NEGATION_WINDOW_WORDS = 6;

type Field = ExtractedFinding['field'];

/** One pattern for one field. Returns the value found in the sentence, or undefined. */
interface Matcher {
  field: Field;
  read: (sentence: string) => string | number | boolean | undefined;
}

// ---------------------------------------------------------------------------
// Sentence handling
// ---------------------------------------------------------------------------

/**
 * Split text into sentences at newlines, semicolons, and full stops followed by
 * whitespace or the end of the text. A full stop inside a number ("12.5") or an
 * abbreviation glued to the next word does not split.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    current += ch;
    const next = i + 1 < text.length ? text[i + 1] : '';
    const breaks =
      ch === '\n' || ch === '\r' || ch === ';' || (ch === '.' && (next === '' || /\s/.test(next)));
    if (breaks) {
      out.push(current);
      current = '';
    }
  }
  out.push(current);
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s !== '');
}

function quoteOf(sentence: string): string {
  return sentence.length <= MAX_QUOTE_CHARS ? sentence : `${sentence.slice(0, MAX_QUOTE_CHARS - 1).trimEnd()}…`;
}

/** True when a negating word sits within a few words before `index` in the sentence. */
function negatedBefore(sentence: string, index: number): boolean {
  const before = sentence.slice(0, index).trim().split(/\s+/).slice(-NEGATION_WINDOW_WORDS).join(' ');
  return /\b(no|not|denies|denied|without|ruled out|unlikely)\b/i.test(before);
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };

function romanOrDigit(raw: string): number | undefined {
  const lower = raw.toLowerCase();
  if (lower in ROMAN) return ROMAN[lower];
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function digit(re: RegExp, group = 1): (sentence: string) => number | undefined {
  return (sentence) => {
    const m = re.exec(sentence);
    if (!m || m[group] === undefined) return undefined;
    const n = Number(m[group]);
    return Number.isFinite(n) ? n : undefined;
  };
}

// ---------------------------------------------------------------------------
// The patterns. Word boundaries throughout; Roman numerals and digits both accepted.
// ---------------------------------------------------------------------------

const NYHA_RE = /\bNYHA\s*(?:class)?\s*(?:of\s*)?(I{1,3}V?|IV|[1-4])\b/i;
const MRC_RE = /\b(?:mMRC|MRC)\s*(?:dyspnoea|breathlessness)?\s*(?:grade|scale|score)?\s*(?:of\s*|:\s*)?([0-5])\b/i;
const CFS_RE = /\b(?:Clinical Frailty Scale|CFS|Rockwood)\s*(?:score|of|:)?\s*(?:of\s*)?([1-9])\b/i;
const FRAILTY_SCORE_RE = /\bfrailty (?:score|scale)[^0-9]{0,12}([1-9])\b/i;
const FRAIL_WORD_RE = /\b(severely|moderately) frail\b/i;

const WEIGHT_PCT_A = /\b(\d{1,2})\s?% (?:weight loss|loss of (?:body )?weight)/i;
const WEIGHT_PCT_B = /\b(?:lost|weight loss of) (\d{1,2})\s?%/i;
const WEIGHT_KG_A = /\b(\d{1,2}(?:\.\d)?)\s?kg (?:weight loss|lost)\b/i;
const WEIGHT_KG_B = /\b(?:lost|weight loss of) (\d{1,2}(?:\.\d)?)\s?kg\b/i;

const PS_SCALE_RE = /\b(?:ECOG\s*(?:performance status|PS)?|WHO\s*(?:performance status|PS))\s*(?:of\s*|:\s*)?([0-4])\b/i;
const PS_WORDS_RE = /\bperformance status\s*(?:of\s*|is\s*|:\s*)?([0-4])\b/i;
const PS_DEPENDENT_RE = /\b(bed-?bound|chair-?bound|largely dependent|dependent for all care)\b/i;

const CARE_PACKAGE_RE =
  /\b(?:care package|package of care|carers?)\s+(?:(?:has|have|had|was|were|is|are|been|being|to be)\s+)*(?:increased|stepped up|now (?:twice|three times|four times|three|four) (?:a day|daily))/i;

const CARE_HOME_RE =
  /\b(?:care home|nursing home|residential home) resident\b|\blives in a (?:care|nursing|residential) home\b|\bmoved (?:in)?to a (?:care|nursing|residential) home\b|\bresident (?:of|at|in) (?:a |the )?(?:care|nursing|residential) home\b/i;

const REGISTER_RE = /\b(?:palliative care register|palliative register|GSF register|gold standards framework register)\b/i;
const REGISTER_NEGATIVE_RE = /\b(?:not on|no register|not (?:yet )?(?:been )?added|removed from|not (?:yet )?(?:on|placed on))\b/i;
const REGISTER_POSITIVE_RE = /\b(?:on the|added to|is on|already on|placed on|remains on|added on)\b/i;

const ACP_RE = /\b(?:advance care plan(?:ning)?|ACP|ReSPECT (?:form|record|plan|process|document))\b/i;
const ACP_NEGATIVE_RE = /\b(?:no|not|without|absent|undocumented|none|declined)\b/i;
const ACP_POSITIVE_RE = /\b(?:in place|completed|signed|on file|exists|documented|recorded|present|held|uploaded)\b/i;

const DNACPR_RE = /\b(?:DNACPR|DNAR|DNR|do not attempt (?:cardiopulmonary )?resuscitation)\b/i;
const ADRT_RE = /\b(?:ADRT|advance decision to refuse treatment|living will)\b/i;

const RELATION_RE = /\b(next of kin|NOK|daughter|son|husband|wife|partner|carer)\b/i;
/** Case-sensitive on purpose: a name is a capitalised word, and only a name may be recorded. */
const NAME_AFTER_RE = /^\s*(?:is|:|,)?\s*([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/;
const NOT_NAMES = new Set(['The', 'She', 'He', 'Her', 'His', 'They', 'It', 'This', 'That', 'Who', 'Has', 'Is', 'Was', 'Will', 'Can']);

/** Diagnosis terms the catalogue recognises, in the spelling recorded when found in text. */
const CONDITION_TERMS: { term: string; re: RegExp }[] = [
  { term: 'Heart failure', re: /\bheart failure\b/i },
  { term: 'COPD', re: /\bCOPD\b/i },
  { term: 'Pulmonary fibrosis', re: /\bpulmonary fibrosis\b/i },
  { term: 'CKD stage 4', re: /\bCKD stage 4\b/i },
  { term: 'CKD stage 5', re: /\bCKD stage 5\b/i },
  { term: 'ESRF', re: /\bESRF\b/i },
  { term: 'Dementia', re: /\bdementia\b/i },
  { term: "Parkinson's disease", re: /\bParkinson/i },
  { term: 'Motor neurone disease', re: /\bmotor neurone\b/i },
  { term: 'Multiple sclerosis', re: /\bmultiple sclerosis\b/i },
  { term: 'Metastatic cancer', re: /\bmetastatic\b/i },
  { term: 'Advanced cancer', re: /\badvanced cancer\b/i },
  { term: 'Carcinoma', re: /\bcarcinoma\b/i },
  { term: 'Lymphoma', re: /\blymphoma\b/i },
  { term: 'Myeloma', re: /\bmyeloma\b/i },
  { term: 'Leukaemia', re: /\bleukaemia\b/i },
  { term: 'Cirrhosis', re: /\bcirrhosis\b/i },
  { term: 'Liver failure', re: /\bliver failure\b/i },
  // "frailty scale 4" names a scale, not a diagnosis; the CFS matcher handles those.
  { term: 'Frailty', re: /\bfrailty\b(?!\s*(?:scale|score|index))/i },
];

function readRegister(sentence: string): boolean | undefined {
  if (!REGISTER_RE.test(sentence)) return undefined;
  if (REGISTER_NEGATIVE_RE.test(sentence)) return false;
  if (REGISTER_POSITIVE_RE.test(sentence)) return true;
  return undefined;
}

function readAcp(sentence: string): boolean | undefined {
  if (!ACP_RE.test(sentence)) return undefined;
  if (ACP_NEGATIVE_RE.test(sentence)) return false;
  if (ACP_POSITIVE_RE.test(sentence)) return true;
  return undefined;
}

function readNextOfKin(sentence: string): string | undefined {
  const rel = RELATION_RE.exec(sentence);
  if (!rel) return undefined;
  const rest = sentence.slice(rel.index + rel[0].length);
  const name = NAME_AFTER_RE.exec(rest);
  if (name && !NOT_NAMES.has(name[1].split(' ')[0])) return name[1];
  return rel[1].toLowerCase();
}

const MATCHERS: Matcher[] = [
  {
    field: 'nyha',
    read: (s) => {
      const m = NYHA_RE.exec(s);
      return m ? romanOrDigit(m[1]) : undefined;
    },
  },
  { field: 'mrcDyspnoea', read: digit(MRC_RE) },
  {
    field: 'frailtyCfs',
    read: (s) => {
      const scored = digit(CFS_RE)(s) ?? digit(FRAILTY_SCORE_RE)(s);
      if (scored !== undefined) return scored;
      const word = FRAIL_WORD_RE.exec(s);
      if (!word) return undefined;
      return word[1].toLowerCase() === 'severely' ? 7 : 6;
    },
  },
  {
    field: 'weightLossPct',
    read: (s) => {
      const pct = digit(WEIGHT_PCT_A)(s) ?? digit(WEIGHT_PCT_B)(s);
      if (pct !== undefined) return pct;
      const kg = WEIGHT_KG_A.exec(s) ?? WEIGHT_KG_B.exec(s);
      return kg ? `${kg[1]} kg` : undefined;
    },
  },
  {
    field: 'performanceStatus',
    read: (s) => {
      const scored = digit(PS_SCALE_RE)(s) ?? digit(PS_WORDS_RE)(s);
      if (scored !== undefined) return scored;
      const words = PS_DEPENDENT_RE.exec(s);
      if (!words) return undefined;
      return /^bed/i.test(words[1]) ? 4 : 3;
    },
  },
  { field: 'carePackageIncreasedAt', read: (s) => (CARE_PACKAGE_RE.test(s) ? true : undefined) },
  { field: 'careHomeResident', read: (s) => (CARE_HOME_RE.test(s) ? true : undefined) },
  { field: 'onPalliativeRegister', read: readRegister },
  { field: 'hasAcpRecord', read: readAcp },
  { field: 'dnacpr', read: (s) => (DNACPR_RE.test(s) ? quoteOf(s) : undefined) },
  { field: 'adrt', read: (s) => (ADRT_RE.test(s) ? quoteOf(s) : undefined) },
  { field: 'nextOfKin', read: readNextOfKin },
];

// ---------------------------------------------------------------------------
// Narrative kind -> plain source label
// ---------------------------------------------------------------------------

/** A plain label for where a sentence came from, for the evidence chain. */
export function sourceLabel(narrative: Pick<Narrative, 'kind' | 'title'>): string {
  const title = narrative.title ?? '';
  switch (narrative.kind) {
    case 'consultation':
      return 'consultation';
    case 'discharge':
      return 'discharge summary';
    case 'referral':
      return 'referral';
    default:
      if (/^hospital note/i.test(title)) return 'hospital note';
      if (/^message\b/i.test(title)) return 'message';
      if (/^document\b/i.test(title)) return 'document';
      if (/^(community record|care plan|community visit|task)\b/i.test(title)) return 'community record';
      if (/^shared care/i.test(title)) return 'shared care record';
      return 'record entry';
  }
}

// ---------------------------------------------------------------------------
// extractFindings
// ---------------------------------------------------------------------------

export function extractFindings(narratives: Narrative[]): ExtractedFinding[] {
  const out: ExtractedFinding[] = [];
  for (const narrative of narratives) {
    const sourceKind = sourceLabel(narrative);
    for (const sentence of splitSentences(narrative.text)) {
      const base = { quote: quoteOf(sentence), at: narrative.at, sourceId: narrative.sourceId, sourceKind };

      for (const matcher of MATCHERS) {
        const value = matcher.read(sentence);
        if (value === undefined) continue;
        // A care-package increase is dated by the entry that records it.
        const recorded = matcher.field === 'carePackageIncreasedAt' ? narrative.at : value;
        out.push({ field: matcher.field, value: recorded, ...base });
      }

      for (const { term, re } of CONDITION_TERMS) {
        const m = re.exec(sentence);
        if (!m || negatedBefore(sentence, m.index)) continue;
        out.push({ field: 'condition', value: term, ...base });
      }
    }
  }
  return dedupeFindings(out);
}

function dedupeFindings(findings: ExtractedFinding[]): ExtractedFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.field} ${String(f.value)} ${f.quote}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// applyFindings
// ---------------------------------------------------------------------------

const newestFirst = (a: ExtractedFinding, b: ExtractedFinding): number => (b.at ?? '').localeCompare(a.at ?? '');

/** The most recent finding for a field, optionally narrowed by a predicate on the value. */
export function newestFinding(
  findings: ExtractedFinding[],
  field: Field,
  accept: (value: ExtractedFinding['value']) => boolean = () => true,
): ExtractedFinding | undefined {
  return findings
    .filter((f) => f.field === field && accept(f.value))
    .sort(newestFirst)[0];
}

const isNumber = (v: ExtractedFinding['value']): v is number => typeof v === 'number';
const isTrue = (v: ExtractedFinding['value']): boolean => v === true;

function numberFrom(findings: ExtractedFinding[], field: Field): { value: number; at?: string } | undefined {
  const f = newestFinding(findings, field, isNumber);
  return f && isNumber(f.value) ? { value: f.value, at: f.at } : undefined;
}

const RELATION_WORDS = new Set(['next of kin', 'nok', 'daughter', 'son', 'husband', 'wife', 'partner', 'carer']);

function planNote(findings: ExtractedFinding[]): string | undefined {
  const notes = findings
    .filter((f) => f.field === 'dnacpr' || f.field === 'adrt' || f.field === 'hasAcpRecord')
    .sort(newestFirst)
    .slice(0, 2)
    .map((f) => `${f.sourceKind}, ${formatDate(f.at)}: "${f.quote}"`);
  return notes.length > 0 ? notes.join(' | ') : undefined;
}

function conditionsFromText(patient: Patient, findings: ExtractedFinding[]): string[] {
  const existing = patient.conditions.map((c) => c.toLowerCase());
  const added: string[] = [];
  for (const f of findings) {
    if (f.field !== 'condition' || typeof f.value !== 'string') continue;
    const term = f.value.toLowerCase();
    const covered = existing.some((c) => c.includes(term)) || added.some((a) => a.toLowerCase() === term);
    if (!covered) added.push(f.value);
  }
  return added;
}

/**
 * Fold findings into the Patient. A structured value always wins: a field is filled
 * from text only when it is currently undefined (or, for the two register flags,
 * still at their default of false), taking the most recent finding by date.
 */
export function applyFindings(patient: Patient, findings: ExtractedFinding[]): Patient {
  const all = dedupeFindings(findings);
  const next: Patient = { ...patient, extracted: all };
  if (all.length === 0) return next;

  const nyha = numberFrom(all, 'nyha');
  if (next.nyha === undefined && nyha) next.nyha = nyha.value;

  const mrc = numberFrom(all, 'mrcDyspnoea');
  if (next.mrcDyspnoea === undefined && mrc) next.mrcDyspnoea = mrc.value;

  const cfs = numberFrom(all, 'frailtyCfs');
  if (next.frailtyCfs === undefined && cfs) {
    next.frailtyCfs = cfs.value;
    next.frailtyRecordedAt = next.frailtyRecordedAt ?? cfs.at;
  }

  const weight = numberFrom(all, 'weightLossPct');
  if (next.weightLossPct === undefined && weight) next.weightLossPct = weight.value;

  const ps = numberFrom(all, 'performanceStatus');
  if (next.performanceStatus === undefined && ps) next.performanceStatus = ps.value;

  const carePackage = newestFinding(all, 'carePackageIncreasedAt');
  if (next.carePackageIncreasedAt === undefined && carePackage?.at) next.carePackageIncreasedAt = carePackage.at;

  const careHome = newestFinding(all, 'careHomeResident');
  if (next.careHomeResident === undefined && careHome?.value === true) next.careHomeResident = true;

  const register = newestFinding(all, 'onPalliativeRegister');
  if (!next.onPalliativeRegister && register && isTrue(register.value)) next.onPalliativeRegister = true;

  const acp = newestFinding(all, 'hasAcpRecord');
  if (!next.hasAcpRecord && acp && isTrue(acp.value)) next.hasAcpRecord = true;

  if (next.nextOfKin === undefined) {
    const named = newestFinding(all, 'nextOfKin', (v) => typeof v === 'string' && !RELATION_WORDS.has(v.toLowerCase()));
    const any = named ?? newestFinding(all, 'nextOfKin');
    if (any && typeof any.value === 'string') next.nextOfKin = any.value;
  }

  const note = planNote(all);
  if (next.existingPlanNote === undefined && note) next.existingPlanNote = note;

  const added = conditionsFromText(next, all);
  if (added.length > 0) next.conditions = [...next.conditions, ...added];

  return next;
}
