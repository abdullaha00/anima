/**
 * The model wrapper. Runs the rules engine first, then asks the score endpoint for an
 * ordering hint, then merges. Required behaviour, from docs/DOMAIN.md:
 *
 *   - On timeout, non-200 (including the 501 stub), malformed response or a missing
 *     patient, return the rules assessments unchanged. Never fail the page.
 *   - `signals` and `tier` always come from the rules engine. The model cannot add or
 *     remove a signal and cannot change a tier.
 *   - The model may set `modelRank` and `modelNote` only. A rank is a sort key within a
 *     tier and is never rendered as a number.
 */

import type { Assessment, Patient, ReviewTier } from '@/lib/domain/types';
import type { RuleContext } from './catalogue';
import type { AsyncSignalEngine, SignalEngine } from './index';

export interface ModelRequest {
  patients: { id: string; signalIds: string[]; tier: ReviewTier }[];
}

export interface ModelRanking {
  id: string;
  rank: number;
  note?: string;
}

export interface ModelResponse {
  engine: string;
  validated: boolean;
  ranking: ModelRanking[];
}

export interface ModelEngineOptions {
  endpoint: string;
  timeoutMs: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isRanking(v: unknown): v is ModelRanking {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.rank === 'number' &&
    Number.isFinite(v.rank) &&
    (v.note === undefined || typeof v.note === 'string')
  );
}

export function parseModelResponse(body: unknown): ModelResponse | undefined {
  if (!isRecord(body)) return undefined;
  if (typeof body.engine !== 'string' || typeof body.validated !== 'boolean') return undefined;
  if (!Array.isArray(body.ranking) || !body.ranking.every(isRanking)) return undefined;
  return { engine: body.engine, validated: body.validated, ranking: body.ranking };
}

export function modelNoteFor(response: ModelResponse, entry: ModelRanking): string {
  const base = response.validated
    ? `${response.engine}: model-suggested ordering`
    : `${response.engine}: model-suggested ordering, not validated against outcomes`;
  return entry.note ? `${base}. ${entry.note}` : base;
}

async function requestRanking(
  request: ModelRequest,
  opts: ModelEngineOptions,
): Promise<ModelResponse | undefined> {
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') return undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await doFetch(opts.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (res.status !== 200) return undefined;
    const body: unknown = await res.json();
    return parseModelResponse(body);
  } catch {
    return undefined; // timeout, network failure, or a body that is not JSON
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Merge a ranking into the rules assessments. Returns the originals untouched unless every
 * patient that was sent has a rank in the reply; a partial ordering is not an ordering.
 */
export function mergeRanking(assessments: Assessment[], sent: ModelRequest, response: ModelResponse): Assessment[] {
  const byId = new Map<string, ModelRanking>();
  for (const entry of response.ranking) byId.set(entry.id, entry);

  const sentIds = new Set(sent.patients.map((p) => p.id));
  for (const id of sentIds) if (!byId.has(id)) return assessments;

  return assessments.map((a) => {
    if (!sentIds.has(a.patientId)) return a;
    const entry = byId.get(a.patientId);
    if (!entry) return a;
    return { ...a, modelRank: entry.rank, modelNote: modelNoteFor(response, entry) };
  });
}

export function modelEngine(rules: SignalEngine, opts: ModelEngineOptions): AsyncSignalEngine {
  return {
    id: 'rules+model',
    async assessMany(patients: Patient[], ctx: RuleContext): Promise<Assessment[]> {
      const assessments = patients.map((p) => rules.assess(p, ctx));
      const request: ModelRequest = {
        patients: assessments
          .filter((a) => a.tier !== 'no prompt')
          .map((a) => ({ id: a.patientId, signalIds: a.signals.map((s) => s.id), tier: a.tier })),
      };
      if (request.patients.length === 0) return assessments;

      const response = await requestRanking(request, opts);
      if (!response) return assessments;
      return mergeRanking(assessments, request, response);
    },
  };
}
