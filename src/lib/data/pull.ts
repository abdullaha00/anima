/**
 * Pull a bounded slice of the simulator and normalise it into Patients.
 *
 * Used by scripts/snapshot.ts (writes the files) and by source.ts in live mode
 * (keeps the result in memory). Both use the same limits so the two modes see
 * the same population. Server-only.
 */

import type { Patient, SnapshotMeta } from '@/lib/domain/types';
import { simBaseUrl, simGet, type SimResponse } from './sim-client';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  enrichWithView,
  isRawDirectoryRow,
  isRawResource,
  normaliseDirectoryPatient,
  withMedication,
  type RawDirectoryRow,
  type RawResource,
} from './normalise';

export const SNAPSHOT_PATIENT_LIMIT = 2000;
/** The directory endpoint returns 30 rows per page and ignores `limit`. */
const DIRECTORY_PAGE_SIZE = 30;
const VIEW_PAGE_SIZE = 100;
const CONCURRENCY = 8;
/** One attempt plus three retries on 502, 503, 504, 429 or a timeout. */
const ATTEMPTS = 4;

/**
 * Directory condition terms that earn a deep record pull. They mirror the
 * indicator catalogue: a patient whose directory conditions match none of these
 * has no disease-specific indicator to evidence, so the directory row is enough.
 */
export const DEEP_RECORD_TERMS = [
  'heart failure',
  'ckd',
  'copd',
  'pulmonary fibrosis',
  'frailty',
  'dementia',
  'parkinson',
  'motor neurone',
  'multiple sclerosis',
  'cancer',
  'carcinoma',
  'metastatic',
  'lymphoma',
  'leukaemia',
  'myeloma',
  'cirrhosis',
  'liver failure',
  'esrf',
  'kidney',
];

export function needsDeepRecord(conditions: string[]): boolean {
  const joined = conditions.join(' | ').toLowerCase();
  return DEEP_RECORD_TERMS.some((term) => joined.includes(term));
}

export interface PullOptions {
  patientLimit: number;
  log?: (line: string) => void;
}

export interface PullResult {
  patients: Patient[];
  meta: SnapshotMeta;
  /** Requests that failed after retries. Empty means a clean pull. */
  problems: string[];
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
  return status === 0 || status === 429 || status === 502 || status === 503 || status === 504;
}

/** GET with a small retry on upstream failures. Returns the last response either way. */
async function getWithRetry<T>(
  path: string,
  params?: Record<string, string | number>,
  timeoutMs?: number,
): Promise<SimResponse<T>> {
  let last: SimResponse<T> = { status: 0, json: null };
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    last = await simGet<T>(path, params, { timeoutMs });
    if (last.status === 200 && last.json !== null) return last;
    if (!isRetryable(last.status)) return last;
    await sleep(400 * attempt);
  }
  return last;
}

/** Run an async function over a list with at most `limit` in flight. Order is preserved. */
async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function describe(path: string, status: number): string {
  return status === 0 ? `${path}: timed out or unreachable` : `${path}: HTTP ${status}`;
}

// ---------------------------------------------------------------------------
// Individual pulls
// ---------------------------------------------------------------------------

async function pullClock(): Promise<string> {
  const res = await getWithRetry<unknown>('/api/clock');
  const now = asNumber(asRecord(res.json).now);
  if (res.status !== 200 || now === undefined) {
    throw new Error(describe('/api/clock', res.status));
  }
  return new Date(now).toISOString();
}

interface DirectoryPull {
  rows: RawDirectoryRow[];
  populationTotal?: number;
  failedOffsets: number[];
}

async function pullDirectory(patientLimit: number, log: (line: string) => void): Promise<DirectoryPull> {
  const offsets: number[] = [];
  for (let offset = 0; offset < patientLimit; offset += DIRECTORY_PAGE_SIZE) offsets.push(offset);

  let populationTotal: number | undefined;
  const failedOffsets: number[] = [];
  let done = 0;

  const pages = await mapConcurrent(offsets, CONCURRENCY, async (offset) => {
    const res = await getWithRetry<unknown>('/api/sites/gp/patients', { offset });
    done += 1;
    if (done % 10 === 0 || done === offsets.length) log(`directory: ${done}/${offsets.length} pages`);
    if (res.status !== 200 || res.json === null) {
      failedOffsets.push(offset);
      return [] as RawDirectoryRow[];
    }
    const body = asRecord(res.json);
    populationTotal = populationTotal ?? asNumber(body.total);
    return asArray(body.items).filter(isRawDirectoryRow);
  });

  const byId = new Map<string, RawDirectoryRow>();
  for (const row of pages.flat()) byId.set(row.id, row);
  const rows = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, patientLimit);
  return { rows, populationTotal, failedOffsets };
}

