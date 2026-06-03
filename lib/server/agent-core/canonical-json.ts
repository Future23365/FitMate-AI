/** stableStringify 为 hash、snapshot 和 confirmation canonical payload 提供稳定 JSON 表达。 */
export function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "\"[undefined]\"";
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(",")}}`;
}

/** estimateJsonTokens 用确定性近似值约束 planner 上下文成本，不依赖具体模型 tokenizer。 */
export function estimateJsonTokens(value: unknown): number {
  return Math.ceil(stableStringify(value).length / 4);
}
