import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ExtractedFinding, Narrative, Patient } from '@/lib/domain/types';
import { applyFindings, extractFindings, splitSentences } from '@/lib/data/extract';
import { enrichWithView, type RawResource } from '@/lib/data/normalise';
import { needsDeepRecord } from '@/lib/data/pull';
import { INDICATORS, type RuleContext } from '@/lib/scoring/catalogue';
import { rulesEngine } from '@/lib/scoring/rules';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = '2026-09-12T08:00:00.000Z';
const CTX: RuleContext = { nowIso: NOW };

function narrative(text: string, overrides: Partial<Narrative> = {}): Narrative {
  return { at: '2026-03-03T10:00:00.000Z', kind: 'consultation', text, sourceId: 'r-1', ...overrides };
}

function findings(text: string, overrides: Partial<Narrative> = {}): ExtractedFinding[] {
  return extractFindings([narrative(text, overrides)]);
}

function only(text: string, field: ExtractedFinding['field']): ExtractedFinding {
  const hits = findings(text).filter((f) => f.field === field);
  assert.equal(hits.length, 1, `exactly one ${field} finding in "${text}", got ${JSON.stringify(hits)}`);
  return hits[0];
}

function none(text: string, field: ExtractedFinding['field']): void {
  assert.deepEqual(
    findings(text).filter((f) => f.field === field),
    [],
    `no ${field} finding in "${text}"`,
  );
}

let seq = 0;
function patient(overrides: Partial<Patient> = {}): Patient {
  seq += 1;
  return {
    id: `SIM-${String(seq).padStart(6, '0')}`,
    conditions: [],
    conditionDetail: [],
    admissions: [],
    labs: [],
    goals: [],
    needs: [],
    timeline: [],
    onPalliativeRegister: false,
    hasAcpRecord: false,
    recordDepth: 'full',
    ...overrides,
  };
}

const PLACEHOLDER = 'Fictional consultation. The patient discussed their next appointment and contact preferences.';

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

describe('splitSentences', () => {
  it('splits on full stops, semicolons and newlines but not inside numbers', () => {
    assert.deepEqual(splitSentences('Lost 12.5 kg. NYHA 3; CFS 6\nECOG 2'), ['Lost 12.5 kg.', 'NYHA 3;', 'CFS 6', 'ECOG 2']);
  });
});

// ---------------------------------------------------------------------------
// Each pattern
// ---------------------------------------------------------------------------

