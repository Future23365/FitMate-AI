import type { JsonValue } from "@/lib/server/visible-outputs/contracts";
import { sanitizeAgentActivitySummary } from "@/lib/shared/agent-activity-summary";

export const REDACTED_VALUE = "[redacted]";

const defaultSensitiveKeyPatterns = [
  /^output$/i,
  /secret/i,
  /token/i,
  /password/i,
  /authorization/i,
  /cookie/i,
  /api[_-]?key/i,
  /handler/i,
  /capabilit/i,
  /database/i,
  /^payload$/i,
];

const defaultSensitiveValuePatterns = [
  /server-only/i,
  /secretInternalValue/i,
  /api[_-]?key/i,
  /\bsk-[A-Za-z0-9_-]{8,}\b/,
  /\bBearer\s+[A-Za-z0-9._-]+\b/i,
];

/** RedactionPolicy 描述安全投影前的字段、路径和默认拒绝策略。 */
export type RedactionPolicy = {
  sensitiveKeyPatterns?: RegExp[];
  sensitiveValuePatterns?: RegExp[];
  allowedPaths?: string[];
  defaultDeny?: boolean;
  maxStringLength?: number;
};

/** redactJsonValue 是 trace、开发日志和安全摘要共享的脱敏入口，不依赖旧 Agent runtime。 */
export function redactJsonValue(value: JsonValue | unknown, policy: RedactionPolicy = {}, path = "$"): JsonValue {
  const keyPatterns = policy.sensitiveKeyPatterns ?? defaultSensitiveKeyPatterns;
  const valuePatterns = policy.sensitiveValuePatterns ?? defaultSensitiveValuePatterns;

  if (policy.defaultDeny && policy.allowedPaths && !isPathAllowed(path, policy.allowedPaths) && !hasAllowedDescendant(path, policy.allowedPaths)) {
    return REDACTED_VALUE;
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (valuePatterns.some((pattern) => pattern.test(value))) {
      return REDACTED_VALUE;
    }

    const maxStringLength = policy.maxStringLength ?? 1_200;
    if (value.length > maxStringLength) {
      return `${value.slice(0, maxStringLength)}...[truncated]`;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => redactJsonValue(item, policy, `${path}[${index}]`));
  }

  if (value && typeof value === "object") {
    const entries: Array<[string, JsonValue]> = [];

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (child === undefined) {
        continue;
      }

      const childPath = `${path}.${key}`;
      if (policy.defaultDeny && policy.allowedPaths && !hasAllowedDescendant(childPath, policy.allowedPaths)) {
        continue;
      }

      if (keyPatterns.some((pattern) => pattern.test(key))) {
        entries.push([key, REDACTED_VALUE]);
        continue;
      }

      if (key === "activitySummary") {
        entries.push([key, redactActivitySummary(child)]);
        continue;
      }

      entries.push([key, redactJsonValue(child, policy, childPath)]);
    }

    return Object.fromEntries(entries);
  }

  return REDACTED_VALUE;
}

function redactActivitySummary(value: unknown): JsonValue {
  const sanitized = sanitizeAgentActivitySummary(value);

  return sanitized.ok
    ? sanitized.summary
    : { rejectedReason: sanitized.reason };
}

function isPathAllowed(path: string, allowedPaths: string[]) {
  return allowedPaths.includes(path) || allowedPaths.some((allowedPath) => path.startsWith(`${allowedPath}.`));
}

function hasAllowedDescendant(path: string, allowedPaths: string[]) {
  return isPathAllowed(path, allowedPaths) || allowedPaths.some((allowedPath) => allowedPath.startsWith(`${path}.`));
}
