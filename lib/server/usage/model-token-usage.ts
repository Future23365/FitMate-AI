/** ModelTokenUsage 是供应商 usage 字段归一化后的真实模型 token 用量。 */
export type ModelTokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

/** normalizeModelTokenUsage 把不同供应商的 usage 字段收敛为生产统计使用的稳定命名。 */
export function normalizeModelTokenUsage(usage: unknown): ModelTokenUsage | undefined {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return undefined;
  }

  const record = usage as Record<string, unknown>;
  const promptTokens = readFiniteNumber(record.prompt_tokens ?? record.promptTokens ?? record.input_tokens ?? record.inputTokens);
  const completionTokens = readFiniteNumber(
    record.completion_tokens ?? record.completionTokens ?? record.output_tokens ?? record.outputTokens,
  );
  const totalTokens = readFiniteNumber(record.total_tokens ?? record.totalTokens)
    ?? (
      promptTokens !== undefined && completionTokens !== undefined
        ? promptTokens + completionTokens
        : undefined
    );

  return promptTokens !== undefined || completionTokens !== undefined || totalTokens !== undefined
    ? {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      }
    : undefined;
}

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
