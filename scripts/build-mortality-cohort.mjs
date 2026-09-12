#!/usr/bin/env node
/**
 * Build a leakage-aware synthetic mortality cohort from NHS-SIM.
 *
 * Output:
 *   data/mortality-cohort/cohort-index.csv       labels/metadata only
 *   data/mortality-cohort/labels.ndjson          labels kept separate from inputs
 *   data/mortality-cohort/raw-records.ndjson     audit snapshot; NOT model input
 *   data/mortality-cohort/asof-{30,60,90}d.ndjson strict pre-index model inputs
 *   data/mortality-cohort/manifest.json          provenance and coverage
 *
 * Run: node scripts/build-mortality-cohort.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
loadEnv(path.join(ROOT, '.env'));
loadEnv(path.join(ROOT, '.env.local'));
const BASE = process.env.SIM_ORIGIN ?? process.env.SIM_BASE_URL ?? 'https://sim.animahealth.com';
const KEY = process.env.SIM_KEY ?? process.env.SIM_API_KEY;
if (!KEY) throw new Error('Set SIM_KEY or SIM_API_KEY');

const OUT = path.join(ROOT, 'data', 'mortality-cohort');
const CACHE = path.join('/tmp', 'anima-mortality-cohort-cache');
const TARGET_SIZE = 100;
const DIRECTORY_LIMIT = 510;
const PAGE_SIZE = 30;
const VIEW_PAGE_SIZE = 100;
const CONCURRENCY = 6;
const HORIZONS = [30, 60, 90];
const SITES = ['gp', 'hospital', 'diagnostics', 'community', 'pharmacy', 'referrals', 'wearables', 'patient'];
const NON_MEDICAL_DEATH = /road traffic|collision|accident|trauma|homicide|suicide|drowning|fire|poisoning|overdose/i;

const confirmedHighComorbidity = `
SIM-000499 SIM-000472 SIM-000464 SIM-000437 SIM-000417 SIM-000416
SIM-000395 SIM-000391 SIM-000378 SIM-000371 SIM-000349 SIM-000348
SIM-000333 SIM-000327 SIM-000304 SIM-000294 SIM-000292 SIM-000284
SIM-000283 SIM-000275 SIM-000272 SIM-000261 SIM-000250 SIM-000245
SIM-000236 SIM-000227 SIM-000222 SIM-000220 SIM-000170 SIM-000168
SIM-000115 SIM-000111 SIM-000108
`.trim().split(/\s+/);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at < 1) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function getJson(urlPath, params = {}) {
  const url = new URL(urlPath, BASE);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  let last = '';
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      last = `HTTP ${response.status}`;
      if (response.ok) return await response.json();
      if (![429, 502, 503, 504].includes(response.status)) break;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timeout);
    }
    await sleep(500 * attempt);
  }
  throw new Error(`${url.pathname}${url.search}: ${last}`);
}

async function mapConcurrent(items, limit, fn) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

async function pullDirectory() {
  const offsets = [];
  for (let offset = 0; offset < DIRECTORY_LIMIT; offset += PAGE_SIZE) offsets.push(offset);
  const pages = await mapConcurrent(offsets, CONCURRENCY, (offset) => getJson('/api/sites/gp/patients', { offset }));
  const rows = new Map();
  for (const page of pages) for (const row of page.items ?? []) rows.set(row.id, row);
  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id)).slice(0, DIRECTORY_LIMIT);
}

async function pullSite(patientId, site) {
  const cacheFile = path.join(CACHE, patientId, `${site}.json`);
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const first = await getJson(`/api/sites/${site}/view`, { patient: patientId, limit: VIEW_PAGE_SIZE });
  const resources = [...(first.resources ?? [])];
  const total = first.resourceTotal ?? resources.length;
  for (let offset = VIEW_PAGE_SIZE; offset < total; offset += VIEW_PAGE_SIZE) {
    const page = await getJson(`/api/sites/${site}/view`, { patient: patientId, limit: VIEW_PAGE_SIZE, offset });
    resources.push(...(page.resources ?? []));
  }
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(resources));
  return resources;
}

async function pullPatient(patient) {
  // Keep site requests sequential per patient: full views are expensive and the
  // simulator returns transient 502s when too many are requested together.
  const siteResults = [];
  for (const site of SITES) siteResults.push({ site, resources: await pullSite(patient.id, site) });
  const byId = new Map();
  for (const { site, resources } of siteResults) {
    for (const resource of resources) {
      // Site views can contain non-patient capacity/context records. Training data
      // keeps only resources explicitly linked to this exact patient.
      if (resource.patientId !== patient.id) continue;
      const key = resource.id ?? `${site}:${JSON.stringify(resource)}`;
      const prior = byId.get(key);
      if (prior) prior.seenAtSites.push(site);
      else byId.set(key, { ...resource, seenAtSites: [site] });
    }
  }
  return { directory: patient, resources: [...byId.values()] };
}

function ageAt(birthDate, date) {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const at = new Date(`${date}T00:00:00Z`);
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  if (at.getUTCMonth() < birth.getUTCMonth() || (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function minusDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function maxChangeTime(resource) {
  const times = [resource.createdAt];
  for (const change of resource.provenance?.changes ?? []) times.push(change.time);
  return Math.max(...times.filter(Number.isFinite), -Infinity);
}

function strictAsOf(record, indexDate, horizonDays) {
  const cutoffDate = minusDays(indexDate, horizonDays);
  const cutoffMs = Date.parse(`${cutoffDate}T23:59:59.999Z`);
  const resources = record.resources
    .filter((resource) => Number.isFinite(resource.createdAt) && resource.createdAt <= cutoffMs)
    // Current payloads cannot be reconstructed to an old version. Exclude anything changed later.
    .filter((resource) => maxChangeTime(resource) <= cutoffMs)
    .map(({ provenance, ...resource }) => resource);
  return {
    patientId: record.directory.id,
    cutoffDate,
    horizonDays,
    demographics: {
      birthDate: record.directory.birthDate,
      ageAtIndex: ageAt(record.directory.birthDate, indexDate),
    },
    resources,
  };
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeNdjson(file, rows) {
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

const startedAt = new Date().toISOString();
const clock = await getJson('/api/clock');
console.log(`Simulation date: ${new Date(clock.now).toISOString()}`);
const directory = await pullDirectory();
const byId = new Map(directory.map((patient) => [patient.id, patient]));

const allDeaths = directory.filter((patient) => patient.death);
const excludedDeaths = allDeaths.filter((patient) => NON_MEDICAL_DEATH.test(patient.death.cause));
const cases = allDeaths.filter((patient) => !NON_MEDICAL_DEATH.test(patient.death.cause));
if (cases.length === 0) throw new Error('No medically related deaths found');
const indexDate = cases.map((patient) => patient.death.date).sort()[0];

const missingConfirmed = confirmedHighComorbidity.filter((id) => !byId.has(id));
if (missingConfirmed.length) throw new Error(`Confirmed IDs missing from directory slice: ${missingConfirmed.join(', ')}`);
const confirmed = confirmedHighComorbidity.map((id) => byId.get(id)).filter((patient) => !patient.death);
const confirmedSet = new Set(confirmed.map((patient) => patient.id));
const rankedLiving = directory
  .filter((patient) => !patient.death && !confirmedSet.has(patient.id) && (patient.conditions?.length ?? 0) >= 2)
  .sort((a, b) =>
    (b.conditions.length - a.conditions.length)
    || (ageAt(b.birthDate, indexDate) - ageAt(a.birthDate, indexDate))
    || a.id.localeCompare(b.id));
const controls = [...confirmed, ...rankedLiving].slice(0, TARGET_SIZE - cases.length);
if (cases.length + controls.length < TARGET_SIZE) throw new Error(`Only ${cases.length + controls.length} eligible unique patients found`);
const cohort = [...cases, ...controls];

console.log(`Selected ${cases.length} medically related deaths + ${controls.length} living high-comorbidity controls`);
console.log(`Excluded deaths: ${excludedDeaths.map((patient) => `${patient.id} (${patient.death.cause})`).join(', ') || 'none'}`);
let completed = 0;
const records = await mapConcurrent(cohort, CONCURRENCY, async (patient) => {
  const result = await pullPatient(patient);
  completed += 1;
  if (completed % 10 === 0 || completed === cohort.length) console.log(`Records: ${completed}/${cohort.length}`);
  return result;
});
const recordById = new Map(records.map((record) => [record.directory.id, record]));

fs.mkdirSync(OUT, { recursive: true });
const labels = cohort.map((patient, position) => ({
  patientId: patient.id,
  label: patient.death ? 1 : 0,
  indexDate,
  deathDate: patient.death?.date ?? null,
  deathCause: patient.death?.cause ?? null,
  labelSource: patient.death?.source ?? 'alive-at-snapshot',
  fold: position % cases.length,
}));
writeNdjson(path.join(OUT, 'labels.ndjson'), labels);
writeNdjson(path.join(OUT, 'raw-records.ndjson'), records.map((record) => ({
  patientId: record.directory.id,
  capturedAt: startedAt,
  directory: record.directory,
  resources: record.resources,
})));

const horizonCoverage = {};
for (const horizon of HORIZONS) {
  const rows = labels.map((label) => strictAsOf(recordById.get(label.patientId), indexDate, horizon));
  writeNdjson(path.join(OUT, `asof-${horizon}d.ndjson`), rows);
  horizonCoverage[`${horizon}d`] = {
    cutoffDate: rows[0].cutoffDate,
    patientsWithRecords: rows.filter((row) => row.resources.length > 0).length,
    resourceCount: rows.reduce((sum, row) => sum + row.resources.length, 0),
    medianResources: [...rows].sort((a, b) => a.resources.length - b.resources.length)[Math.floor(rows.length / 2)].resources.length,
  };
}

const indexHeader = ['patient_id', 'label', 'index_date', 'death_date', 'death_cause', 'condition_count_current_audit_only', 'confirmed_high_comorbidity', 'fold'];
const indexRows = labels.map((label) => {
  const patient = byId.get(label.patientId);
  return [label.patientId, label.label, label.indexDate, label.deathDate, label.deathCause, patient.conditions.length, confirmedSet.has(patient.id), label.fold];
});
fs.writeFileSync(path.join(OUT, 'cohort-index.csv'), `${[indexHeader, ...indexRows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`);

const manifest = {
  schemaVersion: 1,
  syntheticDataOnly: true,
  generatedAt: new Date().toISOString(),
  simulator: { baseUrl: BASE, simulationNow: new Date(clock.now).toISOString(), directoryRowsScreened: directory.length },
  cohort: {
    patientCount: cohort.length,
    medicallyRelatedDeaths: cases.length,
    livingHighComorbidityControls: controls.length,
    excludedNonMedicalDeaths: excludedDeaths.map((patient) => ({ patientId: patient.id, date: patient.death.date, cause: patient.death.cause })),
    requestedConfirmedControlsIncluded: confirmed.length,
    indexDate,
    selection: 'All medically related deaths in the first 510 simulator patients; supplied living high-comorbidity IDs; remaining controls ranked by condition count, age, then patient ID. Controls have at least two current directory conditions.',
  },
  modelInputs: {
    recommended: 'asof-90d.ndjson',
    horizonsDays: HORIZONS,
    labelFile: 'labels.ndjson',
    rule: 'Include resources created by cutoff only; exclude resources with any provenance change after cutoff; omit current directory conditions, needs, goals, and death outcome. Demographics contain birth date and age at index only.',
    limitations: [
      'The API exposes current resource payloads, not historical versions. Updated-after-cutoff resources are excluded rather than reconstructed.',
      'Living controls are alive at snapshot, not guaranteed never to die later; this is right-censored follow-up.',
      'Only four medically related deaths are currently exposed. This is insufficient for a reliable held-out performance estimate or production model.',
      'All observed deaths share one date, so controls use the same matched index date to avoid calendar-time leakage.',
    ],
  },
  crossValidation: 'fold is 0..3. With four positives, use leave-one-positive-out grouped CV only for pipeline debugging; do not report it as clinical validation.',
  horizonCoverage,
  sitesPulled: SITES,
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify(horizonCoverage, null, 2));
