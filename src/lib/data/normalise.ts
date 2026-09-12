/**
 * THE ADAPTER: raw simulator payloads -> Patient (src/lib/domain/types.ts).
 *
 * Every fact the UI shows about a patient passes through this file, so the
 * meaning of each field is decided in one place. Nothing here invents data.
 * Fields the simulator does not carry (sex, deprivation, frailty, register,
 * ACP, next of kin) are left undefined or false and the meta notes say so.
 */

import type {
  Admission,
  Condition,
  LabResult,
  Narrative,
  Patient,
  TimelineEvent,
} from '@/lib/domain/types';

// ---------------------------------------------------------------------------
// Raw shapes, as the simulator returns them today
// ---------------------------------------------------------------------------

/** One row of GET /api/sites/{site}/patients */
export interface RawDirectoryRow {
  id: string;
  name?: unknown;
  birthDate?: unknown;
  conditions?: unknown;
  goals?: unknown;
  needs?: unknown;
  localIds?: unknown;
  synthetic?: unknown;
}

/** One entry of a site view's `resources` array, or of the dedicated lists. */
export interface RawResource {
  id: string;
  patientId?: string;
  kind: string;
  title?: string;
  status?: string;
  owner?: string;
  priority?: string;
  createdAt?: number;
  dueAt?: number;
  data?: unknown;
  version?: number;
}

type Rec = Record<string, unknown>;

/** Narrowing helpers. JSON from the network is unknown until proven otherwise. */
export function asRecord(value: unknown): Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Rec) : {};
}
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}
export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function asStringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

/** True when an unknown value has the shape of a directory row. */
export function isRawDirectoryRow(value: unknown): value is RawDirectoryRow {
  return typeof asString(asRecord(value).id) === 'string';
}

/** True when an unknown value has the shape of a simulator resource. */
export function isRawResource(value: unknown): value is RawResource {
  const rec = asRecord(value);
  return typeof asString(rec.id) === 'string' && typeof asString(rec.kind) === 'string';
}

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

/** Epoch milliseconds to ISO, with a fallback when the value is missing. */
function msToIso(ms: number | undefined, fallbackIso: string): string {
  if (ms === undefined) return fallbackIso;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? fallbackIso : date.toISOString();
}

/** Age in whole years at the simulation clock. Undefined when either date is unusable. */
export function deriveAge(birthDate: string | undefined, nowIso: string): number | undefined {
  if (!birthDate) return undefined;
  const born = new Date(birthDate);
  const now = new Date(nowIso);
  if (Number.isNaN(born.getTime()) || Number.isNaN(now.getTime())) return undefined;

  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const birthdayNotYetReached =
    now.getUTCMonth() < born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (birthdayNotYetReached) age -= 1;
  return age >= 0 ? age : undefined;
}

/**
 * Problem-list entries that describe practice administration rather than a
 * condition. They stay in conditionDetail but are kept out of `conditions`.
 */
const ADMINISTRATIVE_TERMS = new Set(
  [
    'Medication review',
    'Preventive health review',
    'Follow-up after hospital contact',
    'Sleep concern',
    'Musculoskeletal symptoms',
  ].map((term) => term.toLowerCase()),
);

function isAdministrativeTerm(term: string): boolean {
  return ADMINISTRATIVE_TERMS.has(term.trim().toLowerCase());
}

/** De-duplicate terms case-insensitively, keeping the first spelling seen. */
function dedupeTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of terms) {
    const key = term.trim().toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(term.trim());
  }
  return out;
}

/** The simulator's placeholder consultation text. Kept on the timeline, not in narratives. */
const GENERIC_CONSULTATION_TEXT =
  'Fictional consultation. The patient discussed their next appointment and contact preferences.';

/** Analytes kept in the snapshot. The others exist but are not needed by any indicator. */
const KEPT_ANALYTES = new Set(['egfr', 'creatinine', 'albumin', 'haemoglobin', 'crp', 'potassium', 'sodium']);

