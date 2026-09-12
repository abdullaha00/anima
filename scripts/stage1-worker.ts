#!/usr/bin/env node
import "../src/lib/cairn/load-env";
import { parseArgs } from "node:util";
import { runScreeningWorkerOnce } from "../src/lib/stage1/job-worker";
import { publicScreeningJob } from "../src/lib/stage1/job-queue";
const { values } = parseArgs({ options: { once: { type: "boolean" }, job: { type: "string" } } });
if (values.job && !/^[a-f0-9-]{36}$/.test(values.job)) throw new Error("Invalid job ID");
try {
  do {
    const job = await runScreeningWorkerOnce(values.job);
    if (job) console.log(JSON.stringify(publicScreeningJob(job)));
    if (values.once || values.job) { if (job?.status === "failed") process.exitCode = 1; break; }
    if (!job) await new Promise(r => setTimeout(r, 2000));
  } while (true);
} catch (e) { console.error(e instanceof Error ? e.message : "Worker failed"); process.exitCode = 1; }
