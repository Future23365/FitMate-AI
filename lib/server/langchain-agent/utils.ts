import "server-only";

import type { LangChainJsonValue } from "./types";

export type LangChainJsonProjectionBudget = {
  maxLength?: number;
  maxArrayItems?: number;
  maxObjectEntries?: number;
};

const defaultJsonProjectionBudget = {
  maxLength: 1_200,
  maxArrayItems: 20,
  maxObjectEntries: 30,
} as const satisfies Required<LangChainJsonProjectionBudget>;

/** truncateTextForLangChainTrace 控制 LangChain 诊断文本长度，避免 provider payload 或 tool output 原样进 trace。 */
export function truncateTextForLangChainTrace(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const edgeLength = Math.max(20, Math.floor((maxLength - 20) / 2));

  return `${value.slice(0, edgeLength)}...[truncated:${value.length - edgeLength * 2}]...${value.slice(-edgeLength)}`;
}

/** toLangChainJsonValue 将未知值安全收敛为可写入 trace / projection 的 JSON 值，结构裁剪预算由调用方显式控制。 */
export function toLangChainJsonValue(
  value: unknown,
  projectionBudget: number | LangChainJsonProjectionBudget = defaultJsonProjectionBudget,
): LangChainJsonValue {
  const budget = normalizeJsonProjectionBudget(projectionBudget);

  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return truncateTextForLangChainTrace(value, budget.maxLength);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, budget.maxArrayItems)
      .map((item) => toLangChainJsonValue(item, budget));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, budget.maxObjectEntries);

    return Object.fromEntries(entries.map(([key, entryValue]) => [
      key,
      toLangChainJsonValue(entryValue, budget),
    ]));
  }

  return String(value);
}

/** stringifyForModelSummary 把 wrapper 摘要稳定序列化为字符串，作为 LangChain ToolMessage content。 */
export function stringifyForModelSummary(
  value: unknown,
  maxLength: number,
  projectionBudget: Omit<LangChainJsonProjectionBudget, "maxLength"> = {},
) {
  const budget = normalizeJsonProjectionBudget({ ...projectionBudget, maxLength });
  const serialized = typeof value === "string" ? value : JSON.stringify(toLangChainJsonValue(value, budget));

  if (serialized.length <= maxLength || typeof value === "string") {
    return truncateTextForLangChainTrace(serialized, maxLength);
  }

  return JSON.stringify({
    status: "truncated",
    originalLength: serialized.length,
    preview: truncateTextForLangChainTrace(serialized, Math.max(80, maxLength - 200)),
  });
}

function normalizeJsonProjectionBudget(
  projectionBudget: number | LangChainJsonProjectionBudget,
): Required<LangChainJsonProjectionBudget> {
  if (typeof projectionBudget === "number") {
    return {
      ...defaultJsonProjectionBudget,
      maxLength: projectionBudget,
    };
  }

  return {
    maxLength: projectionBudget.maxLength ?? defaultJsonProjectionBudget.maxLength,
    maxArrayItems: projectionBudget.maxArrayItems ?? defaultJsonProjectionBudget.maxArrayItems,
    maxObjectEntries: projectionBudget.maxObjectEntries ?? defaultJsonProjectionBudget.maxObjectEntries,
  };
}

export function messageContentToText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }

      return "";
    }).join("");
  }

  return "";
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** createStableLangChainInputHash 为同 run duplicate input 检测生成稳定哈希，不保存完整 tool input。 */
export function createStableLangChainInputHash(value: unknown) {
  const serialized = stableJsonStringify(value);
  let hash = 2166136261;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableJsonStringify(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;

  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(",")}}`;
}
