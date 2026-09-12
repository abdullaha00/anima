import { ModelRuntime, resolveCliModel } from "@earendil-works/pi-coding-agent";
import { FeatureExtractionSchema } from "./schema";
import { FeatureProviderError, type FeatureCompleter } from "./extractor";

/** Uses the same provider/auth runtime as Stage 2, without an autonomous tool loop. */
export async function createFeatureCompleter(): Promise<FeatureCompleter> {
  const runtime = await ModelRuntime.create({ refreshOnCreate: false });
  return async ({ systemPrompt, userPrompt, config, signal }) => {
    const resolved = resolveCliModel({ cliModel: config.model, cliThinking: config.reasoning, modelRuntime: runtime });
    if (resolved.error || !resolved.model) throw new FeatureProviderError("model");
    const model = resolved.model;
    const response = await runtime.completeSimple(model, {
      systemPrompt,
      messages: [{ role: "user", content: userPrompt, timestamp: Date.now() }],
      tools: [{ name: "submit_stage1_features", description: "Return the requested features with exact source quotations.", parameters: FeatureExtractionSchema }],
    }, {
      signal, maxTokens: config.maxOutputTokens,
      ...(config.reasoning === "off" ? {} : { reasoning: config.reasoning }),
      ...(config.temperature === null ? {} : { temperature: config.temperature }),
      transport: "sse",
    });
    if (response.stopReason === "length") throw new FeatureProviderError("output_limit");
    if (["error", "aborted"].includes(response.stopReason)) {
      // Classify locally; never put provider bodies or credentials into run artifacts.
      const detail = response.errorMessage ?? "";
      throw new FeatureProviderError(/401|403|api.key|unauthori[sz]ed/i.test(detail) ? "authentication" :
        /429|quota|rate.limit/i.test(detail) ? "rate_limit" : "request");
    }
    const calls = response.content.filter(c => c.type === "toolCall");
    const submission = calls.length === 1 && calls[0].name === "submit_stage1_features" ? calls[0].arguments : undefined;
    return { submission, metadata: { provider: response.provider, model: response.model,
      inputTokens: response.usage.input, outputTokens: response.usage.output,
      cacheReadTokens: response.usage.cacheRead, cacheWriteTokens: response.usage.cacheWrite,
      stopReason: response.stopReason } };
  };
}
