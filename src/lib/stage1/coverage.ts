import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "../cairn/json-files";
import { screeningDirectory, readScreeningInput } from "./mortality-store";
import type { MortalityInput } from "./mortality-schema";

/** Collection metadata is a sidecar; mortality input/output contracts remain unchanged. */
export interface ScreeningCoverage {
  version: "screening-coverage-v1";
  kind: "authored" | "cached" | "collected" | "live";
  snapshotHash: string;
  collectedAt?: string;
  sources: { name: string; status: string; attempts?: number }[];
}
export async function saveCoverage(input: MortalityInput, kind: ScreeningCoverage["kind"], runDirectory?: string) {
  const manifest = runDirectory ? JSON.parse(await readFile(path.join(runDirectory, "record/manifest.json"), "utf8")) : undefined;
  const coverage: ScreeningCoverage = { version: "screening-coverage-v1", kind, snapshotHash: input.snapshotHash,
    ...(manifest ? { collectedAt: manifest.completedAt ?? manifest.collectedAt ?? new Date().toISOString() } : {}),
    sources: (manifest?.sources ?? []).map((s: { name: string; status: string; attempts?: number }) => ({ name: s.name, status: s.status, ...(s.attempts ? { attempts: s.attempts } : {}) })) };
  await writeJsonAtomic(path.join(screeningDirectory(input.screeningId), "coverage.json"), coverage);
  return coverage;
}
export async function readCoverage(id: string, input?: MortalityInput): Promise<ScreeningCoverage> {
  input ??= await readScreeningInput(id);
  try {
    const c: ScreeningCoverage = JSON.parse(await readFile(path.join(screeningDirectory(id), "coverage.json"), "utf8"));
    if (c.version !== "screening-coverage-v1" || c.snapshotHash !== input.snapshotHash || !["authored", "cached", "collected", "live"].includes(c.kind) || !Array.isArray(c.sources)) throw new Error("Invalid coverage");
    return c;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return { version: "screening-coverage-v1", kind: /^authored/i.test(input.provenance) ? "authored" : "cached", snapshotHash: input.snapshotHash, sources: [] };
  }
}
export function coverageLabel(c: ScreeningCoverage) {
  if (c.kind === "authored") return "Authored fixture — service coverage not measured";
  if (c.kind === "cached") return "Cached snapshot — service coverage unverified";
  return `${c.kind === "live" ? "Fresh" : "Saved"} collection — ${c.sources.filter(s => s.status === "ok").length}/${c.sources.length} sources returned`;
}

export function contentCoverageNotes(coverage: MortalityInput["coverage"]) {
  const notes: string[] = [];
  const e = coverage.excluded;
  if (e.future_or_unknown_version) notes.push(`${e.future_or_unknown_version} record versions or nested entries were withheld because their availability at screening time could not be established.`);
  if (e.unparseable_date) notes.push(`${e.unparseable_date} entries had unusable dates and were withheld.`);
  if (e.conflicting_copy) notes.push(`${e.conflicting_copy} conflicting record copies were withheld.`);
  if (coverage.failedSources.length) notes.push(`${coverage.failedSources.length} collection sources failed or were incomplete.`);
  return notes;
}
