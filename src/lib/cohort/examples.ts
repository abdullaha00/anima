/**
 * Example patients for the top bar: the medically eligible deaths in the synthetic
 * mortality cohort (data/mortality-cohort-enriched/labels.ndjson), joined to the snapshot
 * on disk for a display name. Ids the snapshot does not hold are dropped, and the count of
 * dropped ids is reported so the gap is visible rather than silent.
 *
 * Server-only (uses fs). Read once per process. A missing or unreadable file yields an
 * empty list, never a throw, so the shell still renders.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadSnapshot } from '@/lib/data/snapshot';

export interface ExamplePatient {
  id: string;
  name: string;
  /** ISO date the cohort label was taken from. */
  indexDate: string;
  /** ISO date of the recorded death. */
  deathDate: string;
  deathCause: string;
  labelSource: string;
}

export interface ExamplePatientList {
  patients: ExamplePatient[];
  /** Cohort deaths whose id is not in the snapshot, so they cannot be opened. */
  excludedCount: number;
  excludedIds: string[];
  /** Why the list is empty, when it is. */
  note?: string;
}

const LABELS_FILE = path.join(process.cwd(), 'data', 'mortality-cohort-enriched', 'labels.ndjson');

interface LabelRow {
  patientId: string;
  label: number;
  indexDate: string;
  deathDate: string;
  deathCause: string;
  labelSource: string;
}

let cached: ExamplePatientList | null = null;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** One NDJSON line to a row, or null when it does not carry a patient id and a label. */
function parseRow(line: string): LabelRow | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const rec = parsed as Record<string, unknown>;
  if (typeof rec.patientId !== 'string' || typeof rec.label !== 'number') return null;
  return {
    patientId: rec.patientId,
    label: rec.label,
    indexDate: asString(rec.indexDate),
    deathDate: asString(rec.deathDate),
    deathCause: asString(rec.deathCause),
    labelSource: asString(rec.labelSource),
  };
}

function readFromDisk(): ExamplePatientList {
  if (!fs.existsSync(LABELS_FILE)) {
    return { patients: [], excludedCount: 0, excludedIds: [], note: 'No cohort labels on disk.' };
  }
  let text: string;
  try {
    text = fs.readFileSync(LABELS_FILE, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { patients: [], excludedCount: 0, excludedIds: [], note: `Cohort labels could not be read: ${reason}` };
  }

  const deaths = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseRow)
    .filter((row): row is LabelRow => row !== null && row.label === 1);

  const names = new Map(loadSnapshot().patients.map((patient) => [patient.id, patient.name] as const));
  const patients: ExamplePatient[] = [];
  const excludedIds: string[] = [];
  for (const row of deaths) {
    const name = names.get(row.patientId);
    if (name === undefined) {
      excludedIds.push(row.patientId);
      continue;
    }
    patients.push({
      id: row.patientId,
      name,
      indexDate: row.indexDate,
      deathDate: row.deathDate,
      deathCause: row.deathCause,
      labelSource: row.labelSource,
    });
  }
  patients.sort((a, b) => a.id.localeCompare(b.id));
  excludedIds.sort();

  return {
    patients,
    excludedCount: excludedIds.length,
    excludedIds,
    note: patients.length ? undefined : 'No cohort deaths are present in the snapshot.',
  };
}

/** The example patients, read once per process. */
export function loadExamplePatients(): ExamplePatientList {
  if (!cached) cached = readFromDisk();
  return cached;
}

/** Forget the cached copy, for example after the cohort or snapshot files are rewritten. */
export function clearExamplePatientsCache(): void {
  cached = null;
}
