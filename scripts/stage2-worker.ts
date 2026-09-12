#!/usr/bin/env node
import "../src/lib/cairn/load-env";
import {
  acquireWorkerLock,
  claimNextJob,
  processStage2Job,
  recoverInterruptedJobs,
} from "../src/lib/cairn/job-worker";

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const pollMilliseconds = Number(process.env.CAIRN_WORKER_POLL_MS ?? 1000);
  let stopping = false;

  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  const releaseWorkerLock = await acquireWorkerLock();
  try {
    const recovered = await recoverInterruptedJobs();
    console.log(`Cairn Stage 2 worker started; recovered=${recovered}`);

    do {
      const job = await claimNextJob();
      if (job) {
        console.log(`Processing ${job.id} for ${job.patientId}`);
        const finished = await processStage2Job(job);
        console.log(
          `${finished.id}: ${finished.status}${finished.error ? ` - ${finished.error}` : ""}`,
        );
        if (once) break;
        continue;
      }
      if (once) break;
      await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
    } while (!stopping);

    console.log("Cairn Stage 2 worker stopped");
  } finally {
    await releaseWorkerLock();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
