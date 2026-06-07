import type { JsonValue, ToolError } from "./contracts";
import { sanitizeAgentActivitySummary } from "@/lib/shared/agent-activity-summary";

export const REDACTED_VALUE = "[redacted]";

const DEFAULT_SENSITIVE_KEY_PATTERNS = [
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

const DEFAULT_SENSITIVE_VALUE_PATTERNS = [
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

/** RedactionAuditFinding 记录某个安全投影中仍可疑的泄漏位置。 */
export type RedactionAuditFinding = {
  path: string;
  code: "sensitive_key" | "sensitive_value" | "complete_output" | "internal_capability";
  message: string;
};

/** RedactionAuditResult 是 trace、manifest 和 event 投影的可测试审计结果。 */
export type RedactionAuditResult = {
  ok: boolean;
  findings: RedactionAuditFinding[];
};

/** redactJsonValue 统一脱敏模型 observation、用户事件和 trace 摘要。 */
export function redactJsonValue(value: JsonValue | unknown, policy: RedactionPolicy = {}, path = "$"): JsonValue {
  const keyPatterns = policy.sensitiveKeyPatterns ?? DEFAULT_SENSITIVE_KEY_PATTERNS;
  const valuePatterns = policy.sensitiveValuePatterns ?? DEFAULT_SENSITIVE_VALUE_PATTERNS;

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

/** auditRedactedValue 扫描脱敏后对象，发现 secret、完整 output 或内部 capability 立即暴露为测试失败证据。 */
export function auditRedactedValue(value: unknown): RedactionAuditResult {
  const findings: RedactionAuditFinding[] = [];
  walk(value, "$", findings);
  return {
    ok: findings.length === 0,
    findings,
  };
}

/** redactToolError 防止错误 details 把内部 payload 带进用户事件或 trace。 */
export function redactToolError(error: ToolError): ToolError {
  return {
    ...error,
    details: error.details ? redactJsonValue(error.details) : undefined,
  };
}

function walk(value: unknown, path: string, findings: RedactionAuditFinding[]) {
  if (typeof value === "string") {
    if (value !== REDACTED_VALUE && DEFAULT_SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      findings.push({
        path,
        code: "sensitive_value",
        message: "Projection still contains a sensitive string value.",
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, findings));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;

    if (key === "output" && child !== REDACTED_VALUE) {
      findings.push({
        path: childPath,
        code: "complete_output",
        message: "Projection contains a complete tool output field.",
      });
    }

    if (/capabilit/i.test(key) && child !== REDACTED_VALUE) {
      findings.push({
        path: childPath,
        code: "internal_capability",
        message: "Projection contains internal capability data.",
      });
    }

    if (DEFAULT_SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key)) && child !== REDACTED_VALUE) {
      findings.push({
        path: childPath,
        code: "sensitive_key",
        message: "Projection contains an unredacted sensitive key.",
      });
    }

    walk(child, childPath, findings);
  }
}

function isPathAllowed(path: string, allowedPaths: string[]) {
  return allowedPaths.includes(path) || allowedPaths.some((allowedPath) => path.startsWith(`${allowedPath}.`));
}

function hasAllowedDescendant(path: string, allowedPaths: string[]) {
  return isPathAllowed(path, allowedPaths) || allowedPaths.some((allowedPath) => allowedPath.startsWith(`${path}.`));
}
