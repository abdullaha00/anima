import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { Check } from "typebox/value";
import { assertPatientId } from "../cairn/config";
import { writeJsonAtomic } from "../cairn/json-files";
import { hash } from "./input";
import { MortalityInputSchema, parseTime, threeMonthsAfter, type MortalityInput } from "./mortality-schema";

export function asObject(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
}
function ms(v: unknown): number | undefined {
  const t = typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : undefined;
}
const OUTCOME_FIELDS = new Set(["labels", "outcomes", "answerKey", "answer_key", "predictions", "prediction", "mortalityScore", "deathProbability3m", "deathDate", "deceasedDateTime", "dateOfDeath", "deceasedBoolean", "survivalLabel", "followUpEnd"]);
const DATE_FIELDS = ["createdAt", "updatedAt", "modifiedAt", "recordedAt", "collectedAt", "authoredOn", "effectiveDateTime", "issued", "date", "timestamp"];

function scopedId(r: Record<string, unknown>): string | undefined {
  if (typeof r.patientId === "string") return r.patientId;
  for (const key of ["subject", "patient"]) {
    const ref = asObject(r[key])?.reference;
    if (typeof ref === "string" && ref.startsWith("Patient/")) return ref.slice(8);
  }
  if (r.resourceType === "Patient" || typeof r.id === "string" && /^SIM-\d{6}$/.test(r.id)) return String(r.id);
  return undefined;
}

export interface FullRecordSource {
  patientId: string; indexTime: string; provenance: string;
  entries: { sourcePath: string; value: unknown }[];
  partial: boolean; failedSources: string[]; safetyGateReasons: string[];
}

export async function readFullSnapshot(file: string): Promise<FullRecordSource> {
  const v = asObject(JSON.parse(await readFile(file, "utf8")));
  if (!v || typeof v.patientId !== "string" || typeof v.indexTime !== "string" || typeof v.provenance !== "string" || !Array.isArray(v.records) || typeof v.collectionPartial !== "boolean") throw new Error("Invalid full-record snapshot");
  if (Object.keys(v).some(k => !["patientId", "indexTime", "provenance", "records", "collectionPartial", "patient"].includes(k))) throw new Error("Unexpected snapshot fields; keep outcome labels separate");
  const records = [...(v.patient ? [v.patient] : []), ...v.records];
  return { patientId: assertPatientId(v.patientId), indexTime: v.indexTime, provenance: v.provenance,
    entries: records.map(value => ({ value, sourcePath: path.resolve(file) })), partial: v.collectionPartial,
    failedSources: [], safetyGateReasons: [] };
}

