import { expect } from "vitest";

import type { AgentToolExecutionResult } from "@/lib/server/agent-orchestrator";
import type { AgentToolDecisionParseResult } from "@/lib/server/agent-orchestrator/tool-registry";

import type { AgentSingleToolCase } from "./agent-tool-fixtures";

export type AgentSingleToolAssertionStatus = "passed" | "failed" | "skipped" | "needs_review";
export type AgentSingleToolFailureLevel = "P0" | "P1" | "P2" | "P3";

export type AgentSingleToolRunResult = {
  rawModelOutput?: string;
  parsedDecision?: unknown;
  parseResult?: AgentToolDecisionParseResult;
  schemaValid: boolean;
  schemaError?: unknown;
  executionResult?: AgentToolExecutionResult<unknown>;
};

export type AgentSingleToolAssertionResult = {
  decisionStatus: AgentSingleToolAssertionStatus;
  schemaStatus: AgentSingleToolAssertionStatus;
  executionStatus: AgentSingleToolAssertionStatus;
  contractStatus: AgentSingleToolAssertionStatus;
  finalStatus: AgentSingleToolAssertionStatus;
  failureLevel?: AgentSingleToolFailureLevel;
  failureReasons: string[];
};

// 单工具断言把 LLM 决策格式和 tool 执行结果分层，方便定位是模型调用错还是工具本身错。
export function evaluateAgentSingleToolResult(input: {
  testCase: AgentSingleToolCase;
  result: AgentSingleToolRunResult;
}): AgentSingleToolAssertionResult {
  const failures: Array<{
    level: AgentSingleToolFailureLevel;
    reason: string;
    layer: "decision" | "schema" | "execution" | "contract";
  }> = [];
  const { testCase, result } = input;

  if (!result.rawModelOutput?.trim()) {
    failures.push({ level: "P0", layer: "decision", reason: "LLM 输出为空。" });
  }

  if (!result.parseResult?.ok) {
    failures.push({
      level: "P0",
      layer: "decision",
      reason: `LLM 输出无法解析为 AgentToolDecision：${result.parseResult?.message ?? "missing_parse_result"}`,
    });
  }

  if (result.parseResult?.ok) {
    const decision = result.parseResult.decision;

    if (decision.action !== "call_tool") {
      failures.push({ level: "P0", layer: "decision", reason: `LLM 没有返回 call_tool，实际 action=${decision.action}` });
    } else if (decision.toolName !== testCase.toolName) {
      failures.push({
        level: "P0",
        layer: "decision",
        reason: `LLM 调用了错误 tool：期望 ${testCase.toolName}，实际 ${decision.toolName}`,
      });
    }
  }

  if (!result.schemaValid) {
    failures.push({
      level: "P1",
      layer: "schema",
      reason: `LLM tool input 未通过目标 tool schema：${summarizeUnknown(result.schemaError)}`,
    });
  }

  if (!result.executionResult) {
    failures.push({ level: "P1", layer: "execution", reason: "目标 tool 未执行。" });
  } else if (!result.executionResult.ok) {
    failures.push({
      level: "P1",
      layer: "execution",
      reason: `目标 tool 执行失败：${result.executionResult.error.code}: ${result.executionResult.error.message}`,
    });
  } else {
    for (const field of testCase.expectedOutputFields) {
      if (!hasNestedValue(result.executionResult.output, field.split("."))) {
        failures.push({
          level: "P2",
          layer: "contract",
          reason: `目标 tool 输出缺少期望字段：${field}`,
        });
      }
    }

    if (!result.executionResult.toolResultId?.trim()) {
      failures.push({ level: "P2", layer: "contract", reason: "目标 tool 成功结果缺少 toolResultId。" });
    }

    if (typeof result.executionResult.modelSummary === "undefined") {
      failures.push({ level: "P2", layer: "contract", reason: "目标 tool 成功结果缺少 modelSummary。" });
    }
  }

  const failureLevel = rankFailureLevel(failures.map((failure) => failure.level));
  const finalStatus = failureLevel
    ? failureLevel === "P3"
      ? "needs_review"
      : "failed"
    : "passed";

  return {
    decisionStatus: failures.some((failure) => failure.layer === "decision") ? "failed" : "passed",
    schemaStatus: failures.some((failure) => failure.layer === "schema") ? "failed" : "passed",
    executionStatus: failures.some((failure) => failure.layer === "execution") ? "failed" : "passed",
    contractStatus: failures.some((failure) => failure.layer === "contract") ? "failed" : "passed",
    finalStatus,
    failureLevel,
    failureReasons: failures.map((failure) => `[${failure.level}] ${failure.reason}`),
  };
}

export function assertAgentSingleToolResult(input: {
  testCase: AgentSingleToolCase;
  result: AgentSingleToolRunResult;
}) {
  const assertion = evaluateAgentSingleToolResult(input);
  const context = {
    id: input.testCase.id,
    toolName: input.testCase.toolName,
    parsedDecision: input.result.parsedDecision,
    parseResult: input.result.parseResult,
    schemaValid: input.result.schemaValid,
    schemaError: input.result.schemaError,
    executionResult: input.result.executionResult,
    assertion,
  };

  expect(assertion.finalStatus, JSON.stringify(context, null, 2)).toBe("passed");
}

export function previewAgentToolText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function hasNestedValue(value: unknown, path: string[]) {
  let current = value;

  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return false;
    }
    current = (current as Record<string, unknown>)[key];
  }

  if (Array.isArray(current)) {
    return current.length > 0;
  }

  return typeof current !== "undefined" && current !== null;
}

function summarizeUnknown(value: unknown) {
  try {
    return JSON.stringify(value).slice(0, 600);
  } catch {
    return String(value);
  }
}

function rankFailureLevel(levels: AgentSingleToolFailureLevel[]) {
  if (levels.includes("P0")) return "P0";
  if (levels.includes("P1")) return "P1";
  if (levels.includes("P2")) return "P2";
  if (levels.includes("P3")) return "P3";
  return undefined;
}
