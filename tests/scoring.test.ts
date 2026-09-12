import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import type { Assessment, CaseState, Patient, Signal } from '@/lib/domain/types';
import { INDICATORS, tierFor, isCancer, conditionEvidence, type RuleContext } from '@/lib/scoring/catalogue';
import { rulesEngine, inertIndicators } from '@/lib/scoring/rules';
import { modelEngine } from '@/lib/scoring/model';
import { resolveModelEndpoint, getEngine } from '@/lib/scoring/index';
import { sweep } from '@/lib/scoring/sweep';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = '2026-09-12T12:00:00.000Z';
const CTX: RuleContext = { nowIso: NOW };

let seq = 0;
function patient(overrides: Partial<Patient> = {}): Patient {
  seq += 1;
  return {
    id: `NHS${String(seq).padStart(6, '0')}`,
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

function sig(family: Signal['family'], id: string = family): Signal {
  return { id, label: id, family, basis: 'test', evidence: 'test' };
}

function emergency(at: string, summary?: string) {
  return { at, emergency: true, kind: 'hospital attendance' as const, summary };
}

function fired(p: Patient): string[] {
  return rulesEngine.assess(p, CTX).signals.map((s) => s.id);
}

function rule(id: string) {
  const r = INDICATORS.find((x) => x.id === id);
  assert.ok(r, `rule ${id} exists`);
  return r;
}

// ---------------------------------------------------------------------------
// Catalogue shape
// ---------------------------------------------------------------------------

describe('catalogue', () => {
  it('carries the eleven reference rules with the Python ids', () => {
    const ref = INDICATORS.filter((r) => r.provenance === 'reference').map((r) => r.id);
    assert.deepEqual(ref, [
      'GEN_ADMISSIONS', 'GEN_FRAILTY', 'GEN_WEIGHT', 'GEN_CARE_NEEDS', 'GEN_PERFORMANCE',
      'DIS_CANCER', 'DIS_HEART', 'DIS_RESP', 'DIS_NEURO', 'DIS_RENAL', 'DIS_LIVER',
    ]);
  });

  it('has unique ids and a threshold sentence on every rule', () => {
    const ids = new Set(INDICATORS.map((r) => r.id));
    assert.equal(ids.size, INDICATORS.length);
    for (const r of INDICATORS) {
      assert.ok(r.threshold.length > 10, `${r.id} has a threshold sentence`);
      assert.ok(r.requires.length > 0, `${r.id} declares its fields`);
    }
  });
});

// ---------------------------------------------------------------------------
// Reference rules: each fires at its threshold and not just below it
// ---------------------------------------------------------------------------

describe('reference rules', () => {
  it('GEN_ADMISSIONS: two emergency admissions in 12 months fire; one does not; old ones do not count', () => {
    const two = patient({ admissions: [emergency('2026-08-01T10:00:00Z'), emergency('2026-03-15T10:00:00Z')] });
    assert.ok(fired(two).includes('GEN_ADMISSIONS'));

    const one = patient({ admissions: [emergency('2026-08-01T10:00:00Z')] });
    assert.ok(!fired(one).includes('GEN_ADMISSIONS'));

    const stale = patient({ admissions: [emergency('2026-08-01T10:00:00Z'), emergency('2025-06-01T10:00:00Z')] });
    assert.ok(!fired(stale).includes('GEN_ADMISSIONS'));

    const planned = patient({
      admissions: [emergency('2026-08-01T10:00:00Z'), { at: '2026-07-01T10:00:00Z', emergency: false, kind: 'discharge summary' }],
    });
    assert.ok(!fired(planned).includes('GEN_ADMISSIONS'));
  });

  it('GEN_ADMISSIONS evidence names the count and the most recent date', () => {
    const p = patient({ admissions: [emergency('2026-03-15T10:00:00Z'), emergency('2026-08-01T10:00:00Z')] });
    const s = rulesEngine.assess(p, CTX).signals.find((x) => x.id === 'GEN_ADMISSIONS');
    assert.ok(s);
    assert.match(s.evidence, /2 emergency admissions/);
    assert.match(s.evidence, /1 Aug 2026/);
    assert.equal(s.recordedAt, '2026-08-01T10:00:00Z');
  });

  it('GEN_FRAILTY: CFS 6 fires, 5 does not', () => {
    assert.ok(fired(patient({ frailtyCfs: 6 })).includes('GEN_FRAILTY'));
    assert.ok(!fired(patient({ frailtyCfs: 5 })).includes('GEN_FRAILTY'));
    assert.ok(!fired(patient({})).includes('GEN_FRAILTY'));
  });

  it('GEN_WEIGHT: 10% fires, 9 does not', () => {
    assert.ok(fired(patient({ weightLossPct: 10 })).includes('GEN_WEIGHT'));
    assert.ok(!fired(patient({ weightLossPct: 9 })).includes('GEN_WEIGHT'));
  });

  it('GEN_CARE_NEEDS: fires only when a care package increase is dated', () => {
    assert.ok(fired(patient({ carePackageIncreasedAt: '2026-06-03' })).includes('GEN_CARE_NEEDS'));
    assert.ok(!fired(patient({})).includes('GEN_CARE_NEEDS'));
  });

  it('GEN_PERFORMANCE: status 3 fires, 2 does not', () => {
    assert.ok(fired(patient({ performanceStatus: 3 })).includes('GEN_PERFORMANCE'));
    assert.ok(!fired(patient({ performanceStatus: 2 })).includes('GEN_PERFORMANCE'));
  });

  it('DIS_CANCER: metastatic term with performance status 2 fires; status 1 does not; term alone does not', () => {
    assert.ok(fired(patient({ conditions: ['Metastatic breast cancer'], performanceStatus: 2 })).includes('DIS_CANCER'));
    assert.ok(!fired(patient({ conditions: ['Metastatic breast cancer'], performanceStatus: 1 })).includes('DIS_CANCER'));
    assert.ok(!fired(patient({ conditions: ['Metastatic breast cancer'] })).includes('DIS_CANCER'));
  });

  it('DIS_HEART: heart failure with NYHA 3 fires, NYHA 2 does not, NYHA alone does not', () => {
    assert.ok(fired(patient({ conditions: ['Heart failure'], nyha: 3 })).includes('DIS_HEART'));
    assert.ok(!fired(patient({ conditions: ['Heart failure'], nyha: 2 })).includes('DIS_HEART'));
    assert.ok(!fired(patient({ conditions: ['Asthma'], nyha: 4 })).includes('DIS_HEART'));
  });

  it('DIS_RESP: COPD with MRC 4 fires, MRC 3 does not; matching is case-insensitive', () => {
    assert.ok(fired(patient({ conditions: ['copd'], mrcDyspnoea: 4 })).includes('DIS_RESP'));
    assert.ok(fired(patient({ conditions: ['Pulmonary Fibrosis'], mrcDyspnoea: 5 })).includes('DIS_RESP'));
    assert.ok(!fired(patient({ conditions: ['COPD'], mrcDyspnoea: 3 })).includes('DIS_RESP'));
  });

  it('DIS_NEURO: any of the four neurological terms fires as a substring', () => {
    for (const term of ["Parkinson's disease", 'Motor neurone disease', 'Multiple sclerosis', 'Vascular dementia']) {
      assert.ok(fired(patient({ conditions: [term] })).includes('DIS_NEURO'), term);
    }
    assert.ok(!fired(patient({ conditions: ['Epilepsy'] })).includes('DIS_NEURO'));
  });

  it('DIS_RENAL: a stage 4 or 5 term fires; plain CKD does not', () => {
    assert.ok(fired(patient({ conditions: ['CKD stage 4'] })).includes('DIS_RENAL'));
    assert.ok(fired(patient({ conditions: ['ESRF on dialysis'] })).includes('DIS_RENAL'));
    assert.ok(!fired(patient({ conditions: ['CKD'] })).includes('DIS_RENAL'));
  });

  it('DIS_LIVER: cirrhosis or liver failure fires', () => {
    assert.ok(fired(patient({ conditions: ['Alcoholic cirrhosis'] })).includes('DIS_LIVER'));
    assert.ok(!fired(patient({ conditions: ['Gallstones'] })).includes('DIS_LIVER'));
  });
});

// ---------------------------------------------------------------------------
// Evidence wording
// ---------------------------------------------------------------------------

describe('evidence', () => {
  it('is non-empty for every fired signal across a patient that trips every rule family', () => {
    const p = patient({
      conditions: ['Heart failure', 'COPD', "Parkinson's disease", 'CKD stage 5', 'Cirrhosis', 'Metastatic lung cancer', 'Frailty'],
      nyha: 4,
      mrcDyspnoea: 4,
      performanceStatus: 3,
      frailtyCfs: 7,
      weightLossPct: 12,
      carePackageIncreasedAt: '2026-05-01',
      admissions: [emergency('2026-08-01T10:00:00Z'), emergency('2026-02-01T10:00:00Z')],
    });
    const a = rulesEngine.assess(p, CTX);
    assert.ok(a.signals.length >= 10);
    for (const s of a.signals) {
      assert.ok(s.evidence.trim().length > 0, `${s.id} has evidence`);
      assert.ok(s.basis.length > 0);
    }
    assert.equal(a.tier, 'review this week');
  });

  it('cites the problem-list entry with status, date and code', () => {
    const p = patient({
      conditions: ["Parkinson's disease"],
      conditionDetail: [
        { term: "Parkinson's disease", source: 'problem list', status: 'active', recordedAt: '2026-02-14', code: 'SIM-PROBLEM-3' },
      ],
    });
    const s = rulesEngine.assess(p, CTX).signals.find((x) => x.id === 'DIS_NEURO');
    assert.ok(s);
    assert.equal(s.evidence, "Parkinson's disease on the problem list, active, recorded 14 Feb 2026 (SIM-PROBLEM-3)");
    assert.equal(s.recordedAt, '2026-02-14');
  });

  it('says plainly when the directory and the problem list disagree', () => {
    const p = patient({
      conditions: ['Heart failure'],
      conditionDetail: [
        { term: 'Heart failure', source: 'directory' },
        { term: 'Heart failure', source: 'problem list', status: 'resolved', recordedAt: '2026-08-13' },
      ],
    });
    const ev = conditionEvidence(p, ['heart failure'], 'fallback');
    assert.equal(
      ev.text,
      'Heart failure listed in the patient directory; the problem list marks it resolved on 13 Aug 2026. Conflicting entries, check the record.',
    );
  });

  it('falls back to the reference wording when only plain terms are known', () => {
    const p = patient({ conditions: ['Cirrhosis'] });
    const s = rulesEngine.assess(p, CTX).signals.find((x) => x.id === 'DIS_LIVER');
    assert.ok(s);
    assert.equal(s.evidence, 'Advanced liver disease recorded');
  });
});

// ---------------------------------------------------------------------------
// Adapted rules: fire on record-shaped data, never alongside their reference sibling
// ---------------------------------------------------------------------------

describe('adapted rules', () => {
  it('REC_HEART fires on heart failure with no NYHA class, and steps aside when NYHA is recorded', () => {
    const noGrade = fired(patient({ conditions: ['Heart failure'] }));
    assert.ok(noGrade.includes('REC_HEART'));
    assert.ok(!noGrade.includes('DIS_HEART'));

    for (const nyha of [1, 3]) {
      const graded = fired(patient({ conditions: ['Heart failure'], nyha }));
      assert.ok(!graded.includes('REC_HEART'), `NYHA ${nyha}`);
      assert.ok(!(graded.includes('REC_HEART') && graded.includes('DIS_HEART')));
    }
  });

  it('REC_RESP fires on COPD with no MRC grade, and steps aside when MRC is recorded', () => {
    const noGrade = fired(patient({ conditions: ['COPD'] }));
    assert.ok(noGrade.includes('REC_RESP'));
    assert.ok(!noGrade.includes('DIS_RESP'));
    const graded = fired(patient({ conditions: ['COPD'], mrcDyspnoea: 4 }));
    assert.ok(graded.includes('DIS_RESP') && !graded.includes('REC_RESP'));
  });

  it('REC_FRAILTY fires on a frailty term with no CFS, and steps aside when a CFS is recorded', () => {
    const noScale = fired(patient({ conditions: ['Frailty'] }));
    assert.ok(noScale.includes('REC_FRAILTY') && !noScale.includes('GEN_FRAILTY'));
    const scaled = fired(patient({ conditions: ['Frailty'], frailtyCfs: 6 }));
    assert.ok(scaled.includes('GEN_FRAILTY') && !scaled.includes('REC_FRAILTY'));
    const mild = fired(patient({ conditions: ['Frailty'], frailtyCfs: 3 }));
    assert.ok(!mild.includes('GEN_FRAILTY') && !mild.includes('REC_FRAILTY'));
  });

  it('REC_RENAL_EGFR reads the latest eGFR, cites it, and defers to DIS_RENAL when a stage term exists', () => {
    const labs = [
      { at: '2026-03-10', analyte: 'egfr', name: 'eGFR', value: 45, unit: 'mL/min/1.73m²' },
      { at: '2026-09-11', analyte: 'egfr', name: 'eGFR', value: 27, unit: 'mL/min/1.73m²' },
    ];
    const p = patient({
      conditions: ['CKD'],
      conditionDetail: [{ term: 'CKD', source: 'problem list', status: 'active', recordedAt: '2025-11-02' }],
      labs,
    });
    const a = rulesEngine.assess(p, CTX);
    const s = a.signals.find((x) => x.id === 'REC_RENAL_EGFR');
    assert.ok(s);
    // Node's ICU spells September as "Sep" or "Sept" depending on the ICU build; both are the same date.
    assert.match(s.evidence, /^eGFR 27 mL\/min\/1\.73m² on 11 Sept? 2026, CKD on the problem list, active, recorded 2 Nov 2025$/);
    assert.equal(s.recordedAt, '2026-09-11');

    // latest value above threshold: does not fire even though an older one was below
    const improving = patient({ conditions: ['CKD'], labs: [...labs, { at: '2026-09-12', analyte: 'egfr', name: 'eGFR', value: 31, unit: '' }] });
    assert.ok(!fired(improving).includes('REC_RENAL_EGFR'));

    // no kidney term: does not fire
    assert.ok(!fired(patient({ conditions: ['Asthma'], labs })).includes('REC_RENAL_EGFR'));

    // stage term present: DIS_RENAL fires, REC does not
    const staged = fired(patient({ conditions: ['CKD stage 4'], labs }));
    assert.ok(staged.includes('DIS_RENAL') && !staged.includes('REC_RENAL_EGFR'));
  });

  it('REC_ADMISSION_RECENT fires on one attendance in 3 months and never alongside GEN_ADMISSIONS', () => {
    const one = patient({ admissions: [emergency('2026-08-20T09:00:00Z', 'Breathlessness')] });
    const a = rulesEngine.assess(one, CTX);
    const s = a.signals.find((x) => x.id === 'REC_ADMISSION_RECENT');
    assert.ok(s);
    assert.equal(s.evidence, 'Unplanned hospital attendance on 20 Aug 2026: Breathlessness');

    const old = fired(patient({ admissions: [emergency('2026-04-01T09:00:00Z')] }));
    assert.ok(!old.includes('REC_ADMISSION_RECENT'));

    const two = fired(patient({ admissions: [emergency('2026-08-20T09:00:00Z'), emergency('2026-01-20T09:00:00Z')] }));
    assert.ok(two.includes('GEN_ADMISSIONS') && !two.includes('REC_ADMISSION_RECENT'));
  });

  it('a disabled rule never fires', () => {
    const r = rule('REC_HEART');
    r.enabled = false;
    try {
      assert.ok(!fired(patient({ conditions: ['Heart failure'] })).includes('REC_HEART'));
    } finally {
      r.enabled = true;
    }
  });
});

// ---------------------------------------------------------------------------
// Tiers, ported from the Python comments
// ---------------------------------------------------------------------------

describe('tierFor', () => {
  const D = sig('disease-specific');
  const G = sig('general');
  const S = sig('service-use');

  it('no signals: no prompt', () => assert.equal(tierFor([]), 'no prompt'));
  it('service use alone never prompts', () => {
    assert.equal(tierFor([S]), 'no prompt');
    assert.equal(tierFor([S, sig('service-use', 'S2')]), 'no prompt');
  });
  it('one disease or one general: consider at next contact', () => {
    assert.equal(tierFor([D]), 'consider at next contact');
    assert.equal(tierFor([G]), 'consider at next contact');
    assert.equal(tierFor([G, S]), 'consider at next contact');
  });
  it('disease plus one, or two general: review this month', () => {
    assert.equal(tierFor([D, G]), 'review this month');
    assert.equal(tierFor([D, S]), 'review this month');
    assert.equal(tierFor([G, sig('general', 'G2')]), 'review this month');
  });
  it('disease plus two general or service: review this week', () => {
    assert.equal(tierFor([D, G, S]), 'review this week');
    assert.equal(tierFor([D, G, sig('general', 'G2')]), 'review this week');
    assert.equal(tierFor([D, S, sig('service-use', 'S2')]), 'review this week');
  });
  it('an assessment with no signals has tier no prompt', () => {
    const a = rulesEngine.assess(patient({ conditions: ['Asthma'] }), CTX);
    assert.equal(a.signals.length, 0);
    assert.equal(a.tier, 'no prompt');
    assert.equal(a.alreadyOnRegister, false);
    assert.equal(a.hasPlan, false);
  });
});

// ---------------------------------------------------------------------------
// Inert indicators
// ---------------------------------------------------------------------------

describe('inertIndicators', () => {
  it('reports rules whose required field is absent from every sampled patient', () => {
    const sample = [patient({ conditions: ['Heart failure'] }), patient({ conditions: ['COPD'] })];
    const inert = inertIndicators(sample);
    const ids = inert.map((i) => i.id);
    for (const id of ['GEN_FRAILTY', 'GEN_WEIGHT', 'GEN_CARE_NEEDS', 'GEN_PERFORMANCE', 'DIS_CANCER', 'DIS_HEART', 'DIS_RESP']) {
      assert.ok(ids.includes(id), `${id} is inert`);
    }
    for (const id of ['DIS_NEURO', 'DIS_RENAL', 'DIS_LIVER', 'REC_HEART', 'REC_RESP', 'REC_FRAILTY', 'REC_RENAL_EGFR', 'REC_ADMISSION_RECENT', 'GEN_ADMISSIONS']) {
      assert.ok(!ids.includes(id), `${id} can fire`);
    }
    assert.equal(inert.find((i) => i.id === 'DIS_HEART')?.missingField, 'nyha');
  });

  it('a field present on any one patient makes the rule live', () => {
    const sample = [patient({}), patient({ frailtyCfs: 2 })];
    assert.ok(!inertIndicators(sample).some((i) => i.id === 'GEN_FRAILTY'));
  });

  it('an empty sample reports nothing', () => assert.deepEqual(inertIndicators([]), []));
});

// ---------------------------------------------------------------------------
// Model engine: falls back, merges only rank and note
// ---------------------------------------------------------------------------

type FetchImpl = typeof fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('modelEngine', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const flagged = () =>
    patient({ id: 'NHS000128', conditions: ['Heart failure', 'Frailty'], admissions: [emergency('2026-08-01T00:00:00Z')] });
  const quiet = () => patient({ id: 'NHS000129', conditions: ['Asthma'] });

  function assertUnchanged(merged: Assessment[], base: Assessment[]) {
    assert.deepEqual(merged, base);
    for (const a of merged) {
      assert.equal(a.modelRank, undefined);
      assert.equal(a.modelNote, undefined);
    }
  }

  it('returns the rules assessments unchanged when fetch rejects', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('connection refused'))) as FetchImpl;
    const engine = modelEngine(rulesEngine, { endpoint: 'http://localhost:3000/api/score', timeoutMs: 100 });
    const ps = [flagged(), quiet()];
    const merged = await engine.assessMany(ps, CTX);
    assertUnchanged(merged, ps.map((p) => rulesEngine.assess(p, CTX)));
    assert.equal(engine.id, 'rules+model');
  });

  it('returns the rules assessments unchanged on the 501 stub', async () => {
    globalThis.fetch = (() => Promise.resolve(jsonResponse(501, { message: 'not implemented' }))) as FetchImpl;
    const engine = modelEngine(rulesEngine, { endpoint: 'http://localhost:3000/api/score', timeoutMs: 100 });
    const ps = [flagged()];
    assertUnchanged(await engine.assessMany(ps, CTX), ps.map((p) => rulesEngine.assess(p, CTX)));
  });

  it('returns the rules assessments unchanged on timeout', async () => {
    globalThis.fetch = ((_: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })) as FetchImpl;
    const engine = modelEngine(rulesEngine, { endpoint: 'http://localhost:3000/api/score', timeoutMs: 20 });
    const ps = [flagged()];
    assertUnchanged(await engine.assessMany(ps, CTX), ps.map((p) => rulesEngine.assess(p, CTX)));
  });

  it('returns the rules assessments unchanged on malformed JSON or a missing patient', async () => {
    const engine = modelEngine(rulesEngine, { endpoint: 'http://localhost:3000/api/score', timeoutMs: 100 });
    const ps = [flagged()];
    const base = ps.map((p) => rulesEngine.assess(p, CTX));

    globalThis.fetch = (() => Promise.resolve(new Response('not json {', { status: 200 }))) as FetchImpl;
    assertUnchanged(await engine.assessMany(ps, CTX), base);

    globalThis.fetch = (() => Promise.resolve(jsonResponse(200, { engine: 'x', ranking: [] }))) as FetchImpl;
    assertUnchanged(await engine.assessMany(ps, CTX), base);

    globalThis.fetch = (() =>
      Promise.resolve(jsonResponse(200, { engine: 'x', validated: false, ranking: [{ id: 'SOMEONE_ELSE', rank: 1 }] }))) as FetchImpl;
    assertUnchanged(await engine.assessMany(ps, CTX), base);
  });

  it('does not call the endpoint when nobody is flagged', async () => {
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      return Promise.resolve(jsonResponse(200, { engine: 'x', validated: false, ranking: [] }));
    }) as FetchImpl;
    const engine = modelEngine(rulesEngine, { endpoint: 'http://localhost:3000/api/score', timeoutMs: 100 });
    await engine.assessMany([quiet()], CTX);
    assert.equal(calls, 0);
  });

  it('merges rank and note only; signals and tier are untouched', async () => {
    let sentBody: unknown;
    globalThis.fetch = ((_: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return Promise.resolve(
        jsonResponse(200, {
          engine: 'cairn-ml-0.1',
          validated: false,
          // the reply tries to smuggle in a tier and signals; they must be ignored
          ranking: [{ id: 'NHS000128', rank: 1, note: 'narrative mentions increasing breathlessness', tier: 'review this week', signals: ['X'] }],
        }),
      );
    }) as FetchImpl;

    const engine = modelEngine(rulesEngine, { endpoint: 'http://localhost:3000/api/score', timeoutMs: 100 });
    const ps = [flagged(), quiet()];
    const base = ps.map((p) => rulesEngine.assess(p, CTX));
    const merged = await engine.assessMany(ps, CTX);

    assert.deepEqual(sentBody, {
      patients: [{ id: 'NHS000128', signalIds: base[0].signals.map((s) => s.id), tier: base[0].tier }],
    });

    assert.equal(merged[0].modelRank, 1);
    assert.equal(
      merged[0].modelNote,
      'cairn-ml-0.1: model-suggested ordering, not validated against outcomes. narrative mentions increasing breathlessness',
    );
    assert.deepEqual(merged[0].signals, base[0].signals);
    assert.equal(merged[0].tier, base[0].tier);
    assert.equal(merged[0].alreadyOnRegister, base[0].alreadyOnRegister);
    assert.equal(merged[0].hasPlan, base[0].hasPlan);
    assert.deepEqual(Object.keys(merged[0]).sort(), [...Object.keys(base[0]), 'modelRank', 'modelNote'].sort());

    // the unflagged patient is not sent and not touched
    assert.deepEqual(merged[1], base[1]);
  });
});

