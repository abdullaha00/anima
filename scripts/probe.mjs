#!/usr/bin/env node
/**
 * Probe NHS-SIM and write down the actual shape of the data.
 *
 *   SIM_API_KEY=sim_xxx node probe.mjs
 *   SIM_API_KEY=sim_xxx node probe.mjs --out docs/API-NOTES.md
 *
 * Zero dependencies, Node 18+. It does three things:
 *   1. works out which authentication header the API accepts
 *   2. hits every endpoint we know about, plus a few likely guesses
 *   3. prints the SHAPE of each response (keys, types, array lengths, sample values)
 *      and writes it to a markdown file
 *
 * Run this before writing any frontend code. Guessing a schema costs more than
 * sixty seconds.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = process.env.SIM_BASE_URL ?? 'https://sim.animahealth.com';
const KEY = process.env.SIM_API_KEY ?? '';
const outArg = process.argv.indexOf('--out');
const OUT = outArg > -1 ? process.argv[outArg + 1] : 'docs/API-NOTES.md';

if (!KEY) {
  console.error('Set SIM_API_KEY. e.g.  SIM_API_KEY=sim_xxx node probe.mjs');
  process.exit(1);
}

const AUTH_STYLES = [
  { name: 'Bearer',      headers: { Authorization: `Bearer ${KEY}` } },
  { name: 'X-API-Key',   headers: { 'X-API-Key': KEY } },
  { name: 'api-key',     headers: { 'api-key': KEY } },
  { name: 'Authorization-raw', headers: { Authorization: KEY } },
  { name: 'X-Api-Token', headers: { 'X-Api-Token': KEY } },
];

// Known from DATA.md, plus cheap guesses. Unknown paths just 404 and cost nothing.
const PATHS = [
  '/api/clock',
  '/api/sites/gp/patients',
  '/api/sites/hospital/patients',
  '/api/sites/hospital/attendances',
  '/api/nhs/pds',
  '/api/nhs/eps',
  '/api/openapi.json',
  '/openapi.json',
  '/api/docs',
  '/api/health',
  '/api/sites/gp/encounters',
  '/api/sites/gp/observations',
  '/api/sites/gp/conditions',
  '/api/sites/community/patients',
  '/api/staff',
  '/api/sites/gp/staff',
];

const TIMEOUT_MS = 12000;

async function get(path, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, {
      headers: { Accept: 'application/json', ...headers },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text: text.slice(0, 400), ct: res.headers.get('content-type') };
  } catch (e) {
    return { status: 0, error: e.name === 'AbortError' ? 'timeout' : String(e) };
  } finally {
    clearTimeout(t);
  }
}

/** Describe a value's shape without dumping the whole payload. */
function shape(v, depth = 0) {
  const pad = '  '.repeat(depth);
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'array (empty)';
    const inner = shape(v[0], depth + 1);
    return `array[${v.length}] of\n${pad}  ${inner}`;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    if (depth > 2) return `object { ${keys.slice(0, 12).join(', ')}${keys.length > 12 ? ', …' : ''} }`;
    return keys.slice(0, 40).map(k => {
      const val = v[k];
      let d;
      if (val === null) d = 'null';
      else if (Array.isArray(val)) d = val.length ? `array[${val.length}] of ${typeof val[0] === 'object' && val[0] !== null ? shape(val[0], depth + 2) : typeof val[0]}` : 'array (empty)';
      else if (typeof val === 'object') d = shape(val, depth + 1);
      else d = `${typeof val}  e.g. ${JSON.stringify(val).slice(0, 60)}`;
      return `${pad}  ${k}: ${d}`;
    }).join('\n');
  }
  return `${typeof v}  e.g. ${JSON.stringify(v).slice(0, 60)}`;
}

function firstRecord(json) {
  if (Array.isArray(json)) return json[0];
  if (!json || typeof json !== 'object') return null;
  for (const k of ['results', 'data', 'items', 'patients', 'entries', 'records']) {
    if (Array.isArray(json[k])) return json[k][0];
  }
  return null;
}

const lines = [];
const say = (s = '') => { console.log(s); lines.push(s); };

