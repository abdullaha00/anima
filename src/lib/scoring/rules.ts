/**
 * The rules engine. A direct port of `signals_for` and `assess` in reference/cairn/signals.py,
 * reading the catalogue in ./catalogue.ts. It reports indicators present in the record and
 * makes no prediction about this patient.
 */

import type { Assessment, Patient, Signal } from '@/lib/domain/types';
import { INDICATORS, tierFor, type IndicatorRule, type RuleContext } from './catalogue';
import type { SignalEngine } from './index';

function defaultContext(): RuleContext {
  return { nowIso: new Date().toISOString() };
}

/** Every enabled indicator present in this record, with its evidence. No score, ever. */
export function signalsFor(patient: Patient, ctx: RuleContext): Signal[] {
  const out: Signal[] = [];
  for (const rule of INDICATORS) {
    if (!rule.enabled) continue;
    try {
      if (!rule.test(patient, ctx)) continue;
      const ev = rule.evidence(patient, ctx);
      out.push({
        id: rule.id,
        label: rule.label,
        family: rule.family,
        basis: rule.basis,
        evidence: ev.text,
        ...(ev.recordedAt ? { recordedAt: ev.recordedAt } : {}),
      });
    } catch {
      continue; // a missing field means the indicator simply does not fire
    }
  }
  return out;
}

export const rulesEngine: SignalEngine = {
  id: 'rules',
  assess(patient: Patient, ctx?: RuleContext): Assessment {
    const signals = signalsFor(patient, ctx ?? defaultContext());
    return {
      patientId: patient.id,
      signals,
      tier: tierFor(signals),
      alreadyOnRegister: Boolean(patient.onPalliativeRegister),
      hasPlan: Boolean(patient.hasAcpRecord),
    };
  },
};

export interface InertIndicator {
  id: string;
  label: string;
  missingField: string;
}

/**
 * Which catalogue rules cannot fire on this data source, because one of the fields they
 * read is undefined on every patient in the sample. The UI uses this to say "no data"
 * rather than "no indicator".
 */
export function inertIndicators(samplePatients: Patient[], rules: IndicatorRule[] = INDICATORS): InertIndicator[] {
  if (samplePatients.length === 0) return [];
  const out: InertIndicator[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const missing = rule.requires.find((field) => samplePatients.every((p) => p[field] === undefined));
    if (missing !== undefined) out.push({ id: rule.id, label: rule.label, missingField: String(missing) });
  }
  return out;
}
