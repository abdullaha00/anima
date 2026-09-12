import { mkdir, writeFile } from "node:fs/promises";
import { MortalityInputSchema, MortalityResultSchema } from "../src/lib/stage1/mortality-schema";
import { VerifiedOutcomeSchema } from "../src/lib/stage1/mortality-outcomes";

await mkdir("schemas", { recursive: true });
for (const [name, schema] of Object.entries({ "mortality-input-v1": MortalityInputSchema, "mortality-result-v1": MortalityResultSchema, "verified-outcome-v1": VerifiedOutcomeSchema })) {
  await writeFile(`schemas/${name}.schema.json`, JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", ...schema }, null, 2) + "\n");
}