say(`# NHS-SIM API notes`);
say(`Probed ${new Date().toISOString()} against ${BASE}`);
say();

// --- 1. which auth style works ------------------------------------------------
say('## Authentication');
let auth = null;
for (const style of AUTH_STYLES) {
  const r = await get('/api/clock', style.headers);
  say(`- ${style.name}: ${r.status || r.error}`);
  if (r.status >= 200 && r.status < 300 && !auth) auth = style;
}
if (!auth) {
  say('');
  say('None of the tried header styles returned 2xx on /api/clock.');
  say('Open the site in a browser, log in, and copy the request headers from the');
  say('network tab, then add that style to AUTH_STYLES and re-run.');
  writeOut();
  process.exit(2);
}
say('');
say(`**Using: ${auth.name}**`);
say('');

// --- 2. endpoints -------------------------------------------------------------
say('## Endpoints');
say('');
const working = [];
for (const path of PATHS) {
  const r = await get(path, auth.headers);
  if (r.status >= 200 && r.status < 300 && r.json !== null) {
    working.push({ path, json: r.json });
    say(`### \`GET ${path}\`  →  ${r.status}`);
    say('');
    say('```');
    say(shape(r.json));
    say('```');
    const rec = firstRecord(r.json);
    if (rec) {
      say('');
      say('First record:');
      say('');
      say('```json');
      say(JSON.stringify(rec, null, 2).slice(0, 2500));
      say('```');
    }
    say('');
  } else {
    say(`\`GET ${path}\`  →  ${r.status || r.error}${r.status === 404 ? ' (not present)' : ''}`);
  }
}

// --- 3. what the frontend needs ----------------------------------------------
say('');
say('## Fields Cairn needs, and whether they are here');
say('');
const WANTED = [
  ['patient id', ['id', 'nhs_number', 'nhsNumber', 'patient_id']],
  ['age or date of birth', ['age', 'dob', 'date_of_birth', 'birthDate']],
  ['conditions or problem list', ['conditions', 'problems', 'diagnoses', 'problem_list']],
  ['admissions or attendances', ['admissions', 'attendances', 'episodes', 'encounters']],
  ['medications', ['medications', 'prescriptions', 'meds']],
  ['frailty', ['frailty', 'frailty_cfs', 'clinical_frailty_scale', 'efi']],
  ['deprivation', ['imd', 'imd_quintile', 'imd_decile', 'deprivation']],
  ['free text notes', ['notes', 'narrative', 'consultation', 'text', 'summary']],
  ['existing ACP or ReSPECT', ['acp', 'respect', 'dnacpr', 'adrt', 'ceilings']],
  ['palliative register', ['palliative', 'gsf', 'palliative_register']],
  ['care team or staff', ['team', 'staff', 'clinician', 'gp', 'practitioner', 'usual_gp']],
  ['contacts or next of kin', ['contacts', 'next_of_kin', 'nok', 'carer', 'relatives']],
];
const allKeys = new Set();
const collect = (o, d = 0) => {
  if (!o || typeof o !== 'object' || d > 4) return;
  if (Array.isArray(o)) return o.slice(0, 3).forEach(x => collect(x, d + 1));
  for (const [k, v] of Object.entries(o)) { allKeys.add(k.toLowerCase()); collect(v, d + 1); }
};
working.forEach(w => collect(w.json));
for (const [label, candidates] of WANTED) {
  const hit = candidates.filter(c => [...allKeys].some(k => k.includes(c.toLowerCase())));
  say(`- ${hit.length ? '**found**' : 'MISSING'}  ${label}${hit.length ? `  →  ${hit.join(', ')}` : ''}`);
}
say('');
say('Anything MISSING means the matching indicator cannot fire, or the feature needs a');
say('different source. Decide explicitly; do not invent the field.');
say('');
say('All keys seen, for reference:');
say('');
say('```');
say([...allKeys].sort().join(', '));
say('```');

writeOut();

function writeOut() {
  try {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, lines.join('\n'));
    console.log(`\nWritten to ${OUT}`);
  } catch (e) {
    console.error(`Could not write ${OUT}: ${e.message}`);
  }
}