/** Wording that marks a discharge summary as an unplanned episode. */
const UNPLANNED_PATTERN = /admission|admitted|emergency|unplanned|acute/i;
const PLANNED_PATTERN = /planned|elective|clinic review|assessment episode/i;

const CARE_HOME_PATTERN = /care home|nursing home/i;

/** The practice named on the simulator's GP site. */
const GP_PRACTICE_NAME = 'Riverside Practice';

// ---------------------------------------------------------------------------
// Directory row -> Patient (recordDepth 'directory')
// ---------------------------------------------------------------------------

export function normaliseDirectoryPatient(row: RawDirectoryRow, simulationNowIso: string): Patient {
  const directoryConditions = dedupeTerms(asStringArray(row.conditions));
  const goals = asStringArray(row.goals);
  const needs = asStringArray(row.needs);
  const birthDate = asString(row.birthDate);
  const careHomeMentioned = [...directoryConditions, ...goals, ...needs].some((text) => CARE_HOME_PATTERN.test(text));

  return {
    id: row.id,
    name: asString(row.name),
    birthDate,
    age: deriveAge(birthDate, simulationNowIso),
    conditions: directoryConditions.filter((term) => !isAdministrativeTerm(term)),
    conditionDetail: directoryConditions.map((term) => ({ term, source: 'directory' })),
    admissions: [],
    labs: [],
    goals,
    needs,
    timeline: [],
    // Only set when the record says so. Absence of a mention is not evidence either way.
    careHomeResident: careHomeMentioned ? true : undefined,
    onPalliativeRegister: false,
    hasAcpRecord: false,
    recordDepth: 'directory',
  };
}

// ---------------------------------------------------------------------------
// Site view resources -> the full Patient (recordDepth 'full')
// ---------------------------------------------------------------------------

/** Mutable working state while one patient's resources are folded in. */
interface Accumulator {
  nowIso: string;
  problems: Condition[];
  activeProblemTerms: string[];
  labs: LabResult[];
  timeline: TimelineEvent[];
  narratives: Narrative[];
  admissions: Admission[];
  medications: string[];
  medicationCount?: number;
  usualGp?: string;
}

function dedupeById(resources: RawResource[]): RawResource[] {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    if (seen.has(resource.id)) return false;
    seen.add(resource.id);
    return true;
  });
}

/** The service holding a resource, from its owner. Beds belong to the hospital. */
function serviceOf(resource: RawResource): string | undefined {
  const owner = asString(resource.owner);
  if (owner === 'beds') return 'hospital';
  return owner;
}

function pushEvent(
  acc: Accumulator,
  resource: RawResource,
  kind: TimelineEvent['kind'],
  atIso: string,
  title: string,
  detail?: string,
): void {
  acc.timeline.push({
    at: atIso,
    kind,
    title,
    detail,
    service: serviceOf(resource),
    sourceId: resource.id,
  });
}

function createdAtIso(resource: RawResource, acc: Accumulator): string {
  return msToIso(asNumber(resource.createdAt), acc.nowIso);
}

function addUnique(list: string[], value: string): void {
  const key = value.trim().toLowerCase();
  if (!list.some((existing) => existing.trim().toLowerCase() === key)) list.push(value.trim());
}

/** ehr-record: problem list, medicines list, allergies. */
function applyEhrRecord(acc: Accumulator, resource: RawResource): void {
  const data = asRecord(resource.data);

  for (const raw of asArray(data.problems)) {
    const problem = asRecord(raw);
    const term = asString(problem.term);
    if (!term) continue;
    const rawStatus = asString(problem.status);
    const status = rawStatus === 'active' || rawStatus === 'resolved' ? rawStatus : undefined;
    acc.problems.push({
      term,
      source: 'problem list',
      status,
      recordedAt: asString(problem.date),
      code: asString(problem.code),
    });
    if (status === 'active') acc.activeProblemTerms.push(term);
  }

  // A medicines list that exists but is empty is a real count of zero.
  const medicines = asArray(data.medications);
  acc.medicationCount = medicines.length;
  for (const raw of medicines) {
    const medicine = asRecord(raw);
    const name = asString(medicine.drug) ?? asString(medicine.name) ?? asString(medicine.note);
    if (name) addUnique(acc.medications, name);
  }
}

