type JsonRecord = Record<string, unknown>;

function objectValue(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

/**
 * SDK message_update events contain the complete partial message on every delta,
 * which grows audit logs quadratically. Keep reconstructable deltas and final
 * tool-call content while dropping repeated partial snapshots and bulky results.
 */
export function compactAgentEvent(event: unknown): JsonRecord {
  const source = objectValue(event) ?? { value: String(event) };
  const type = typeof source.type === "string" ? source.type : "unknown";
  const compact: JsonRecord = { at: new Date().toISOString(), type };

  if (type === "message_update") {
    const update = objectValue(source.assistantMessageEvent) ?? {};
    compact.assistantMessageEvent = {
      type: update.type,
      contentIndex: update.contentIndex,
      ...(typeof update.delta === "string" ? { delta: update.delta } : {}),
      ...(typeof update.content === "string" ? { content: update.content } : {}),
      ...(update.toolCall !== undefined ? { toolCall: update.toolCall } : {}),
    };
    return compact;
  }

  const safeFields = [
    "toolCallId",
    "toolName",
    "args",
    "isError",
    "attempt",
    "delayMs",
    "error",
    "reason",
  ];
  for (const field of safeFields) {
    if (source[field] !== undefined) compact[field] = source[field];
  }
  const message = objectValue(source.message);
  if (message) {
    compact.message = {
      role: message.role,
      provider: message.provider,
      model: message.model,
      api: message.api,
      stopReason: message.stopReason,
      errorMessage: message.errorMessage,
    };
  }
  return compact;
}