describe('getEngine', () => {
  it('defaults to rules and resolves a relative endpoint against localhost', () => {
    assert.equal(getEngine({}).id, 'rules');
    assert.equal(getEngine({ SCORING_ENGINE: 'model' }).id, 'rules+model');
    assert.equal(resolveModelEndpoint(undefined, undefined), 'http://localhost:3000/api/score');
    assert.equal(resolveModelEndpoint('/score', '4100'), 'http://localhost:4100/score');
    assert.equal(resolveModelEndpoint('http://ml:8000/score', '4100'), 'http://ml:8000/score');
  });
});

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

function caseFor(patientId: string, overrides: Partial<CaseState> = {}): CaseState {
  return {
    patientId,
    state: 'flagged',
    participants: [],
    removedParticipants: [],
    threads: [],
    record: { patientId, status: 'draft', fields: {}, sharedWith: [], audit: [], version: 1 },
    audit: [],
    updatedAt: NOW,
    ...overrides,
  };
}

describe('sweep', () => {
  it('counts a small population and reports null cancer share when nothing is flagged', () => {
    const ps = [patient({ conditions: ['Asthma'] }), patient({ conditions: ['Hypertension'], onPalliativeRegister: true })];
    const as = ps.map((p) => rulesEngine.assess(p, CTX));
    const r = sweep(ps, as, new Map(), NOW);
    assert.deepEqual(r.funnel, {
      patientsScanned: 2,
      alreadyOnRegister: 1,
      indicatorsPresent: 0,
      notOnRegisterOrPlan: 0,
      reviewThisWeek: 0,
      promptedForReview: 0,
      waitingOnSomeone: 0,
    });
    assert.equal(r.equity.cohortCancerShare, null);
    assert.equal(r.equity.cohortNonCancerShare, null);
    assert.equal(r.equity.newlyIdentifiedNonCancerShare, null);
    assert.equal(r.equity.imdAvailable, false);
    assert.deepEqual(r.equity.flagRateByImdQuintile, {});
    assert.equal(r.rows.length, 0);
    assert.equal(r.engineId, 'rules');
    assert.equal(r.modelDisclosure, undefined);
    assert.ok(r.inertIndicators.some((i) => i.id === 'GEN_FRAILTY'));
  });

  it('builds the funnel, tiers, equity shares and ordered rows', () => {
    const week = patient({
      id: 'W',
      conditions: ['Heart failure', 'Frailty'],
      admissions: [emergency('2026-08-01T00:00:00Z'), emergency('2026-02-01T00:00:00Z')],
    }); // REC_HEART + REC_FRAILTY + GEN_ADMISSIONS -> review this week
    const month = patient({ id: 'M', conditions: ['COPD', 'Frailty'] }); // REC_RESP + REC_FRAILTY -> review this month
    const next = patient({ id: 'N', conditions: ['Metastatic lung cancer', 'Frailty'], hasAcpRecord: true }); // REC_FRAILTY only
    const none = patient({ id: 'Z', conditions: ['Asthma'], onPalliativeRegister: true });
    const ps = [none, next, month, week];
    const as = ps.map((p) => rulesEngine.assess(p, CTX));

    const cases = new Map<string, CaseState>();
    cases.set(
      'M',
      caseFor('M', {
        state: 'meeting held',
        participants: [
          {
            id: 'p-nurse', name: 'Sam Okafor', role: 'community nurse', roleLabel: 'Respiratory specialist nurse',
            organisation: 'Community', reasonForInclusion: 'r', evidence: 'e', source: 'derived', channel: 'professional',
            required: true, status: 'accepted',
          },
        ],
        outcome: {
          patientId: 'M', heldAt: NOW, summary: 's', attendees: [], apologies: [], decisions: [], recordedBy: 'p-gp',
          nextSteps: [
            { id: 'n1', what: 'Done thing', ownerId: 'p-gp', due: '2026-09-01', status: 'done' },
            { id: 'n2', what: 'Home visit', ownerId: 'p-nurse', due: '2026-09-15', status: 'open' },
            { id: 'n3', what: 'Later thing', ownerId: 'p-gp', due: '2026-09-20', status: 'blocked' },
          ],
        },
      }),
    );

    const r = sweep(ps, as, cases, NOW);

    assert.equal(as.find((a) => a.patientId === 'W')?.tier, 'review this week');
    assert.equal(as.find((a) => a.patientId === 'M')?.tier, 'review this month');
    assert.equal(as.find((a) => a.patientId === 'N')?.tier, 'consider at next contact');

    assert.deepEqual(r.funnel, {
      patientsScanned: 4,
      alreadyOnRegister: 1,
      indicatorsPresent: 3,
      notOnRegisterOrPlan: 2,
      reviewThisWeek: 1,
      promptedForReview: 2,
      waitingOnSomeone: 1,
    });
    assert.deepEqual(r.byTier, {
      'review this week': 1,
      'review this month': 1,
      'consider at next contact': 1,
      'no prompt': 1,
    });

    // rows: work in progress first ('meeting held', M), then 'flagged' (W then N by tier)
    assert.deepEqual(r.rows.map((x) => x.patientId), ['M', 'W', 'N']);
    assert.deepEqual(r.rows[0].waitingOn, {
      what: 'Home visit',
      ownerName: 'Sam Okafor',
      ownerRole: 'Respiratory specialist nurse',
      due: '2026-09-15',
      status: 'open',
    });
    assert.equal(r.rows[2].isCancer, true);
    assert.equal(isCancer(next), true);

    // 1 of 3 flagged is cancer; the 2 newly identified (W, M) are non-cancer
    assert.equal(r.equity.cohortCancerShare, 0.333);
    assert.equal(r.equity.cohortNonCancerShare, 0.667);
    assert.equal(r.equity.newlyIdentifiedNonCancerShare, 1);
    assert.match(r.equity.note, /indicators present in the record/);
  });

  it('orders by model rank within a tier and sets the disclosure', () => {
    const a = patient({ id: 'A', conditions: ['Heart failure'] });
    const b = patient({ id: 'B', conditions: ['COPD'] });
    const as = [a, b].map((p) => rulesEngine.assess(p, CTX));
    as[0] = { ...as[0], modelRank: 2, modelNote: 'x' };
    as[1] = { ...as[1], modelRank: 1, modelNote: 'x' };
    const r = sweep([a, b], as, new Map(), NOW);
    assert.deepEqual(r.rows.map((x) => x.patientId), ['B', 'A']);
    assert.equal(r.engineId, 'rules+model');
    assert.ok(r.modelDisclosure && r.modelDisclosure.length > 0);
  });

  it('reports IMD flag rates when the field exists', () => {
    const ps = [
      patient({ conditions: ['Heart failure'], imdQuintile: 1 }),
      patient({ conditions: ['Asthma'], imdQuintile: 1 }),
      patient({ conditions: ['COPD'], imdQuintile: 5 }),
    ];
    const r = sweep(ps, ps.map((p) => rulesEngine.assess(p, CTX)), new Map(), NOW);
    assert.equal(r.equity.imdAvailable, true);
    assert.deepEqual(r.equity.flagRateByImdQuintile, { '1': 0.5, '5': 1 });
  });
});