/** report with data.kind 'blood-result': one LabResult per kept analyte, one timeline event per report. */
function applyBloodResult(acc: Accumulator, resource: RawResource): void {
  const data = asRecord(resource.data);
  const panel = asRecord(data.panel);
  const atIso = msToIso(asNumber(data.collectedAt), createdAtIso(resource, acc));
  const kept: LabResult[] = [];

  for (const raw of asArray(data.analytes)) {
    const analyte = asRecord(raw);
    const id = asString(analyte.id);
    const value = asNumber(analyte.value);
    if (!id || value === undefined || !KEPT_ANALYTES.has(id)) continue;
    kept.push({
      at: atIso,
      analyte: id,
      name: asString(analyte.name) ?? id,
      value,
      unit: asString(analyte.unit) ?? '',
      referenceLow: asNumber(analyte.referenceLow),
      referenceHigh: asNumber(analyte.referenceHigh),
      sourceId: resource.id,
    });
  }

  // eGFR first, because it is the value a reviewer looks for on a U&E.
  kept.sort((a, b) => (a.analyte === 'egfr' ? -1 : b.analyte === 'egfr' ? 1 : 0));
  acc.labs.push(...kept);

  const detail =
    kept.length > 0 ? kept.map((lab) => `${lab.name} ${lab.value} ${lab.unit}`.trim()).join(', ') : undefined;
  const title = asString(panel.name) ?? asString(resource.title) ?? 'Blood result';
  pushEvent(acc, resource, 'blood result', atIso, title, detail);
}

/** encounter: a consultation narrative and a timeline entry. */
function applyEncounter(acc: Accumulator, resource: RawResource): void {
  const data = asRecord(resource.data);
  const text = asString(data.text);
  const atIso = createdAtIso(resource, acc);
  const title = asString(data.reason) ?? asString(resource.title) ?? 'Consultation';

  pushEvent(acc, resource, 'consultation', atIso, title, text);
  if (text && text.trim() !== GENERIC_CONSULTATION_TEXT) {
    acc.narratives.push({ at: atIso, kind: 'consultation', text, title, sourceId: resource.id });
  }
}

/** Unplanned only when the wording says so and nothing says it was planned. */
function isUnplannedEpisode(text: string): boolean {
  return UNPLANNED_PATTERN.test(text) && !PLANNED_PATTERN.test(text);
}

/** discharge-summary: an admission, a discharge narrative and a timeline entry. */
function applyDischargeSummary(acc: Accumulator, resource: RawResource): void {
  const data = asRecord(resource.data);
  const sections = asRecord(data.sections);
  const reason = asString(sections.reason);
  const course = asString(sections.course);
  const atIso = msToIso(asNumber(data.sentAt), createdAtIso(resource, acc));
  const title = asString(resource.title) ?? 'Discharge summary';
  const text = [reason, course].filter((part): part is string => Boolean(part)).join(' ');

  acc.admissions.push({
    at: atIso,
    emergency: isUnplannedEpisode(text),
    kind: 'discharge summary',
    summary: reason,
    sourceId: resource.id,
  });
  pushEvent(acc, resource, 'discharge summary', atIso, title, reason);
  if (text) acc.narratives.push({ at: atIso, kind: 'discharge', text, title, sourceId: resource.id });
}