/** A resource list endpoint: attendances and documents share the `{ resources }` shape. */
async function pullResourceList(path: string, problems: string[]): Promise<RawResource[]> {
  const res = await getWithRetry<unknown>(path);
  if (res.status !== 200 || res.json === null) {
    problems.push(describe(path, res.status));
    return [];
  }
  return asArray(asRecord(res.json).resources).filter(isRawResource);
}

interface EpsMedication {
  patientId: string;
  drug: string;
}

/** The EPS bundle is simplified FHIR: subject.reference and a JSON string in an extension. */
async function pullEps(problems: string[]): Promise<EpsMedication[]> {
  const res = await getWithRetry<unknown>('/api/nhs/eps');
  if (res.status !== 200 || res.json === null) {
    problems.push(describe('/api/nhs/eps', res.status));
    return [];
  }
  const out: EpsMedication[] = [];
  for (const entry of asArray(asRecord(res.json).entry)) {
    const resource = asRecord(asRecord(entry).resource);
    const reference = asString(asRecord(resource.subject).reference) ?? '';
    const patientId = reference.startsWith('Patient/') ? reference.slice('Patient/'.length) : undefined;
    const drug = readEpsDrug(resource);
    if (patientId && drug) out.push({ patientId, drug });
  }
  return out;
}

function readEpsDrug(resource: Record<string, unknown>): string | undefined {
  for (const raw of asArray(resource.extension)) {
    const text = asString(asRecord(raw).valueString);
    if (!text) continue;
    try {
      const drug = asString(asRecord(JSON.parse(text) as unknown).drug);
      if (drug) return drug;
    } catch {
      // Not JSON; try the next extension.
    }
  }
  return asString(resource.description);
}

interface ViewPull {
  ok: boolean;
  resources: RawResource[];
  /** The last HTTP status seen; 0 means a timeout. */
  status: number;
}

/** A site view can take over ten seconds when the simulator is busy. */
const VIEW_TIMEOUT_MS = 20_000;
/** The second, slower pass over stragglers: fewer in flight, more patience. */
const STRAGGLER_CONCURRENCY = 2;
const STRAGGLER_TIMEOUT_MS = 60_000;

/** One site view for one patient, following resourceTotal across pages when needed. */
async function pullView(site: 'gp' | 'hospital', patientId: string, timeoutMs: number): Promise<ViewPull> {
  const path = `/api/sites/${site}/view`;
  const first = await getWithRetry<unknown>(path, { patient: patientId, limit: VIEW_PAGE_SIZE }, timeoutMs);
  if (first.status !== 200 || first.json === null) return { ok: false, resources: [], status: first.status };

  const body = asRecord(first.json);
  const resources = asArray(body.resources).filter(isRawResource);
  const total = asNumber(body.resourceTotal) ?? resources.length;

  for (let offset = VIEW_PAGE_SIZE; offset < total; offset += VIEW_PAGE_SIZE) {
    const page = await getWithRetry<unknown>(path, { patient: patientId, limit: VIEW_PAGE_SIZE, offset }, timeoutMs);
    if (page.status !== 200 || page.json === null) return { ok: false, resources, status: page.status };
    resources.push(...asArray(asRecord(page.json).resources).filter(isRawResource));
  }
  return { ok: true, resources, status: 200 };
}

interface DeepRecord {
  id: string;
  gp: ViewPull;
  hospital: ViewPull;
}

/**
 * Both views for each patient: a fast pass at the normal concurrency, then a
 * slow pass over whatever failed, because the simulator answers slowly under
 * load rather than refusing outright.
 */
async function pullDeepRecords(ids: string[], log: (line: string) => void): Promise<Map<string, DeepRecord>> {
  const records = new Map<string, DeepRecord>();
  let done = 0;

  const firstPass = await mapConcurrent(ids, CONCURRENCY, async (id) => {
    const [gp, hospital] = await Promise.all([
      pullView('gp', id, VIEW_TIMEOUT_MS),
      pullView('hospital', id, VIEW_TIMEOUT_MS),
    ]);
    done += 1;
    if (done % 25 === 0 || done === ids.length) log(`deep records: ${done}/${ids.length}`);
    return { id, gp, hospital };
  });
  for (const record of firstPass) records.set(record.id, record);

  const stragglers = firstPass.filter((record) => !record.gp.ok || !record.hospital.ok);
  if (stragglers.length === 0) return records;

  log(`deep records: ${stragglers.length} incomplete, second pass at concurrency ${STRAGGLER_CONCURRENCY}`);
  await sleep(2_000);
  done = 0;
  await mapConcurrent(stragglers, STRAGGLER_CONCURRENCY, async (record) => {
    const gp = record.gp.ok ? record.gp : await pullView('gp', record.id, STRAGGLER_TIMEOUT_MS);
    const hospital = record.hospital.ok ? record.hospital : await pullView('hospital', record.id, STRAGGLER_TIMEOUT_MS);
    records.set(record.id, { id: record.id, gp, hospital });
    done += 1;
    if (done % 10 === 0 || done === stragglers.length) log(`deep records: second pass ${done}/${stragglers.length}`);
  });
  return records;
}

