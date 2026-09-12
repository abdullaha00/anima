import { readFile } from "node:fs/promises";
import path from "node:path";
import { Check } from "typebox/value";
import { ExtractionConfigSchema, type ExtractionConfig } from "./schema";

export async function loadExtractionConfig(file: string, overrides: Partial<ExtractionConfig> = {}) {
  const configPath = path.resolve(file);
  const raw: unknown = JSON.parse(await readFile(configPath, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Config must be an object");
  const merged = { ...raw, ...overrides };
  if (!Check(ExtractionConfigSchema, merged)) throw new Error("Invalid Stage 1 configuration; check config/stage1/default.json for supported fields and bounds");
  const config = merged as ExtractionConfig;
  if (config.currentEvidenceDays > config.lookbackDays) throw new Error("currentEvidenceDays must not exceed lookbackDays");
  if (new Set(config.features.map(f => f.id)).size !== config.features.length) throw new Error("Feature IDs must be unique");
  const prompt = await readFile(path.resolve(path.dirname(configPath), config.promptFile), "utf8");
  if (!prompt.trim() || prompt.length > 30000) throw new Error("Prompt must contain 1 to 30000 characters");
  return { config, prompt };
}