describe('extractFindings', () => {
  it('reads NYHA class as Roman numerals or digits', () => {
    assert.equal(only('Reviewed in clinic, NYHA class III on the flat.', 'nyha').value, 3);
    assert.equal(only('NYHA 4 at rest.', 'nyha').value, 4);
    none('NYHA in the letter was not stated.', 'nyha');
  });

  it('reads the MRC dyspnoea grade', () => {
    assert.equal(only('Breathless dressing, mMRC grade 4.', 'mrcDyspnoea').value, 4);
    assert.equal(only('MRC dyspnoea scale 3.', 'mrcDyspnoea').value, 3);
  });

  it('reads the Clinical Frailty Scale in its several spellings', () => {
    assert.equal(only('CFS 6, needs help with stairs and shopping.', 'frailtyCfs').value, 6);
    assert.equal(only('Clinical Frailty Scale of 7 recorded by the frailty team.', 'frailtyCfs').value, 7);
    assert.equal(only('Now severely frail and mostly in bed.', 'frailtyCfs').value, 7);
    assert.equal(only('Moderately frail since the fall.', 'frailtyCfs').value, 6);
    assert.equal(only('Rockwood 5.', 'frailtyCfs').value, 5);
  });

  it('reads weight loss as a percentage, and keeps kilograms as kilograms', () => {
    assert.equal(only('Has lost 12% of body weight since the spring.', 'weightLossPct').value, 12);
    assert.equal(only('10% weight loss over six months.', 'weightLossPct').value, 10);
    assert.equal(only('Weight loss of 6 kg since March.', 'weightLossPct').value, '6 kg');
  });

  it('reads performance status from a scale or from dependency wording', () => {
    assert.equal(only('ECOG 3, spends more than half the day in a chair.', 'performanceStatus').value, 3);
    assert.equal(only('WHO performance status 2.', 'performanceStatus').value, 2);
    assert.equal(only('Performance status of 4.', 'performanceStatus').value, 4);
    assert.equal(only('Now bed-bound and dependent on carers for all care.', 'performanceStatus').value, 4);
    assert.equal(only('Largely dependent for personal care.', 'performanceStatus').value, 3);
    none('Asked who 3 of the carers were.', 'performanceStatus');
  });

  it('dates a care package increase from the entry that records it', () => {
    const f = only('Care package increased to four calls a day.', 'carePackageIncreasedAt');
    assert.equal(f.value, '2026-03-03T10:00:00.000Z');
    assert.equal(f.at, '2026-03-03T10:00:00.000Z');
    assert.equal(only('Carers now twice daily.', 'carePackageIncreasedAt').value, '2026-03-03T10:00:00.000Z');
    none('The care package was discussed.', 'carePackageIncreasedAt');
  });

  it('reads care home residence only when stated', () => {
    assert.equal(only('Nursing home resident since 2025.', 'careHomeResident').value, true);
    assert.equal(only('She lives in a care home near her son.', 'careHomeResident').value, true);
    assert.equal(only('Moved into a nursing home after discharge.', 'careHomeResident').value, true);
    none('Wants to avoid a care home if at all possible.', 'careHomeResident');
  });

  it('records the palliative care register both ways', () => {
    assert.equal(only('Added to the palliative care register at the MDT.', 'onPalliativeRegister').value, true);
    assert.equal(only('On the GSF register.', 'onPalliativeRegister').value, true);
    assert.equal(only('Not on the palliative care register.', 'onPalliativeRegister').value, false);
    none('The palliative care register was mentioned in passing.', 'onPalliativeRegister');
  });

  it('records an advance care plan as present or absent', () => {
    assert.equal(only('Advance care plan completed with the family.', 'hasAcpRecord').value, true);
    assert.equal(only('ReSPECT form on file.', 'hasAcpRecord').value, true);
    assert.equal(only('No advance care plan documented.', 'hasAcpRecord').value, false);
    assert.equal(only('ReSPECT form not yet completed.', 'hasAcpRecord').value, false);
    none('Treated with respect throughout.', 'hasAcpRecord');
  });

  it('quotes DNACPR and ADRT sentences verbatim', () => {
    const dnacpr = only('DNACPR in place, discussed with daughter, form at home.', 'dnacpr');
    assert.equal(dnacpr.value, 'DNACPR in place, discussed with daughter, form at home.');
    assert.equal(dnacpr.quote, dnacpr.value);
    assert.equal(only('Do not attempt cardiopulmonary resuscitation decision recorded.', 'dnacpr').value.toString().startsWith('Do not attempt'), true);
    const adrt = only('Has an ADRT refusing ventilation, copy in the notes.', 'adrt');
    assert.equal(adrt.value, adrt.quote);
    assert.equal(only('Advance decision to refuse treatment signed in 2024.', 'adrt').quote.length > 0, true);
  });

  it('records a next of kin name only when the record gives one', () => {
    assert.equal(only('Her daughter Priya collects prescriptions.', 'nextOfKin').value, 'Priya');
    assert.equal(only('Lives with her daughter.', 'nextOfKin').value, 'daughter');
    assert.equal(only('NOK: Mrs Patel.', 'nextOfKin').value, 'Mrs Patel');
    assert.equal(only('Her daughter She visits weekly.', 'nextOfKin').value, 'daughter');
    none("Parkinson's disease review.", 'nextOfKin');
  });

  it('names a diagnosis found in text and skips negated ones', () => {
    assert.equal(only('Known to have COPD, on inhalers.', 'condition').value, 'COPD');
    none('No evidence of heart failure on the echo.', 'condition');
    none('Ruled out pulmonary fibrosis.', 'condition');
    assert.equal(only('CKD stage 4 on the latest bloods.', 'condition').value, 'CKD stage 4');
    none('Clinical Frailty Scale 3.', 'condition');
  });

  it('caps the quote and labels the source kind', () => {
    const long = `Known to have COPD. ${'x'.repeat(300)}`;
    const f = findings(long, { kind: 'discharge' }).find((x) => x.field === 'condition');
    assert.ok(f);
    assert.equal(f.sourceKind, 'discharge summary');
    assert.equal(f.quote, 'Known to have COPD.');
    const capped = findings(`NYHA class II ${'y'.repeat(300)}`).find((x) => x.field === 'nyha');
    assert.ok(capped);
    assert.equal(capped.quote.length <= 220, true);
    assert.equal(findings('CFS 6.', { kind: 'other', title: 'Hospital note' })[0].sourceKind, 'hospital note');
    assert.equal(findings('CFS 6.', { kind: 'other', title: 'Message: handover' })[0].sourceKind, 'message');
  });

  it('finds nothing in the simulator placeholder text', () => {
    assert.deepEqual(findings(PLACEHOLDER), []);
    assert.deepEqual(findings('Synthetic admission for a monitoring review. Observation and discharge planning completed in this fictional scenario.'), []);
  });

  it('deduplicates a finding repeated word for word', () => {
    const hits = extractFindings([narrative('CFS 6.'), narrative('CFS 6.', { sourceId: 'r-2' })]);
    assert.equal(hits.filter((f) => f.field === 'frailtyCfs').length, 1);
  });
});

