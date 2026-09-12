#!/usr/bin/env node
/**
 * Language guard. The interface copy is part of the clinical safety argument, so this
 * scans the source and the built output for phrases that would turn an indicator prompt
 * into a claim about a person, or a coordination thread into a consumer messenger.
 *
 *   node scripts/check-language.mjs            # exits 1 on any match
 *
 * Scope: frontend source, README.md, and if a build exists, the rendered app pages and
 * our own app chunks under .next. Research, extractor contracts and agent prompts are
 * not interface copy; third-party bundles are not scanned.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();

// Phrases that are always allowed. They are removed from the text before scanning, so the
// mandated quiet line ("not a prediction about this patient") and the names of published
// tools do not trip the guard. Keep this list short and explain each entry.
const ALLOWED_PHRASES = [
  /not a prediction about/gi, // the quiet line the brief requires
  /makes no prediction/gi, // the CONTEXT phrasing
  /never predicts/gi, // the safety rule stated in the negative
  /no prediction/gi,
  /prognostic indicator guidance/gi, // the GSF tool's proper name
  /predictive validity/gi, // the equity note disclaims it
  /no claim of predictive/gi,
  /not validated/gi,
  /patient-messaging/gi, // simulator resource identifier, not interface copy
  /messaging-workspace/gi, // simulator API path, not interface copy
];

// Screening now explicitly presents unvalidated estimates. Do not ban model terminology
// or percentages generally; retain deterministic prognosis and autonomous-action bans.
// Word boundaries avoid incidental matches.
const BANNED = [
  { re: /\bdying\b/gi, why: 'never describe a person as dying' },
  { re: /\bwill die\b|\bgoing to die\b|\bexpected to die\b/gi, why: 'prognosis claim' },
  { re: /\bterminal(ly)?\b/gi, why: 'banned word' },
  { re: /\blikelihood of dying\b|\bmonths to live\b/gi, why: 'prognosis claim' },
  { re: /\bthe algorithm decided\b/gi, why: 'banned phrase' },
  { re: /\bchats?\b/gi, why: 'say coordination thread' },
  { re: /\bmessaging\b|\bmessage app\b|\bmessenger\b/gi, why: 'say coordination thread' },
  { re: /\binbox\b/gi, why: 'say coordination thread' },
  { re: /\bping(s|ed)?\b/gi, why: 'banned word' },
  { re: /\bnotifications?\b/gi, why: 'no notifications' },
  { re: /\bautomatically generates? a respect\b/gi, why: 'ReSPECT is clinician-completed' },
];

const SOURCE_EXT = new Set(['.ts', '.tsx', '.css', '.md', '.mjs', '.json']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.cairn', 'reference', 'data', 'docs']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

function* walkAll(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walkAll(p);
    else yield p;
  }
}

function scanText(text, file, findings) {
  let cleaned = text;
  for (const allowed of ALLOWED_PHRASES) cleaned = cleaned.replace(allowed, ' ');
  const lines = cleaned.split('\n');
  lines.forEach((line, i) => {
    for (const { re, why } of BANNED) {
      re.lastIndex = 0;
      const m = re.exec(line);
      if (m) findings.push({ file, line: i + 1, phrase: m[0], why });
    }
  });
}

const findings = [];
let scanned = 0;

// 1. Frontend source and README. Do not scan local research, test fixtures, instructions
// or model prompts. The two worker libraries are server-side data/agent contracts.
for (const file of [...walk(join(ROOT, 'src')), join(ROOT, 'README.md')]) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (!SOURCE_EXT.has(extname(file))) continue;
  if (rel.startsWith('src/lib/stage1/') || rel.startsWith('src/lib/cairn/')) continue;
  scanned += 1;
  scanText(readFileSync(file, 'utf8'), rel, findings);
}

// 2. Built output, when present: rendered pages and our own app chunks.
const builtDirs = [join(ROOT, '.next', 'server', 'app'), join(ROOT, '.next', 'static', 'chunks', 'app')];
let builtScanned = 0;
for (const dir of builtDirs) {
  for (const file of walkAll(dir)) {
    const ext = extname(file);
    if (!['.html', '.rsc', '.js', '.txt'].includes(ext)) continue;
    // Server JS also bundles backend adapter paths and field names. Check rendered
    // server output and browser JS; source scanning above still checks page copy.
    if (dir.includes(join('server', 'app')) && ext === '.js') continue;
    builtScanned += 1;
    scanText(readFileSync(file, 'utf8'), relative(ROOT, file).replace(/\\/g, '/'), findings);
  }
}

if (findings.length) {
  console.error(`Language guard: ${findings.length} match(es) in ${scanned} source files and ${builtScanned} built files.\n`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}  "${f.phrase}"  (${f.why})`);
  console.error('\nRewrite the copy. See docs/CONTEXT.md "Language rules".');
  process.exit(1);
}

console.log(
  `Language guard: clean. ${scanned} source files${builtScanned ? ` and ${builtScanned} built files` : ' (no build output found)'} scanned.`,
);
