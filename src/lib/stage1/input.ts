import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { assertPatientId } from "../cairn/config";
import type { ExtractionConfig, ExtractionInput, NarrativeSource } from "./schema";

export function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function timestamp(value: unknown): number | undefined {
  const ms = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? ms : undefined;
}

const KINDS = new Set(["encounter", "consultation", "hospital-note", "discharge-summary", "ehr-record", "message", "conversation", "referral", "hospital-attendance"]);
const TEXT_KEYS = new Set(["text", "body", "context", "history", "plan", "course", "followUp", "gpActions", "reason", "summary", "presentingComplaint", "assessment", "clinicalSummary"]);
const CONTAINERS = new Set(["sections", "entries", "notes", "addenda", "history", "consultations", "narrative"]);
const BLOCKED = new Set(["labels", "outcomes", "answerKey", "prognosis", "mortality", "deathDate", "deceasedDateTime"]);

export interface SnapshotRecords {
  patientId: string;
  indexTime: string;
  provenance: string;
  records: { resource: unknown; sourcePath: string }[];
  collectionPartial: boolean;
  failedSources: string[];
  safetyGateReasons: string[];
}

/** Accept an explicit input snapshot; never recursively ingest labels or training files. */
export async function readInputSnapshot(file: string): Promise<SnapshotRecords> {
  const raw = object(JSON.parse(await readFile(file, "utf8")));
  if (!raw || typeof raw.patientId !== "string" || typeof raw.indexTime !== "string" ||
      typeof raw.provenance !== "string" || !raw.provenance.trim() || !Array.isArray(raw.records) ||
      typeof raw.collectionPartial !== "boolean") throw new Error("Invalid snapshot: require patientId, indexTime, provenance, records and collectionPartial");
  if (Object.keys(raw).some(key => !["patientId", "indexTime", "provenance", "records", "collectionPartial"].includes(key))) throw new Error("Unexpected snapshot field; outcome labels must be stored separately");
  return { patientId: assertPatientId(raw.patientId), indexTime: raw.indexTime, provenance: raw.provenance,
    records: raw.records.map(resource => ({ resource, sourcePath: path.resolve(file) })),
    collectionPartial: raw.collectionPartial, failedSources: [], safetyGateReasons: [] };
}

