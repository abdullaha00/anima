/**
 * Pull a bounded slice of the simulator and write it to data/snapshot/.
 *
 *   npm run snapshot -- --limit 2000
 *
 * Reads SIM_API_KEY and SIM_BASE_URL from .env.local (no dotenv dependency).
 * Writes patients.json (compact) and meta.json (pretty), then prints a summary.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Patient } from '../src/lib/domain/types';
import { pullSlice, SNAPSHOT_PATIENT_LIMIT } from '../src/lib/data/pull';

/** A ten-line .env parser: KEY=value lines, comments and blanks ignored, existing env wins. */
function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function readLimit(argv: string[]): number {
  const index = argv.indexOf('--limit');
  const raw = index >= 0 ? Number(argv[index + 1]) : NaN;
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : SNAPSHOT_PATIENT_LIMIT;
}

function countMatching(patients: Patient[], pattern: RegExp): number {
  return patients.filter((patient) => patient.conditions.some((term) => pattern.test(term))).length;
}

function pad(label: string, value: string | number): string {
  return `${label.padEnd(34)} ${String(value)}`;
}

async function main(): Promise<void> {
  const root = process.cwd();
  loadEnvFile(path.join(root, '.env.local'));

  const limit = readLimit(process.argv.slice(2));
  const started = Date.now();
  console.log(`Pulling up to ${limit} patients from ${process.env.SIM_BASE_URL ?? 'https://sim.animahealth.com'}`);

  const result = await pullSlice({ patientLimit: limit, log: (line) => console.log(`  ${line}`) });

  const dir = path.join(root, 'data', 'snapshot');
  fs.mkdirSync(dir, { recursive: true });
  const patientsFile = path.join(dir, 'patients.json');
  const metaFile = path.join(dir, 'meta.json');
  fs.writeFileSync(patientsFile, JSON.stringify(result.patients));
  fs.writeFileSync(metaFile, JSON.stringify(result.meta, null, 2));

  const { patients } = result;
  const sizeMb = fs.statSync(patientsFile).size / (1024 * 1024);

  console.log('');
  console.log(pad('patients', patients.length));
  console.log(pad('full records', result.meta.fullRecordCount));
  console.log(pad('patients.json size (MB)', sizeMb.toFixed(2)));
  console.log(pad('elapsed (s)', ((Date.now() - started) / 1000).toFixed(0)));
  console.log('');
  console.log(pad('heart failure', countMatching(patients, /heart failure/i)));
  console.log(pad('CKD or kidney', countMatching(patients, /\bckd\b|kidney|esrf/i)));
  console.log(pad('COPD', countMatching(patients, /\bcopd\b/i)));
  console.log(pad('frailty', countMatching(patients, /frailty/i)));
  console.log(pad('dementia', countMatching(patients, /dementia/i)));
  console.log(pad("Parkinson's", countMatching(patients, /parkinson/i)));
  console.log(pad('cancer', countMatching(patients, /cancer|carcinoma|metastatic|lymphoma|leukaemia|myeloma/i)));
  console.log(pad('any admission or attendance', patients.filter((p) => p.admissions.length > 0).length));
  console.log(pad('any unplanned episode', patients.filter((p) => p.admissions.some((a) => a.emergency)).length));
  console.log(pad('medicationCount > 0', patients.filter((p) => (p.medicationCount ?? 0) > 0).length));
  console.log(pad('medications listed', patients.filter((p) => (p.medications?.length ?? 0) > 0).length));

  if (result.problems.length > 0) {
    console.log('');
    console.log(`${result.problems.length} requests failed after retries:`);
    for (const problem of result.problems.slice(0, 20)) console.log(`  ${problem}`);
    if (result.problems.length > 20) console.log(`  ... and ${result.problems.length - 20} more`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
