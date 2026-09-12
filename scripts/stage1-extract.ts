#!/usr/bin/env node
import "../src/lib/cairn/load-env";
import { parseArgs } from "node:util";
import path from "node:path";
import { CAIRN_ROOT, assertPatientId } from "../src/lib/cairn/config";
import { writeJsonAtomic } from "../src/lib/cairn/json-files";
import { loadExtractionConfig } from "../src/lib/stage1/config";
import { prepareInput, readCollectedSnapshot, readInputSnapshot } from "../src/lib/stage1/input";
import { extractFeatures, INVARIANT_PROMPT } from "../src/lib/stage1/extractor";
import { createFeatureCompleter } from "../src/lib/stage1/provider";
import { ExtractionConfigSchema, FeatureExtractionSchema, type ExtractionConfig } from "../src/lib/stage1/schema";

async function main() {
  const { values } = parseArgs({ options: {
    snapshot: { type: "string" }, "record-run": { type: "string" }, patient: { type: "string" },
    config: { type: "string", default: "config/stage1/default.json" }, model: { type: "string" },
    prompt: { type: "string" }, reasoning: { type: "string" }, "output-root": { type: "string" },
    "prepare-only": { type: "boolean", default: false }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("npm run stage1:extract -- --snapshot FILE | --record-run DIRECTORY | --patient SIM-000001 [--config FILE] [--model provider/model] [--prompt FILE] [--reasoning low] [--prepare-only] [--output-root DIR]"); return;
  }
  if ([values.snapshot, values["record-run"], values.patient].filter(Boolean).length !== 1) throw new Error("Choose exactly one input: --snapshot, --record-run or --patient");
  const overrides: Partial<ExtractionConfig> = {};
  if (values.prompt) overrides.promptFile = path.resolve(values.prompt);
  const model = values.model ?? process.env.CAIRN_STAGE1_MODEL ?? process.env.CAIRN_MODEL;
  if (model) overrides.model = model;
  const reasoning = values.reasoning ?? process.env.CAIRN_STAGE1_REASONING;
  if (reasoning) overrides.reasoning = reasoning as ExtractionConfig["reasoning"];
  const loaded = await loadExtractionConfig(values.config, overrides);
  const prompt = loaded.prompt;
  const runId = crypto.randomUUID();
  const directory = path.resolve(values["output-root"] ?? path.join(CAIRN_ROOT, "stage1"), runId);
  await writeJsonAtomic(path.join(directory, "run.json"), { runId, status: "preparing", startedAt: new Date().toISOString() });
  try {
    let snapshot;
    if (values.snapshot) snapshot = await readInputSnapshot(values.snapshot);
    else {
      let recordRun = values["record-run"];
      if (values.patient) {
        const { collectPatientRecord } = await import("../src/lib/cairn/collector");
        recordRun = path.join(directory, "collection");
        await collectPatientRecord(assertPatientId(values.patient), recordRun);
      }
      snapshot = await readCollectedSnapshot(recordRun!);
    }
    const input = prepareInput(snapshot, loaded.config);
    await writeJsonAtomic(path.join(directory, "input.json"), input);
    await writeJsonAtomic(path.join(directory, "config.json"), { config: loaded.config, prompt, invariantPrompt: INVARIANT_PROMPT });
    await writeJsonAtomic(path.join(directory, "schemas.json"), { configuration: ExtractionConfigSchema, submission: FeatureExtractionSchema });
    if (values["prepare-only"]) {
      await writeJsonAtomic(path.join(directory, "run.json"), { runId, status: "prepared", patientId: input.patientId });
      console.log(JSON.stringify({ runId, directory, status: "prepared", sources: input.sources.length }, null, 2)); return;
    }
    const complete = input.sources.length ? await createFeatureCompleter() : async () => { throw new Error("No sources"); };
    const result = await extractFeatures(input, loaded.config, prompt, complete);
    await writeJsonAtomic(path.join(directory, "features.json"), result);
    await writeJsonAtomic(path.join(directory, "vector.json"), { patientId: result.patientId, indexTime: result.indexTime,
      inputHash: result.inputHash, configHash: result.configHash, status: result.status, values: result.featureValues });
    await writeJsonAtomic(path.join(directory, "run.json"), { runId, status: result.status, patientId: result.patientId,
      completedAt: new Date().toISOString(), resultPath: "features.json" });
    console.log(JSON.stringify({ runId, directory, status: result.status, sources: input.sources.length,
      features: result.features.map(f => ({ id: f.id, state: f.state, temporality: f.temporality, citations: f.evidence.length })),
      attempts: result.attempts.map(a => ({ attempt: a.attempt, elapsedMs: a.elapsedMs,
        accepted: a.accepted, error: a.error, metadata: a.metadata })) }, null, 2));
    if (result.status === "failed") process.exitCode = 1;
  } catch (error) {
    await writeJsonAtomic(path.join(directory, "run.json"), { runId, status: "failed", failedAt: new Date().toISOString() });
    throw error;
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Extraction failed"); process.exitCode = 1; });