export async function readFullCollection(runDirectory: string): Promise<FullRecordSource> {
  const root = await realpath(path.join(runDirectory, "record"));
  const manifest = asObject(JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")));
  const clock = asObject(JSON.parse(await readFile(path.join(root, "clock/simulation.json"), "utf8")));
  if (!manifest || typeof manifest.patientId !== "string" || !Array.isArray(manifest.sources) || ms(clock?.now) === undefined) throw new Error("Collector manifest/clock unavailable");
  const entries: FullRecordSource["entries"] = []; const failedSources: string[] = [];
  for (const raw of manifest.sources) {
    const s = asObject(raw);
    if (!s || typeof s.name !== "string" || typeof s.relativePath !== "string") throw new Error("Invalid collector source");
    if (s.status !== "ok") { failedSources.push(s.name); continue; }
    if (s.name === "clock" || s.name === "simulation-clock") continue;
    const file = await realpath(path.resolve(root, s.relativePath));
    if (!file.startsWith(root + path.sep) || !file.endsWith(".json")) throw new Error("Source must stay within record directory");
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    const visit = (node: unknown) => {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      const r = asObject(node); if (!r) return;
      if (scopedId(r) || typeof r.kind === "string" || typeof r.resourceType === "string" && r.resourceType !== "Bundle") {
        entries.push({ sourcePath: `record/${s.relativePath}`, value: r }); return;
      }
      for (const key of ["items", "resources", "documents", "entry", "resource"]) if (key in r) visit(r[key]);
    };
    visit(value);
  }
  const originalFailures = asObject(manifest.screeningCoverage)?.failedSources;
  if (Array.isArray(originalFailures)) for (const name of originalFailures) if (typeof name === "string" && !failedSources.includes(name)) failedSources.push(name);
  const gate = asObject(manifest.safetyGate);
  if (!gate || typeof gate.forceInsufficientEvidence !== "boolean" || !Array.isArray(gate.reasons)) throw new Error("Collector safety gate missing");
  return { patientId: assertPatientId(manifest.patientId), indexTime: new Date(ms(clock?.now)!).toISOString(),
    provenance: "Full eligible collected simulator snapshot; source availability remains explicit",
    entries, partial: failedSources.length > 0 || asObject(manifest.screeningCoverage)?.partial === true, failedSources,
    safetyGateReasons: gate.forceInsufficientEvidence ? gate.reasons.map(String).concat("Collector safety gate requires clarification") : [] };
}

export function prepareMortalityInput(source: FullRecordSource, screeningId: string): MortalityInput {
  const patientId = assertPatientId(source.patientId); const now = parseTime(source.indexTime);
  const excluded: Record<string, number> = {}; const count = (key: string) => { excluded[key] = (excluded[key] ?? 0) + 1; };
  let deceased = false; let deathUncertain = false;
  const groups = new Map<string, { rawHash: string; value: unknown; sourcePaths: string[] }>();
  const conflicts = new Set<string>();
  function clean(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(clean).filter(v => v !== undefined);
    const r = asObject(value); if (!r) return value;
    const owner = scopedId(r);
    if (owner && owner !== patientId) { count("other_patient"); return undefined; }
    for (const key of DATE_FIELDS) {
      if (r[key] === undefined) continue;
      const t = ms(r[key]);
      if (t === undefined) { count("unparseable_date"); return undefined; }
      if (t > now) { count("future_entry"); return undefined; }
    }
    const meta = asObject(r.meta);
    if (meta?.lastUpdated !== undefined && (ms(meta.lastUpdated) === undefined || ms(meta.lastUpdated)! > now)) { count("future_or_unknown_version"); return undefined; }
    const changes = asObject(r.provenance)?.changes;
    if (Array.isArray(changes) && changes.some(c => ms(asObject(c)?.time) === undefined || ms(asObject(c)?.time)! > now)) { count("future_or_unknown_version"); return undefined; }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (OUTCOME_FIELDS.has(k)) { count("outcome_field"); continue; }
      const filtered = clean(v); if (filtered !== undefined) out[k] = filtered;
    }
    return out;
  }
  for (const entry of source.entries) {
    const raw = asObject(entry.value);
    if (!raw || scopedId(raw) !== patientId) { count("unscoped_or_other_patient"); continue; }
    if (typeof raw.id !== "string" || !raw.id) { count("missing_id"); continue; }
    // Check explicit patient death evidence only if this record version existed at index time.
    const eligible = clean(raw);
    if (!eligible) continue;
    const deathFields = [raw.deceasedDateTime, raw.deathDate, raw.dateOfDeath];
    const d = asObject(raw.data);
    if (/^(death|death-record|death-event)$/.test(String(raw.kind))) deathFields.push(d?.deathDate, d?.dateOfDeath, d?.eventTime);
    for (const value of deathFields.filter(v => v !== undefined)) {
      const t = ms(value); if (t === undefined) deathUncertain = true; else if (t <= now) deceased = true;
    }
    if (raw.deceasedBoolean === true && !deathFields.some(v => ms(v) !== undefined && ms(v)! <= now)) deathUncertain = true;
    if (/^(death|death-record|death-event|mortality-label|model-prediction)$/.test(String(raw.kind))) { count("outcome_resource"); continue; }
    const key = `${raw.resourceType ?? raw.kind ?? "directory"}:${raw.id}`;
    const rawHash = hash(raw); const previous = groups.get(key);
    if (previous) {
      if (previous.rawHash !== rawHash) conflicts.add(key); else { previous.sourcePaths.push(entry.sourcePath); count("duplicate_copy"); }
    } else groups.set(key, { rawHash, value: eligible, sourcePaths: [entry.sourcePath] });
  }
  const records: MortalityInput["records"] = [];
  for (const [key, r] of groups) {
    if (conflicts.has(key)) { count("conflicting_copy"); continue; }
    records.push({ id: String(asObject(r.value)!.id), sourcePaths: [...new Set(r.sourcePaths)].sort(), value: r.value });
  }
  records.sort((a, b) => a.id.localeCompare(b.id) || hash(a.value).localeCompare(hash(b.value)));
  const safetyGateReasons = [...source.safetyGateReasons];
  if (!records.some(r => r.id === patientId)) safetyGateReasons.push("Patient directory/PDS identity absent");
  if (!records.some(r => r.id !== patientId)) safetyGateReasons.push("No patient clinical resources available");
  const input: MortalityInput = {
    schemaVersion: "mortality-input-v1", screeningId, patientId, indexTime: source.indexTime,
    horizonEnd: threeMonthsAfter(source.indexTime), snapshotHash: hash(records), provenance: source.provenance, records,
    coverage: { partial: source.partial || conflicts.size > 0 || !!excluded.unparseable_date || !!excluded.future_or_unknown_version,
      failedSources: source.failedSources, excluded, safetyGateReasons,
      limitations: ["Complete eligible collected snapshot, not guaranteed complete service coverage.", "Historical statement availability requires independent audit before training."] },
    eligibility: { status: deceased ? "ineligible" : deathUncertain ? "uncertain" : "eligible",
      reasons: deceased ? ["An explicit death event is recorded at or before screening"] : deathUncertain ? ["Recorded deceased status has no usable as-of event time"] : [] },
  };
  if (!Check(MortalityInputSchema, input)) throw new Error("Invalid mortality input schema");
  return input;
}