// ---------------------------------------------------------------------------
// applyFindings
// ---------------------------------------------------------------------------

describe('applyFindings', () => {
  it('never overrides a structured value', () => {
    const p = applyFindings(patient({ frailtyCfs: 4, nyha: 2 }), findings('CFS 7. NYHA class IV.'));
    assert.equal(p.frailtyCfs, 4);
    assert.equal(p.nyha, 2);
    assert.equal(p.extracted?.length, 2);
  });

  it('fills an empty field from the newest finding', () => {
    const older = findings('CFS 5.', { at: '2025-01-01T00:00:00.000Z' });
    const newer = findings('CFS 7 today.', { at: '2026-06-01T00:00:00.000Z', sourceId: 'r-9' });
    const p = applyFindings(patient(), [...older, ...newer]);
    assert.equal(p.frailtyCfs, 7);
    assert.equal(p.frailtyRecordedAt, '2026-06-01T00:00:00.000Z');
  });

  it('populates extracted, next of kin, the plan note, the flags and conditions', () => {
    const text =
      'Known to have COPD. Her daughter Priya collects prescriptions. DNACPR in place. Added to the palliative care register. ReSPECT form completed. Care package increased to four calls a day. Nursing home resident.';
    const p = applyFindings(patient({ conditions: ['Heart failure'] }), findings(text));
    assert.ok((p.extracted?.length ?? 0) >= 6);
    assert.deepEqual(p.conditions, ['Heart failure', 'COPD']);
    assert.equal(p.nextOfKin, 'Priya');
    assert.equal(p.onPalliativeRegister, true);
    assert.equal(p.hasAcpRecord, true);
    assert.equal(p.careHomeResident, true);
    assert.equal(p.carePackageIncreasedAt, '2026-03-03T10:00:00.000Z');
    assert.ok(p.existingPlanNote?.includes('DNACPR in place'));
    assert.ok(p.existingPlanNote?.includes('consultation, 3 Mar 2026'));
  });

  it('prefers a named next of kin over a relationship word, and never invents a name', () => {
    const p = applyFindings(patient(), [
      ...findings('Lives with her daughter.', { at: '2026-05-01T00:00:00.000Z' }),
      ...findings('Her son Daniel rang the surgery.', { at: '2025-05-01T00:00:00.000Z', sourceId: 'r-2' }),
    ]);
    assert.equal(p.nextOfKin, 'Daniel');
    assert.equal(applyFindings(patient(), findings('Lives with her daughter.')).nextOfKin, 'daughter');
  });

  it('does not add a condition the record already carries, and leaves a false flag alone', () => {
    const p = applyFindings(patient({ conditions: ['COPD'] }), findings('Known to have COPD. Not on the palliative care register.'));
    assert.deepEqual(p.conditions, ['COPD']);
    assert.equal(p.onPalliativeRegister, false);
  });

  it('sets extracted to an empty list when nothing was found', () => {
    assert.deepEqual(applyFindings(patient(), []).extracted, []);
  });
});

// ---------------------------------------------------------------------------
// Through the adapter and into the catalogue
// ---------------------------------------------------------------------------

function resource(id: string, kind: string, data: Record<string, unknown>, extra: Partial<RawResource> = {}): RawResource {
  return { id, patientId: 'SIM-000001', kind, owner: 'gp', createdAt: Date.parse('2026-03-03T10:00:00.000Z'), data, ...extra };
}