/** Read the collector's source files, not its first-copy-wins index, to detect conflicts. */
export async function readCollectedSnapshot(runDirectory: string): Promise<SnapshotRecords> {
  const root = await realpath(path.join(runDirectory, "record"));
  const manifest = object(JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")));
  if (!manifest || typeof manifest.patientId !== "string" || !Array.isArray(manifest.sources)) throw new Error("Invalid collector manifest");
  const patientId = assertPatientId(manifest.patientId);
  const clock = object(JSON.parse(await readFile(path.join(root, "clock/simulation.json"), "utf8")));
  const now = timestamp(clock?.now);
  if (now === undefined) throw new Error("A valid simulation clock is required");
  const records: SnapshotRecords["records"] = [];
  const failedSources: string[] = [];
  for (const raw of manifest.sources) {
    const source = object(raw);
    if (!source || typeof source.name !== "string" || typeof source.relativePath !== "string") throw new Error("Invalid manifest source");
    if (source.status !== "ok") { failedSources.push(source.name); continue; }
    if (!source.relativePath.endsWith(".json")) throw new Error("Collector sources must be JSON");
    const candidate = await realpath(path.resolve(root, source.relativePath));
    if (!candidate.startsWith(root + path.sep)) throw new Error("Collector source escapes record directory");
    const data: unknown = JSON.parse(await readFile(candidate, "utf8"));
    function visit(value: unknown) {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const item = object(value);
      if (!item) return;
      if (typeof item.id === "string" && (typeof item.kind === "string" || typeof item.resourceType === "string")) {
        records.push({ resource: item, sourcePath: `record/${source!.relativePath}` }); return;
      }
      // Collector wrapper fields only; no arbitrary nested clinical/outcome containers.
      for (const key of ["resources", "items", "entry", "resource"]) if (key in item) visit(item[key]);
    }
    visit(data);
  }
  const gate = object(manifest.safetyGate);
  if (!gate || typeof gate.forceInsufficientEvidence !== "boolean" || !Array.isArray(gate.reasons) || !gate.reasons.every(r => typeof r === "string")) throw new Error("Invalid collection safety gate");
  return { patientId, indexTime: new Date(now).toISOString(), provenance: "simulator-collector-snapshot",
    records, collectionPartial: failedSources.length > 0, failedSources,
    safetyGateReasons: gate.forceInsufficientEvidence ? (gate.reasons.length ? gate.reasons as string[] : ["Collector safety gate blocked extraction"]) : [] };
}

export function prepareInput(snapshot: SnapshotRecords, config: ExtractionConfig): ExtractionInput {
  const patientId = assertPatientId(snapshot.patientId);
  const parsedNow = timestamp(snapshot.indexTime);
  if (parsedNow === undefined) throw new Error("Invalid snapshot indexTime");
  const now: number = parsedNow;
  const since = now - config.lookbackDays * 86400000;
  const excluded: Record<string, number> = {};
  const count = (reason: string) => { excluded[reason] = (excluded[reason] ?? 0) + 1; };
  const byId = new Map<string, { record: Record<string, unknown>; sourcePath: string; signature: string }>();
  const conflicts = new Set<string>();
  for (const { resource, sourcePath } of snapshot.records) {
    const r = object(resource);
    if (!r || r.patientId !== patientId) { count("unscoped_or_other_patient"); continue; }
    if (typeof r.id !== "string" || !r.id || !object(r.data)) { count("malformed_resource"); continue; }
    if (typeof r.kind !== "string" || !KINDS.has(r.kind)) { count("unsupported_kind"); continue; }
    const at = timestamp(r.createdAt);
    if (at === undefined) { count("undated_resource"); continue; }
    const availableDates = [r.createdAt, r.updatedAt, r.modifiedAt].filter(v => v !== undefined);
    if (availableDates.some(v => timestamp(v) === undefined)) { count("invalid_availability_date"); continue; }
    if (availableDates.some(v => timestamp(v)! > now)) { count("future_resource"); continue; }
    const changes = object(r.provenance)?.changes;
    if (Array.isArray(changes) && changes.some(c => {
      const change = object(c); return change && (timestamp(change.time) === undefined || timestamp(change.time)! > now);
    })) { count("unavailable_resource_version"); continue; }
    if (at < since) { count("outside_lookback"); continue; }
    const signature = hash(r);
    const previous = byId.get(r.id);
    if (previous) {
      if (previous.signature !== signature) conflicts.add(r.id);
      else count("duplicate_copy");
    } else byId.set(r.id, { record: r, sourcePath, signature });
  }
  const candidates: NarrativeSource[] = [];
  for (const [id, entry] of byId) {
    if (conflicts.has(id)) { count("conflicting_resource"); continue; }
    const r = entry.record;
    const baseTime = timestamp(r.createdAt)!;
    function walk(value: unknown, fieldPath: string, section = false, inheritedTime = baseTime) {
      if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${fieldPath}[${i}]`, section, inheritedTime)); return; }
      const item = object(value);
      if (!item) return;
      if (item.patientId !== undefined && item.patientId !== patientId) { count("nested_other_patient"); return; }
      let at = inheritedTime;
      for (const key of ["createdAt", "updatedAt", "modifiedAt", "date", "at", "timestamp"]) {
        if (item[key] === undefined) continue;
        const time = timestamp(item[key]);
        if (time === undefined || time > now) { count("nested_unavailable_date"); return; }
        if (["date", "at", "timestamp", "createdAt"].includes(key)) at = time;
      }
      if (at < since) { count("nested_outside_lookback"); return; }
      for (const [key, child] of Object.entries(item)) {
        if (BLOCKED.has(key)) continue;
        const childPath = `${fieldPath}.${key}`;
        if (typeof child === "string" && child.trim() && (TEXT_KEYS.has(key) || section && !["id", "heading", "title", "status", "author", "patientId", "date", "at", "timestamp", "createdAt", "updatedAt", "modifiedAt"].includes(key))) {
          candidates.push({ id: hash([id, childPath, child]).slice(0, 24), recordId: id,
            version: typeof r.version === "string" || typeof r.version === "number" ? r.version : null,
            sourcePath: entry.sourcePath, fieldPath: childPath, recordedAt: new Date(at).toISOString(),
            kind: String(r.kind), recordStatus: typeof r.status === "string" ? r.status : null, text: child });
        } else if (CONTAINERS.has(key) || TEXT_KEYS.has(key)) walk(child, childPath, key === "sections", at);
      }
    }
    walk(r.data, "data");
  }
  candidates.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || a.id.localeCompare(b.id));
  const sources: NarrativeSource[] = [];
  let chars = 0;
  for (const candidate of candidates) {
    const size = JSON.stringify(candidate).length;
    if (sources.length >= config.maxSources || chars + size > config.maxInputChars) { count("input_limit"); continue; }
    sources.push(candidate); chars += size;
  }
  return { schemaVersion: "stage1-input-v1", patientId, indexTime: new Date(now).toISOString(), provenance: snapshot.provenance,
    sources: snapshot.safetyGateReasons.length ? [] : sources,
    coverage: { collectionPartial: snapshot.collectionPartial, failedSources: snapshot.failedSources,
      safetyGateReasons: snapshot.safetyGateReasons, excluded,
      limitations: ["Narrative workspace fields only; FHIR-only and structured-only findings are not extracted.",
        "Snapshot dates and version checks do not prove historical availability of every statement; outcome datasets require a separate availability audit.",
        "Not documented refers only to selected passages within the configured window."] } };
}
