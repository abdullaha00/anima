#!/usr/bin/env node
/**
 * Run Stage 1 mortality screening over the enriched synthetic cohort (one NDJSON row per patient,
 * the record as it stood at that patient's horizon cutoff) and hand above-threshold patients to
 * the existing Stage 2 queue through the same code path as scripts/stage1-screen.ts.
 *
 *   npx tsx scripts/screen-cohort.ts [--input data/mortality-cohort-enriched/asof-30d.ndjson] [--horizon 30]
 *     [--patients SIM-000011,SIM-000012] [--limit N] [--threshold 0.2] [--resume] [--scoring-only]
 *
 * Each row is converted into a full-record snapshot the screener accepts and frozen under
 * .cairn/cohort-inputs/<horizon>d/<patientId>.json. The cohort deliberately strips resource IDs and
 * resource-level patient IDs, so this script re-attaches the row's patientId and a deterministic
 * content-hash ID to every resource; it never reads the labels or raw-records files. One JSON line
 * is logged per patient (also appended to .cairn/cohort-inputs/<horizon>d/_screen-log.ndjson).
 */
import "../src/lib/cairn/load-env";
import { parseArgs } from "node:util";
import path from "node:path";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { CAIRN_ROOT, assertPatientId } from "../src/lib/cairn/config";
import { writeJsonAtomic } from "../src/lib/cairn/json-files";
import { readFullSnapshot, prepareMortalityInput } from "../src/lib/stage1/mortality-input";
import { loadMortalityConfig, makeLlmMortalityEngine, runMortalityEngine, MORTALITY_INVARIANTS, type MortalityConfig } from "../src/lib/stage1/mortality-engine";
import { SCREENINGS_ROOT, createScreening, saveScreeningResult, readScreeningResult, linkScreening, screeningDirectory } from "../src/lib/stage1/mortality-store";
import { saveCoverage } from "../src/lib/stage1/coverage";
import { MortalityInputSchema, MortalityResultSchema, type MortalityResult } from "../src/lib/stage1/mortality-schema";

interface CohortRow {
  patientId: string; cutoffDate: string; horizonDays: number;
  demographics?: { birthDate?: string; ageAtIndex?: number };
  resources: Record<string, unknown>[];
}
interface CompletedScreening { id: string; snapshotHash: string; indexTime: string; provenance: string; result: MortalityResult }

function provenanceFor(horizon: number, input: string): string {
  return `authored-synthetic cohort, ${horizon}-day horizon; enriched offline synthetic cohort row (${input.replace(/\\/g, "/")}); no observed outcome supplied`;
}

function toSnapshot(row: CohortRow, horizon: number, input: string) {
  const patientId = assertPatientId(row.patientId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.cutoffDate)) throw new Error(`Invalid cutoffDate for ${patientId}`);
  if (row.horizonDays !== horizon) throw new Error(`Row horizon ${row.horizonDays} does not match --horizon ${horizon}`);
  const indexTime = `${row.cutoffDate}T08:00:00.000Z`;
  const patient: Record<string, unknown> = { id: patientId, synthetic: true, source: "enriched synthetic cohort demographics" };
  if (row.demographics?.birthDate) patient.birthDate = row.demographics.birthDate;
  if (typeof row.demographics?.ageAtIndex === "number") patient.ageAtIndex = row.demographics.ageAtIndex;
  const records = (row.resources ?? []).map((resource, index) => {
    const digest = createHash("sha256").update(JSON.stringify(resource)).digest("hex").slice(0, 12);
    const kind = typeof resource.kind === "string" ? resource.kind.replace(/[^a-z0-9-]/gi, "-") : "resource";
    return { id: `${kind}-${String(index).padStart(3, "0")}-${digest}`, patientId, ...resource };
  });
  return { patientId, indexTime, provenance: provenanceFor(horizon, input), collectionPartial: false, patient, records };
}