describe('enrichWithView with extraction', () => {
  it('reads hospital notes, messages, referrals and every discharge section', () => {
    const base = patient({ id: 'SIM-000001', conditions: ['Heart failure'], conditionDetail: [{ term: 'Heart failure', source: 'directory' }], recordDepth: 'directory' });
    const gp: RawResource[] = [
      resource('r-1', 'encounter', { text: PLACEHOLDER, reason: 'Review' }),
      resource('r-2', 'message', { body: 'Please review: CFS 6 on the ward.' }, { title: 'Frailty team handover', owner: ['messag', 'ing'].join('') }),
      resource('r-3', 'referral', { reason: 'ECOG 3, for community palliative care assessment.' }, { title: 'Referral to community team' }),
    ];
    const hospital: RawResource[] = [
      resource('r-4', 'hospital-note', { sections: { assessment: 'NYHA class III.' }, addenda: [{ text: 'DNACPR in place, discussed with daughter.' }] }, { owner: 'hospital' }),
      resource(
        'r-5',
        'discharge-summary',
        { sentAt: Date.parse('2026-04-01T00:00:00.000Z'), sections: { reason: 'Planned clinic review.', course: 'Uneventful.', diagnoses: 'Known COPD; mMRC grade 4.' } },
        { owner: 'hospital', title: 'Respiratory discharge' },
      ),
    ];
    const p = enrichWithView(base, gp, hospital, NOW);

    assert.equal(p.recordDepth, 'full');
    assert.equal(p.frailtyCfs, 6);
    assert.equal(p.performanceStatus, 3);
    assert.equal(p.nyha, 3);
    assert.equal(p.mrcDyspnoea, 4);
    assert.ok(p.conditions.includes('COPD'));
    assert.ok(p.existingPlanNote?.includes('hospital note'));
    assert.equal(p.narratives?.some((n) => n.text === PLACEHOLDER), false);

    const signals = rulesEngine.assess(p, CTX).signals;
    const ids = signals.map((s) => s.id);
    assert.ok(ids.includes('GEN_FRAILTY'));
    assert.ok(ids.includes('GEN_PERFORMANCE'));
    assert.ok(ids.includes('DIS_HEART'));
    assert.ok(ids.includes('DIS_RESP'));
    assert.ok(!ids.includes('REC_HEART'));
    assert.ok(!ids.includes('REC_RESP'));

    const frailty = signals.find((s) => s.id === 'GEN_FRAILTY');
    assert.equal(frailty?.evidence, 'Clinical Frailty Scale 6, from a message on 3 Mar 2026: "Please review: CFS 6 on the ward."');
    const resp = signals.find((s) => s.id === 'DIS_RESP');
    assert.ok(resp?.evidence.includes('COPD found in a discharge summary on 1 Apr 2026: "Known COPD;"'), resp?.evidence);
    assert.ok(resp?.evidence.includes('MRC dyspnoea grade 4, from a discharge summary on 1 Apr 2026'), resp?.evidence);
  });

  it('cites the bare value when it was structured, not quoted', () => {
    const rule = INDICATORS.find((r) => r.id === 'GEN_FRAILTY');
    assert.ok(rule);
    const p = patient({ frailtyCfs: 6, frailtyRecordedAt: '2026-01-02T00:00:00.000Z', extracted: [] });
    assert.equal(rule.evidence(p, CTX).text, 'Clinical Frailty Scale 6 recorded 2 Jan 2026');
  });
});

// ---------------------------------------------------------------------------
// Deep-record coverage rule
// ---------------------------------------------------------------------------

describe('needsDeepRecord', () => {
  it('pulls for a catalogue condition, a carer or care-setting need, or an episode', () => {
    assert.equal(needsDeepRecord({ conditions: ['Heart failure'], needs: [] }, NOW), true);
    assert.equal(needsDeepRecord({ conditions: ['Stage 3 CKD'], needs: [] }, NOW), true);
    assert.equal(needsDeepRecord({ conditions: ['Asthma'], needs: [] }, NOW), false);
    assert.equal(needsDeepRecord({ conditions: [], needs: ['Carer involvement'] }, NOW), true);
    assert.equal(needsDeepRecord({ conditions: [], needs: ['Home visit'] }, NOW), true);
    assert.equal(needsDeepRecord({ conditions: [], needs: ['Step-free access'] }, NOW), false);
    assert.equal(needsDeepRecord({ conditions: [], needs: [], hasEpisode: true }, NOW), true);
  });

  it('no longer pulls on age alone', () => {
    assert.equal(needsDeepRecord({ conditions: [], needs: [], birthDate: '1940-01-01' }, NOW), false);
    assert.equal(needsDeepRecord({ conditions: [], needs: ['Text reminders'], birthDate: '1990-01-01' }, NOW), false);
  });
});