// ---------------------------------------------------------------------------
// The slice
// ---------------------------------------------------------------------------

function groupByPatient(resources: RawResource[]): Map<string, RawResource[]> {
  const map = new Map<string, RawResource[]>();
  for (const resource of resources) {
    if (!resource.patientId) continue;
    const list = map.get(resource.patientId) ?? [];
    list.push(resource);
    map.set(resource.patientId, list);
  }
  return map;
}

function formatCount(n: number): string {
  return n.toLocaleString('en-GB');
}

export async function pullSlice(opts: PullOptions): Promise<PullResult> {
  const log = opts.log ?? (() => undefined);
  const problems: string[] = [];
  const takenAt = new Date().toISOString();

  const simulationNow = await pullClock();
  log(`simulation clock: ${simulationNow}`);

  const directory = await pullDirectory(opts.patientLimit, log);
  if (directory.rows.length === 0) {
    throw new Error('directory: no patient rows could be fetched');
  }
  for (const offset of directory.failedOffsets) problems.push(`/api/sites/gp/patients?offset=${offset}: failed after retries`);
  log(`directory: ${formatCount(directory.rows.length)} rows of ${formatCount(directory.populationTotal ?? 0)}`);

  // Global lists: not patient-filtered server-side, so group locally by exact patientId.
  const [attendances, hospitalDocs, gpDocs, eps] = await Promise.all([
    pullResourceList('/api/sites/hospital/attendances', problems),
    pullResourceList('/api/sites/hospital/documents', problems),
    pullResourceList('/api/sites/gp/documents', problems),
    pullEps(problems),
  ]);
  const globalByPatient = groupByPatient([...attendances, ...hospitalDocs, ...gpDocs]);
  log(`global: ${attendances.length} attendances, ${hospitalDocs.length + gpDocs.length} discharge summaries, ${eps.length} EPS items`);

  // Deep pulls: only patients with a catalogue condition or a hospital episode.
  const patients = directory.rows.map((row) => normaliseDirectoryPatient(row, simulationNow));
  const deepIds = patients
    .filter((patient) => needsDeepRecord(patient.conditions) || globalByPatient.has(patient.id))
    .map((patient) => patient.id);
  log(`deep records: ${deepIds.length} patients to pull`);

  const viewById = await pullDeepRecords(deepIds, log);
  for (const view of viewById.values()) {
    if (!view.gp.ok) problems.push(describe(`/api/sites/gp/view?patient=${view.id}`, view.gp.status));
    if (!view.hospital.ok) problems.push(describe(`/api/sites/hospital/view?patient=${view.id}`, view.hospital.status));
  }

  const epsByPatient = new Map<string, string[]>();
  for (const item of eps) epsByPatient.set(item.patientId, [...(epsByPatient.get(item.patientId) ?? []), item.drug]);

  const enriched = patients.map((patient) => {
    const view = viewById.get(patient.id);
    const hospitalResources = [...(view?.hospital.resources ?? []), ...(globalByPatient.get(patient.id) ?? [])];
    let next = view || hospitalResources.length > 0
      ? enrichWithView(patient, view?.gp.resources ?? [], hospitalResources, simulationNow)
      : patient;
    for (const drug of epsByPatient.get(patient.id) ?? []) next = withMedication(next, drug);
    return next;
  });

  const fullRecordCount = enriched.filter((patient) => patient.recordDepth === 'full').length;
  const failedDeep = [...viewById.values()].filter((view) => !view.gp.ok).length;

  const notes = [
    `Directory rows for the first ${formatCount(enriched.length)} patients; full GP and hospital record for the ${formatCount(fullRecordCount)} patients whose conditions match the indicator catalogue or who have a hospital episode.`,
    'No frailty score, NYHA, MRC, performance status, deprivation, register, ACP or next-of-kin fields exist in the simulator. Those Patient fields are left unset and the matching indicators cannot fire.',
    'Blood results keep only eGFR, creatinine, albumin, haemoglobin, CRP, potassium and sodium. Consultation text equal to the simulator placeholder is kept on the timeline but not as a narrative.',
  ];
  if (failedDeep > 0) notes.push(`${failedDeep} deep GP record pulls failed after retries; those patients carry directory rows only.`);
  if (directory.failedOffsets.length > 0) notes.push(`${directory.failedOffsets.length} directory pages failed after retries.`);

  const meta: SnapshotMeta = {
    takenAt,
    baseUrl: simBaseUrl(),
    simulationNow,
    patientCount: enriched.length,
    fullRecordCount,
    populationTotal: directory.populationTotal,
    notes,
  };

  return { patients: enriched, meta, problems };
}