async function indexCompletedScreenings(): Promise<CompletedScreening[]> {
  let names: string[];
  try { names = await readdir(SCREENINGS_ROOT); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e; }
  const out: CompletedScreening[] = [];
  for (const id of names.filter(n => /^[a-f0-9-]{36}$/.test(n))) {
    try {
      const input = JSON.parse(await readFile(path.join(screeningDirectory(id), "input.json"), "utf8"));
      const result = await readScreeningResult(id); // validates result.json against the frozen input
      if (result.status === "failed") continue;
      out.push({ id, snapshotHash: input.snapshotHash, indexTime: input.indexTime, provenance: input.provenance, result });
    } catch { /* running, failed to validate, or no result yet: not a completed screening */ }
  }
  return out;
}

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: "string", default: "data/mortality-cohort-enriched/asof-30d.ndjson" },
    horizon: { type: "string", default: "30" },
    patients: { type: "string" }, limit: { type: "string" },
    config: { type: "string", default: "config/stage1/mortality.json" },
    model: { type: "string" }, reasoning: { type: "string" }, threshold: { type: "string", default: "0.2" },
    resume: { type: "boolean", default: false }, "scoring-only": { type: "boolean", default: false }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("npx tsx scripts/screen-cohort.ts [--input FILE.ndjson] [--horizon 30] [--patients SIM-000011,SIM-000012] [--limit N] [--threshold 0.2] [--resume] [--scoring-only] [--model provider/model] [--reasoning low]");
    return;
  }
  if ((process.env.STAGE1_ENGINE ?? "llm_record") !== "llm_record") throw new Error("No evaluated tabular mortality model is installed. The available engine is llm_record.");
  const horizon = Number(values.horizon);
  if (!Number.isInteger(horizon) || horizon <= 0) throw new Error("--horizon must be a positive integer");
  const inputFile = values.input!;
  const rows = (await readFile(inputFile, "utf8")).split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l) as CohortRow);
  const wanted = values.patients ? new Set(values.patients.split(",").map(p => assertPatientId(p))) : undefined;
  let selected = wanted ? rows.filter(r => wanted.has(r.patientId.toUpperCase())) : rows;
  if (wanted) for (const p of wanted) if (!selected.some(r => r.patientId.toUpperCase() === p)) throw new Error(`Patient ${p} is not in ${inputFile}`);
  if (values.limit) selected = selected.slice(0, Number(values.limit));

  const overrides: Partial<MortalityConfig> = {};
  const model = values.model ?? process.env.CAIRN_STAGE1_MODEL ?? process.env.CAIRN_MODEL;
  if (model) overrides.model = model;
  if (values.reasoning) overrides.reasoning = values.reasoning as MortalityConfig["reasoning"];
  overrides.threshold = Number(values.threshold);
  overrides.thresholdBasis = "Command-line demo threshold; no measured clinical operating performance";
  const { config, prompt } = await loadMortalityConfig(values.config!, overrides);

  const inputsDirectory = path.join(CAIRN_ROOT, "cohort-inputs", `${horizon}d`);
  await mkdir(inputsDirectory, { recursive: true });
  const logFile = path.join(inputsDirectory, "_screen-log.ndjson");
  const completed = values.resume ? await indexCompletedScreenings() : [];
  console.error(`Screening ${selected.length} patient(s) from ${inputFile}; model ${config.model}, threshold ${config.threshold}; resume=${values.resume} (${completed.length} completed screenings indexed); scoringOnly=${values["scoring-only"]}`);

  const log = async (line: Record<string, unknown>) => { const text = JSON.stringify(line); console.log(text); await appendFile(logFile, text + "\n"); };
  let failures = 0;
  for (const row of selected) {
    const patientId = row.patientId;
    const startedAt = Date.now();
    try {
      const snapshotFile = path.join(inputsDirectory, `${assertPatientId(patientId)}.json`);
      await writeJsonAtomic(snapshotFile, toSnapshot(row, horizon, inputFile));
      const source = await readFullSnapshot(snapshotFile);
      const id = crypto.randomUUID();
      const input = prepareMortalityInput(source, id);
      let result: MortalityResult | undefined;
      let resumed = false;
      const existing = completed.find(c => c.result.patientId === input.patientId && c.snapshotHash === input.snapshotHash && c.indexTime === input.indexTime && c.provenance === input.provenance);
      if (existing) { result = existing.result; resumed = true; }
      else {
        const directory = await createScreening(input, { config, prompt, invariants: MORTALITY_INVARIANTS });
        await saveCoverage(input, "authored");
        await writeFile(path.join(directory, "prompt.md"), prompt);
        await writeJsonAtomic(path.join(directory, "schemas.json"), { input: MortalityInputSchema, result: MortalityResultSchema });
        const estimate = await runMortalityEngine(input, config, prompt, makeLlmMortalityEngine(config.model));
        await writeJsonAtomic(path.join(directory, "attempts.json"), estimate.attempts);
        await saveScreeningResult(estimate.result);
        result = estimate.result;
      }
      if (!values["scoring-only"] && result.decision === "above_threshold" && !result.stage2JobId) {
        await linkScreening(result.screeningId);
        result = await readScreeningResult(result.screeningId);
      }
      if (result.status === "failed") failures += 1;
      await log({ patientId, screeningId: result.screeningId, status: result.status, decision: result.decision,
        deathProbability3m: result.deathProbability3m, reason: result.reason, stage2JobId: result.stage2JobId,
        records: input.records.length, resumed, elapsedMs: Date.now() - startedAt });
    } catch (error) {
      failures += 1;
      await log({ patientId, screeningId: null, status: "error", decision: null, reason: error instanceof Error ? error.message : String(error), stage2JobId: null, elapsedMs: Date.now() - startedAt });
    }
  }
  console.error(`Done: ${selected.length} patient(s), ${failures} failure(s). Log: ${logFile}`);
  if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Cohort screening failed"); process.exitCode = 1; });
