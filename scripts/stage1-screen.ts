#!/usr/bin/env node
import "../src/lib/cairn/load-env";
import { parseArgs } from "node:util";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { CAIRN_ROOT, assertPatientId } from "../src/lib/cairn/config";
import { writeJsonAtomic } from "../src/lib/cairn/json-files";
import { readFullSnapshot, readFullCollection, prepareMortalityInput } from "../src/lib/stage1/mortality-input";
import { loadMortalityConfig, makeLlmMortalityEngine, runMortalityEngine, MORTALITY_INVARIANTS, type MortalityConfig } from "../src/lib/stage1/mortality-engine";
import { createScreening, saveScreeningResult, readScreeningResult, linkScreening, screeningDirectory } from "../src/lib/stage1/mortality-store";
import { saveCoverage } from "../src/lib/stage1/coverage";
import { MortalityInputSchema, MortalityResultSchema } from "../src/lib/stage1/mortality-schema";

async function main() {
  const { values } = parseArgs({ options: {
    snapshot: { type: "string" }, "record-run": { type: "string" }, patient: { type: "string" },
    resume: { type: "string" }, config: { type: "string", default: "config/stage1/mortality.json" },
    model: { type: "string" }, prompt: { type: "string" }, reasoning: { type: "string" }, threshold: { type: "string" },
    "scoring-only": { type: "boolean", default: false }, help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("npm run stage1:screen -- --snapshot FILE | --record-run DIR | --patient SIM-000001 | --resume SCREENING_ID [--config FILE] [--model provider/model] [--prompt FILE] [--reasoning low] [--threshold 0.2] [--scoring-only]"); return;
  }
  if ([values.snapshot, values["record-run"], values.patient, values.resume].filter(Boolean).length !== 1) throw new Error("Choose exactly one snapshot, record-run, patient or resume");
  if ((process.env.STAGE1_ENGINE ?? "llm_record") !== "llm_record") throw new Error("No evaluated tabular mortality model is installed. The available engine is llm_record.");
  if (values.resume && [values.model, values.prompt, values.reasoning, values.threshold].some(Boolean)) throw new Error("Resume preserves the saved estimate and configuration; use a new screening to change settings");
  let result;
  if (values.resume) result = await readScreeningResult(values.resume);
  else {
    const overrides: Partial<MortalityConfig> = {};
    const model = values.model ?? process.env.CAIRN_STAGE1_MODEL ?? process.env.CAIRN_MODEL;
    if (model) overrides.model = model;
    if (values.prompt) overrides.promptFile = path.resolve(values.prompt);
    if (values.reasoning) overrides.reasoning = values.reasoning as MortalityConfig["reasoning"];
    if (values.threshold) { overrides.threshold = Number(values.threshold); overrides.thresholdBasis = "Command-line demo threshold; no measured clinical operating performance"; }
    const { config, prompt } = await loadMortalityConfig(values.config, overrides);
    const id = crypto.randomUUID();
    let source;
    let collectionDirectory: string | undefined;
    if (values.snapshot) source = await readFullSnapshot(values.snapshot);
    else {
      let recordRun = values["record-run"];
      if (values.patient) {
        const { collectPatientRecord } = await import("../src/lib/cairn/collector");
        recordRun = path.join(CAIRN_ROOT, "screening-collections", id);
        await collectPatientRecord(assertPatientId(values.patient), recordRun);
      }
      source = await readFullCollection(recordRun!);
      collectionDirectory = recordRun;
    }
    const input = prepareMortalityInput(source, id);
    const directory = await createScreening(input, { config, prompt, invariants: MORTALITY_INVARIANTS });
    await saveCoverage(input, values.patient ? "live" : collectionDirectory ? "collected" : /^authored/i.test(input.provenance) ? "authored" : "cached", collectionDirectory);
    await writeFile(path.join(directory, "prompt.md"), prompt);
    await writeJsonAtomic(path.join(directory, "schemas.json"), { input: MortalityInputSchema, result: MortalityResultSchema });
    console.log(JSON.stringify({ screeningId: id, status: "running", records: input.records.length, directory }));
    const estimate = await runMortalityEngine(input, config, prompt, makeLlmMortalityEngine(config.model));
    await writeJsonAtomic(path.join(directory, "attempts.json"), estimate.attempts);
    await saveScreeningResult(estimate.result);
    result = estimate.result;
  }
  if (!values["scoring-only"] && result.decision === "above_threshold") {
    await linkScreening(result.screeningId);
    result = await readScreeningResult(result.screeningId);
  }
  console.log(JSON.stringify({ screeningId: result.screeningId, directory: screeningDirectory(result.screeningId),
    status: result.status, deathProbability3m: result.deathProbability3m, validation: result.engine.validation,
    decision: result.decision, stage2JobId: result.stage2JobId, reason: result.reason }, null, 2));
  if (result.status === "failed") process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Screening failed"); process.exitCode = 1; });
