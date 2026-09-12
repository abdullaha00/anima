import { appendFile } from "node:fs/promises";
import path from "node:path";
import { runPrimaryAssessment, runVerificationAssessment } from "./agent";
import { collectPatientRecord } from "./collector";
import { RUNS_ROOT, assertPatientId } from "./config";
import { ensureDirectory, errorMessage, writeJsonAtomic } from "./json-files";
import type { Stage2Assessment } from "./types";

async function logPipelineEvent(
  runDirectory: string,
  event: Record<string, unknown>,
): Promise<void> {
  const logPath = path.join(runDirectory, "logs", "pipeline.jsonl");
  await ensureDirectory(path.dirname(logPath));
  await appendFile(
    logPath,
    `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
    "utf8",
  );
}

async function setRunState(
  runDirectory: string,
  state: Record<string, unknown>,
): Promise<void> {
  await writeJsonAtomic(path.join(runDirectory, "run.json"), state);
  await logPipelineEvent(runDirectory, state);
}

export async function runStage2Pipeline(
  inputPatientId: string,
  requestedRunId?: string,
): Promise<{ runId: string; runDirectory: string; result: Stage2Assessment }> {
  const patientId = assertPatientId(inputPatientId);
  const runId = requestedRunId ?? crypto.randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    throw new Error("Run ID must be a UUID");
  }
  const runDirectory = path.join(RUNS_ROOT, runId);
  const startedAt = new Date().toISOString();
  const agentConfiguration = {
    model: process.env.CAIRN_MODEL ?? "pi-default",
    thinkingLevel: process.env.CAIRN_THINKING ?? "pi-default",
  };
  await ensureDirectory(runDirectory);

  try {
    await setRunState(runDirectory, {
      runId,
      patientId,
      status: "running",
      phase: "collecting",
      startedAt,
      agentConfiguration,
    });
    const manifest = await collectPatientRecord(patientId, runDirectory);

    await setRunState(runDirectory, {
      runId,
      patientId,
      status: "running",
      phase: "primary_assessment",
      startedAt,
      collectionCoverage: manifest.coverage,
      agentConfiguration,
    });
    const primary = await runPrimaryAssessment(runDirectory, patientId);
    await writeJsonAtomic(
      path.join(runDirectory, "analysis", "primary.json"),
      primary,
    );

    await setRunState(runDirectory, {
      runId,
      patientId,
      status: "running",
      phase: "false_positive_verification",
      startedAt,
      collectionCoverage: manifest.coverage,
      agentConfiguration,
    });
    const result = await runVerificationAssessment(runDirectory, patientId);
    const resultPath = path.join(runDirectory, "analysis", "final.json");
    await writeJsonAtomic(resultPath, result);

    await setRunState(runDirectory, {
      runId,
      patientId,
      status: "completed",
      phase: "completed",
      startedAt,
      completedAt: new Date().toISOString(),
      resultPath,
      recommendation: result.recommendation,
      verificationVerdict: result.verification.verdict,
      collectionCoverage: manifest.coverage,
      agentConfiguration,
    });
    return { runId, runDirectory, result };
  } catch (error) {
    const message = errorMessage(error);
    await setRunState(runDirectory, {
      runId,
      patientId,
      status: "failed",
      phase: "failed",
      startedAt,
      failedAt: new Date().toISOString(),
      error: message,
      agentConfiguration,
    });
    throw error;
  }
}