export async function writeEligibleRecord(directory: string, input: MortalityInput): Promise<void> {
  const values = input.records.map(r => r.value);
  const directoryEntries = values.filter(v => asObject(v)?.id === input.patientId);
  const now = new Date().toISOString();
  await writeJsonAtomic(path.join(directory, "record/eligible.json"), values);
  await writeJsonAtomic(path.join(directory, "record/clock/simulation.json"), { now: parseTime(input.indexTime) });
  await writeJsonAtomic(path.join(directory, "record/patient/directory.json"), { items: directoryEntries });
  await writeJsonAtomic(path.join(directory, "record/index/deduplicated-resources.json"), values);
  await writeJsonAtomic(path.join(directory, "record/index/provenance.json"), input.records.map(r => ({ id: r.id, sourcePaths: r.sourcePaths })));
  await writeJsonAtomic(path.join(directory, "record/manifest.json"), {
    schemaVersion: "1.0", patientId: input.patientId, collectedAt: now, simulatorOrigin: "frozen-screening-snapshot",
    sources: [{ name: "eligible", relativePath: "eligible.json", endpoint: "frozen-snapshot", status: "ok", attempts: 0, collectedAt: now }],
    coverage: { successful: 1, failed: input.coverage.failedSources.length, failedSources: input.coverage.failedSources },
    deduplication: { uniqueResourceCount: values.length, resourcesWithDuplicateVisibility: input.coverage.excluded.duplicate_copy ?? 0 },
    safetyGate: { forceInsufficientEvidence: input.eligibility.status !== "eligible" || !!input.coverage.safetyGateReasons.length,
      reasons: [...input.eligibility.reasons, ...input.coverage.safetyGateReasons] },
    screeningCoverage: input.coverage, snapshotHash: input.snapshotHash,
  });
}