/** hospital-attendance: an unplanned attendance, with its presenting complaint. */
function applyAttendance(acc: Accumulator, resource: RawResource): void {
  const data = asRecord(resource.data);
  const atIso = msToIso(asNumber(data.arrivalAt), createdAtIso(resource, acc));
  const complaint = asString(data.presentingComplaint) ?? asString(resource.title);
  const acuity = asString(data.acuity);
  const detail = [complaint, acuity ? `acuity ${acuity}` : undefined, asString(data.location)]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  acc.admissions.push({
    at: atIso,
    emergency: true,
    kind: 'hospital attendance',
    summary: complaint,
    sourceId: resource.id,
  });
  pushEvent(acc, resource, 'attendance', atIso, asString(resource.title) ?? 'Hospital attendance', detail);
}

function applyTask(acc: Accumulator, resource: RawResource): void {
  const due = asNumber(resource.dueAt);
  const detail = [asString(resource.status), due !== undefined ? `due ${msToIso(due, acc.nowIso).slice(0, 10)}` : undefined]
    .filter((part): part is string => Boolean(part))
    .join(', ');
  pushEvent(acc, resource, 'task', createdAtIso(resource, acc), asString(resource.title) ?? 'Task', detail);
}

function applyAppointment(acc: Accumulator, resource: RawResource): void {
  const data = asRecord(resource.data);
  const clinician = asString(data.clinician);
  const fallbackIso = msToIso(asNumber(resource.dueAt), createdAtIso(resource, acc));
  const startsIso = msToIso(asNumber(data.startsAt), fallbackIso);
  if (clinician && asString(resource.owner) === 'gp') acc.usualGp = clinician;
  pushEvent(acc, resource, 'appointment', startsIso, asString(resource.title) ?? 'Appointment', clinician);
}

function applyMessage(acc: Accumulator, resource: RawResource): void {
  const data = asRecord(resource.data);
  pushEvent(acc, resource, 'message', createdAtIso(resource, acc), asString(resource.title) ?? 'Message', asString(data.channel));
}

/** observation: skip the contact-preference marker; keep anything with narrative text. */
function applyObservation(acc: Accumulator, resource: RawResource): void {
  const title = asString(resource.title) ?? 'Observation';
  if (title === 'Contact preference recorded') return;
  const data = asRecord(resource.data);
  const text = asString(data.text);
  const atIso = createdAtIso(resource, acc);
  pushEvent(acc, resource, 'other', atIso, title, text);
  if (text) acc.narratives.push({ at: atIso, kind: 'other', text, title, sourceId: resource.id });
}

/** document: a hospital free-text note. */
function applyDocument(acc: Accumulator, resource: RawResource): void {
  const data = asRecord(resource.data);
  const text = asString(data.text);
  const atIso = createdAtIso(resource, acc);
  const title = asString(resource.title) ?? 'Document';
  pushEvent(acc, resource, 'other', atIso, title, text);
  if (text) acc.narratives.push({ at: atIso, kind: 'other', text, title, sourceId: resource.id });
}

function applyPrescription(acc: Accumulator, resource: RawResource): void {
  const data = asRecord(resource.data);
  const drug = asString(data.drug);
  if (drug) addUnique(acc.medications, drug);
  pushEvent(acc, resource, 'prescription', createdAtIso(resource, acc), asString(resource.title) ?? 'Prescription', drug);
}

function applyBed(acc: Accumulator, resource: RawResource): void {
  const data = asRecord(resource.data);
  const detail = [asString(data.ward), asString(data.barrier)].filter((part): part is string => Boolean(part)).join(', ');
  const title = `Occupied bed: ${detail || asString(resource.title) || 'unknown ward'}`;
  pushEvent(acc, resource, 'other', createdAtIso(resource, acc), title);
}

