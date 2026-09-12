import { createWriteStream } from "node:fs";
import path from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  ModelRuntime,
  resolveCliModel,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Check, Errors } from "typebox/value";
import { validateSubmittedAssessment } from "./assessment-validation";
import { compactAgentEvent } from "./agent-events";
import { DEFAULT_LLM_MODEL, DEFAULT_LLM_REASONING, type LlmReasoning } from "./config";
import { ensureDirectory } from "./json-files";
import {
  Stage2AssessmentSchema,
  type Stage2Assessment,
} from "./types";
import {
  STAGE2_SYSTEM_PROMPT,
  primaryPrompt as buildPrimaryPrompt,
  verificationPrompt,
} from "./prompts";

type PassName = "primary" | "verification";

async function closeStream(stream: ReturnType<typeof createWriteStream>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.end(resolve);
  });
}

async function runAgentPass(options: {
  pass: PassName;
  runDirectory: string;
  patientId: string;
  generatedAt: string;
  model?: string;
  thinking?: LlmReasoning;
  timeoutMs?: number;
}): Promise<Stage2Assessment> {
  const logsDirectory = path.join(options.runDirectory, "logs");
  await ensureDirectory(logsDirectory);
  const eventStream = createWriteStream(
    path.join(logsDirectory, `${options.pass}-events.jsonl`),
    { flags: "a" },
  );
  let submitted: Stage2Assessment | undefined;

  const submitTool = defineTool({
    name: "submit_stage2_assessment",
    label: "Submit Stage 2 assessment",
    description:
      "Submit the complete structured Stage 2 assessment after reviewing all evidence.",
    parameters: Stage2AssessmentSchema,
    execute: async (_toolCallId, params) => {
      if (submitted) {
        throw new Error("The assessment has already been submitted");
      }
      if (!Check(Stage2AssessmentSchema, params)) {
        const errors = [...Errors(Stage2AssessmentSchema, params)].slice(0, 12).map(e => `${e.instancePath || "/"}: ${e.message}`);
        throw new Error(`Assessment schema errors: ${errors.join("; ")}. Omit unknown optional fields; do not use empty strings. Submit the complete assessment again.`);
      }
      const assessment = params as Stage2Assessment;
      await validateSubmittedAssessment({
        assessment,
        pass: options.pass,
        runDirectory: options.runDirectory,
        patientId: options.patientId,
        generatedAt: options.generatedAt,
      });
      submitted = assessment;
      return {
        content: [{ type: "text" as const, text: "Assessment accepted." }],
        details: {},
      };
    },
  });

  const thinkingLevels = [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ] as const;
  const configuredThinking = options.thinking ?? process.env.CAIRN_THINKING ?? DEFAULT_LLM_REASONING;
  if (
    configuredThinking &&
    !thinkingLevels.includes(configuredThinking as (typeof thinkingLevels)[number])
  ) {
    throw new Error(`Unsupported CAIRN_THINKING level: ${configuredThinking}`);
  }
  const thinkingLevel = configuredThinking as
    | (typeof thinkingLevels)[number]
    | undefined;
  const modelRuntime = await ModelRuntime.create();
  const configuredModel = options.model ?? process.env.CAIRN_MODEL ?? DEFAULT_LLM_MODEL;
  const resolvedModel = configuredModel
    ? resolveCliModel({
        cliModel: configuredModel,
        cliThinking: thinkingLevel,
        modelRuntime,
      })
    : undefined;
  if (resolvedModel?.error) throw new Error(resolvedModel.error);

  const loader = new DefaultResourceLoader({
    cwd: options.runDirectory,
    agentDir: getAgentDir(),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => STAGE2_SYSTEM_PROMPT,
    appendSystemPromptOverride: () => [],
  });
  await loader.reload();
  const { session } = await createAgentSession({
    cwd: options.runDirectory,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(options.runDirectory),
    modelRuntime,
    model: resolvedModel?.model,
    thinkingLevel: resolvedModel?.thinkingLevel ?? thinkingLevel,
    tools: ["read", "grep", "find", "ls", "submit_stage2_assessment"],
    customTools: [submitTool],
  });

  const unsubscribe = session.subscribe((event) => {
    try {
      eventStream.write(`${JSON.stringify(compactAgentEvent(event))}\n`);
    } catch (error) {
      eventStream.write(
        `${JSON.stringify({ type: "event_serialization_error", error: String(error) })}\n`,
      );
    }
  });

  try {
    const prompt =
      options.pass === "primary"
        ? buildPrimaryPrompt(options.patientId, options.generatedAt)
        : verificationPrompt(options.patientId, options.generatedAt);
    const configuredTimeout = Number(options.timeoutMs ?? process.env.CAIRN_AGENT_TIMEOUT_MS ?? 1_200_000);
    const timeoutMilliseconds =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 1_200_000;
    let timeout: NodeJS.Timeout | undefined;
    const promptPromise = session.prompt(prompt);
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      timeout = setTimeout(() => resolve("timeout"), timeoutMilliseconds);
    });
    let outcome: "completed" | "timeout";
    try {
      outcome = await Promise.race([
        promptPromise.then(() => "completed" as const),
        timeoutPromise,
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (outcome === "timeout") {
      await session.abort();
      await session.agent.waitForIdle();
      await promptPromise.catch(() => undefined);
      throw new Error(
        `${options.pass} agent exceeded ${timeoutMilliseconds}ms timeout`,
      );
    }
    if (!submitted) {
      throw new Error(
        `${options.pass} agent finished without calling submit_stage2_assessment`,
      );
    }
    return {
      ...submitted,
      patientId: options.patientId,
      generatedAt: options.generatedAt,
    };
  } finally {
    unsubscribe();
    session.dispose();
    await closeStream(eventStream);
  }
}

export async function runPrimaryAssessment(
  runDirectory: string,
  patientId: string,
  agent?: { model?: string; thinking?: LlmReasoning; timeoutMs?: number },
): Promise<Stage2Assessment> {
  return runAgentPass({
    pass: "primary",
    runDirectory,
    patientId,
    generatedAt: new Date().toISOString(),
    ...agent,
  });
}

export async function runVerificationAssessment(
  runDirectory: string,
  patientId: string,
  agent?: { model?: string; thinking?: LlmReasoning; timeoutMs?: number },
): Promise<Stage2Assessment> {
  return runAgentPass({
    pass: "verification",
    runDirectory,
    patientId,
    generatedAt: new Date().toISOString(),
    ...agent,
  });
}
