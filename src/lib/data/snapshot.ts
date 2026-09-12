/**
 * Read the snapshot on disk: data/snapshot/patients.json and meta.json.
 *
 * Server-only (uses fs). Cached in module scope for the life of the process.
 * Missing or unreadable files never throw; they produce an empty population
 * with a meta note saying why, so the UI can say "no snapshot" plainly.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Patient, SnapshotMeta } from '@/lib/domain/types';

export interface Snapshot {
  patients: Patient[];
  meta: SnapshotMeta;
}

const SNAPSHOT_DIR = path.join(process.cwd(), 'data', 'snapshot');
const PATIENTS_FILE = path.join(SNAPSHOT_DIR, 'patients.json');
const META_FILE = path.join(SNAPSHOT_DIR, 'meta.json');

let cached: Snapshot | null = null;

/** A meta record for the case where nothing is on disk. */
function emptyMeta(note: string): SnapshotMeta {
  return {
    takenAt: '',
    baseUrl: '',
    simulationNow: '',
    patientCount: 0,
    fullRecordCount: 0,
    notes: [note],
  };
}

function readJsonFile(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
}

/** Keep only entries that look like patients. Anything else is dropped, not guessed at. */
function asPatients(value: unknown): Patient[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Patient => typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string',
  );
}

function asMeta(value: unknown, patientCount: number): SnapshotMeta {
  const rec = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    takenAt: typeof rec.takenAt === 'string' ? rec.takenAt : '',
    baseUrl: typeof rec.baseUrl === 'string' ? rec.baseUrl : '',
    simulationNow: typeof rec.simulationNow === 'string' ? rec.simulationNow : '',
    patientCount: typeof rec.patientCount === 'number' ? rec.patientCount : patientCount,
    fullRecordCount: typeof rec.fullRecordCount === 'number' ? rec.fullRecordCount : 0,
    populationTotal: typeof rec.populationTotal === 'number' ? rec.populationTotal : undefined,
    notes: Array.isArray(rec.notes) ? rec.notes.filter((n): n is string => typeof n === 'string') : [],
  };
}

function readFromDisk(): Snapshot {
  if (!fs.existsSync(PATIENTS_FILE)) {
    return { patients: [], meta: emptyMeta('No snapshot on disk. Run `npm run snapshot` to pull one from the simulator.') };
  }
  try {
    const patients = asPatients(readJsonFile(PATIENTS_FILE));
    const meta = fs.existsSync(META_FILE)
      ? asMeta(readJsonFile(META_FILE), patients.length)
      : { ...emptyMeta('Snapshot meta.json is missing; counts derived from patients.json.'), patientCount: patients.length };
    return { patients, meta };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { patients: [], meta: emptyMeta(`Snapshot could not be read: ${reason}`) };
  }
}

/** The snapshot, read once per process. */
export function loadSnapshot(): Snapshot {
  if (!cached) cached = readFromDisk();
  return cached;
}

/** Forget the cached copy, for example after the snapshot script rewrites the files. */
export function clearSnapshotCache(): void {
  cached = null;
}
