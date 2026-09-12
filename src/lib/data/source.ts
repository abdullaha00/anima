/**
 * The one place the app asks for patients.
 *
 * SIM_MODE=snapshot (default): the files under data/snapshot, zero network.
 * SIM_MODE=live: the same bounded slice the snapshot script pulls, cached in
 * memory for the process. Any hard failure falls back to the snapshot and
 * marks the result degraded, so the Shell can say "using cached data".
 *
 * Server-only.
 */

import type { Patient, SnapshotMeta } from '@/lib/domain/types';
import { pullSlice, SNAPSHOT_PATIENT_LIMIT } from './pull';
import { loadSnapshot } from './snapshot';

export type SourceMode = 'snapshot' | 'live';

export interface PatientSource {
  patients: Patient[];
  meta: SnapshotMeta;
  mode: SourceMode;
  /** True when live mode could not deliver and the snapshot is standing in, or the live pull was partial. */
  degraded: boolean;
  degradedReason?: string;
}

/** After a failed live pull, serve the snapshot for this long before trying again. */
const LIVE_RETRY_COOLDOWN_MS = 60_000;

let liveCache: PatientSource | null = null;
let livePending: Promise<PatientSource> | null = null;
let lastLiveFailureAt = 0;

export function sourceMode(): SourceMode {
  return process.env.SIM_MODE?.trim().toLowerCase() === 'live' ? 'live' : 'snapshot';
}

function fromSnapshot(degradedReason?: string): PatientSource {
  const snapshot = loadSnapshot();
  return {
    patients: snapshot.patients,
    meta: snapshot.meta,
    mode: degradedReason ? 'live' : 'snapshot',
    degraded: Boolean(degradedReason),
    degradedReason,
  };
}

/** One live pull. Hard failures fall back; partial failures are served but flagged. */
async function pullLive(): Promise<PatientSource> {
  try {
    const result = await pullSlice({ patientLimit: SNAPSHOT_PATIENT_LIMIT });
    const partial = result.problems.length > 0;
    const source: PatientSource = {
      patients: result.patients,
      meta: result.meta,
      mode: 'live',
      degraded: partial,
      degradedReason: partial
        ? `${result.problems.length} simulator requests failed after retries; affected patients show directory rows only.`
        : undefined,
    };
    liveCache = source;
    return source;
  } catch (error) {
    lastLiveFailureAt = Date.now();
    const reason = error instanceof Error ? error.message : String(error);
    return fromSnapshot(`Simulator unavailable (${reason}); using the snapshot on disk.`);
  }
}

export async function getPatients(): Promise<PatientSource> {
  if (sourceMode() !== 'live') return fromSnapshot();
  if (liveCache) return liveCache;

  if (Date.now() - lastLiveFailureAt < LIVE_RETRY_COOLDOWN_MS) {
    return fromSnapshot('Simulator unavailable a moment ago; using the snapshot on disk until the next attempt.');
  }
  if (!livePending) {
    livePending = pullLive().finally(() => {
      livePending = null;
    });
  }
  return livePending;
}

export async function getPatient(id: string): Promise<Patient | undefined> {
  const { patients } = await getPatients();
  return patients.find((patient) => patient.id === id);
}