/** Route one resource to its handler. Unknown kinds are ignored on purpose. */
function applyResource(acc: Accumulator, resource: RawResource): void {
  switch (resource.kind) {
    case 'ehr-record':
      return applyEhrRecord(acc, resource);
    case 'report':
      if (asString(asRecord(resource.data).kind) === 'blood-result') applyBloodResult(acc, resource);
      return;
    case 'encounter':
      return applyEncounter(acc, resource);
    case 'discharge-summary':
      return applyDischargeSummary(acc, resource);
    case 'hospital-attendance':
      return applyAttendance(acc, resource);
    case 'task':
      return applyTask(acc, resource);
    case 'appointment':
      return applyAppointment(acc, resource);
    case 'message':
      return applyMessage(acc, resource);
    case 'observation':
      return applyObservation(acc, resource);
    case 'document':
      return applyDocument(acc, resource);
    case 'prescription':
      return applyPrescription(acc, resource);
    case 'bed':
      return applyBed(acc, resource);
    default:
      // conversation, capacity, staff, appointment-session, message-template: not patient evidence.
      return;
  }
}

const newestFirst = (a: { at: string }, b: { at: string }): number => b.at.localeCompare(a.at);
const oldestFirst = (a: { at: string }, b: { at: string }): number => a.at.localeCompare(b.at);

/** Keep one entry per source resource, so re-enrichment never doubles anything. */
function dedupeBySource<T extends { sourceId?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.sourceId) return true;
    if (seen.has(item.sourceId)) return false;
    seen.add(item.sourceId);
    return true;
  });
}

/**
 * Fold a patient's GP view and hospital resources into the directory Patient.
 *
 * Resources are filtered to this patient's exact id and de-duplicated by
 * resource id, because the GP and hospital views overlap. recordDepth becomes
 * 'full' when the GP view was present; hospital-only enrichment keeps the
 * existing depth so fullRecordCount stays honest.
 */
export function enrichWithView(
  patient: Patient,
  gpViewResources: RawResource[],
  hospitalResources: RawResource[],
  simulationNowIso: string,
): Patient {
  const own = dedupeById(
    [...gpViewResources, ...hospitalResources].filter((resource) => resource.patientId === patient.id),
  );
  const gpViewPresent = gpViewResources.some((resource) => resource.patientId === patient.id);

  const acc: Accumulator = {
    nowIso: simulationNowIso,
    problems: [],
    activeProblemTerms: [],
    labs: [],
    timeline: [...patient.timeline],
    narratives: [...(patient.narratives ?? [])],
    admissions: [...patient.admissions],
    medications: [...(patient.medications ?? [])],
    medicationCount: patient.medicationCount,
    usualGp: patient.usualGp,
  };
  for (const resource of own) applyResource(acc, resource);

  const directoryDetail = patient.conditionDetail.filter((condition) => condition.source === 'directory');
  const directoryTerms = directoryDetail.map((condition) => condition.term);
  const conditions = dedupeTerms([...directoryTerms, ...acc.activeProblemTerms]).filter(
    (term) => !isAdministrativeTerm(term),
  );

  return {
    ...patient,
    conditions,
    conditionDetail: [...directoryDetail, ...acc.problems],
    admissions: dedupeBySource(acc.admissions).sort(newestFirst),
    labs: acc.labs.sort(oldestFirst),
    medicationCount: acc.medicationCount,
    medications: acc.medications.length > 0 ? acc.medications : undefined,
    timeline: dedupeBySource(acc.timeline).sort(newestFirst),
    narratives: acc.narratives.length > 0 ? dedupeBySource(acc.narratives).sort(newestFirst) : undefined,
    usualGp: acc.usualGp,
    practice: gpViewPresent ? GP_PRACTICE_NAME : patient.practice,
    recordDepth: gpViewPresent ? 'full' : patient.recordDepth,
  };
}

/** Add a medicine named outside the site views (for example from the EPS bundle). */
export function withMedication(patient: Patient, drug: string): Patient {
  const medications = [...(patient.medications ?? [])];
  addUnique(medications, drug);
  return { ...patient, medications };
}
