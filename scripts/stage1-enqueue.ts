#!/usr/bin/env node
import "../src/lib/cairn/load-env";
import { parseArgs } from "node:util";
import { enqueueScreening, retryScreening, publicScreeningJob } from "../src/lib/stage1/job-queue";
const { values } = parseArgs({ options: { patient: { type: "string" }, retry: { type: "string" }, key: { type: "string" } } });
try {
  if (!!values.patient === !!values.retry) throw new Error("Choose --patient SIM-000001 or --retry JOB_ID");
  console.log(JSON.stringify(publicScreeningJob(values.retry ? await retryScreening(values.retry) : await enqueueScreening(values.patient!, values.key)), null, 2));
} catch (e) { console.error(e instanceof Error ? e.message : "Enqueue failed"); process.exitCode = 1; }
