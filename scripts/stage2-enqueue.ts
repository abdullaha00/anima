#!/usr/bin/env node
import "../src/lib/cairn/load-env";
import { enqueueStage2Job } from "../src/lib/cairn/jobs";

async function main(): Promise<void> {
  const patientId = process.argv[2];
  if (!patientId) {
    throw new Error("Usage: npm run stage2:enqueue -- SIM-000001");
  }
  const job = await enqueueStage2Job(patientId);
  console.log(JSON.stringify(job, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
