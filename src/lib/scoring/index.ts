/**
 * The engine seam. The UI depends on `Assessment`, never on how an assessment was produced.
 *
 *   SCORING_ENGINE=rules   default, ships. Synchronous, explainable, no network.
 *   SCORING_ENGINE=model   the rules engine plus an ordering hint from MODEL_ENDPOINT.
 *                          The model may reorder within a tier. It may not add or remove a
 *                          signal and may not change a tier. If the endpoint is down, slow or
 *                          malformed, the rules assessments are returned unchanged.
 */

import type { Assessment, Patient } from '@/lib/domain/types';
import type { RuleContext } from './catalogue';
import { rulesEngine } from './rules';
import { modelEngine } from './model';

export type { RuleContext } from './catalogue';

export interface SignalEngine {
  /** 'rules' */
  id: string;
  assess(patient: Patient, ctx?: RuleContext): Assessment;
}

export interface AsyncSignalEngine {
  /** 'rules' | 'rules+model' */
  id: string;
  assessMany(patients: Patient[], ctx: RuleContext): Promise<Assessment[]>;
}

/** Lift a synchronous engine to the async shape the pages use. */
export function asAsyncEngine(engine: SignalEngine): AsyncSignalEngine {
  return {
    id: engine.id,
    assessMany: async (patients, ctx) => patients.map((p) => engine.assess(p, ctx)),
  };
}

const DEFAULT_ENDPOINT = '/api/score';
const DEFAULT_TIMEOUT_MS = 1500;

export function resolveModelEndpoint(raw: string | undefined, port: string | undefined): string {
  const endpoint = raw && raw.trim() !== '' ? raw.trim() : DEFAULT_ENDPOINT;
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const base = `http://localhost:${port ?? 3000}`;
  return new URL(endpoint, base).toString();
}

export function getEngine(env: Record<string, string | undefined> = process.env): AsyncSignalEngine {
  const choice = (env.SCORING_ENGINE ?? 'rules').trim().toLowerCase();
  if (choice !== 'model') return asAsyncEngine(rulesEngine);

  const parsed = Number.parseInt(env.MODEL_TIMEOUT_MS ?? '', 10);
  const timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
  return modelEngine(rulesEngine, {
    endpoint: resolveModelEndpoint(env.MODEL_ENDPOINT, env.PORT),
    timeoutMs,
  });
}

export { rulesEngine, inertIndicators } from './rules';
export { modelEngine } from './model';
export { INDICATORS, TIER_RULES, CANCER_TERMS, isCancer, tierFor } from './catalogue';
export { sweep } from './sweep';
