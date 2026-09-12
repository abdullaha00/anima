#!/usr/bin/env node
import "../src/lib/cairn/load-env";
import { runStage2Pipeline } from "../src/lib/cairn/pipeline";

async function main(): Promise<void> {
  const patientId = process.argv[2];
  if (!patientId) {
    throw new Error("Usage: npm run stage2 -- SIM-000001");
  }
  const run = await runStage2Pipeline(patientId);
  console.log(
    JSON.stringify(
      {
        runId: run.runId,
        runDirectory: run.runDirectory,
        recommendation: run.result.recommendation,
        verification: run.result.verification.verdict,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
