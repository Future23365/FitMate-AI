import { expect } from "vitest";

import type { BlackboxTurnResult } from "./blackbox-runner";
import type { AgentToolCallCase } from "./agent-tool-fixtures";
import type { BlackboxCardType } from "./flow-fixtures";

export type AgentToolAssertionStatus = "passed" | "failed" | "skipped" | "needs_review";
export type AgentToolAssertionFailureLevel = "P0" | "P1" | "P2" | "P3";

export type AgentToolAssertionResult = {
  executionStatus: AgentToolAssertionStatus;
  toolStatus: AgentToolAssertionStatus;
  contractStatus: AgentToolAssertionStatus;
  finalStatus: AgentToolAssertionStatus;
  failureLevel?: AgentToolAssertionFailureLevel;
  failureReasons: string[];
};

const trainingCardTypes = new Set<BlackboxCardType>([
  "exercise_recommendation",
  "workout_routine",
  "workout_plan",
  "workout_patch",
]);

const internalLeakPatterns = [
  /```(?:json)?/i,
  /assistant_action/i,
  /serverParsedIntent/i,
  /serverWorkoutIntent/i,
  /canTriggerAction/i,
  /raw\s+payload/i,
  /后台流程/,
];

// Agent tool 断言只关心单次 run 的工具选择、资源 id 和结果合同，不评判自然语言语义优劣。
export function evaluateAgentToolCallResult(input: {
  testCase: AgentToolCallCase;
  result: BlackboxTurnResult;
}): AgentToolAssertionResult {
  const { testCase, result } = input;
  const failures: Array<{
    level: AgentToolAssertionFailureLevel;
    reason: string;
    layer: "execution" | "tool" | "contract";
  }> = [];
  const expectation = testCase.expectation;
  const assistantText = result.assistantText.trim();

  if (result.error) {
    failures.push({
      level: "P0",
      layer: "execution",
      reason: `${result.error.code}: ${result.error.message}`,
    });
  }

  if (!assistantText) {
    failures.push({ level: "P0", layer: "execution", reason: "assistant 用户可见回复为空。" });
  }

  if (!result.agentDiagnostics.executionResultPresent) {
    failures.push({ level: "P0", layer: "execution", reason: "缺少 AgentExecutionResult。" });
  }

  if (expectation.requireDependencyGraph && !result.agentDiagnostics.dependencyGraphPresent) {
    failures.push({ level: "P0", layer: "execution", reason: "缺少 Agent dependencyGraph。" });
  }

  for (const pattern of internalLeakPatterns) {
    if (pattern.test(result.assistantText)) {
      failures.push({ level: "P0", layer: "execution", reason: `assistant 回复泄漏内部字段：${pattern.toString()}` });
    }
  }

  if (
    result.agentDiagnostics.status &&
    !expectation.expectedAgentStatuses.includes(result.agentDiagnostics.status)
  ) {
    failures.push({
      level: "P1",
      layer: "tool",
      reason: `Agent status 不匹配：期望 ${expectation.expectedAgentStatuses.join(" 或 ")}，实际 ${result.agentDiagnostics.status}`,
    });
  }

  failures.push(...evaluateCardTypes(testCase, result));
  failures.push(...evaluateToolEvidence(testCase, result));
  failures.push(...evaluateResultContract(testCase, result));

  const failureLevel = rankFailureLevel(failures.map((failure) => failure.level));
  const finalStatus = failureLevel
    ? failureLevel === "P3"
      ? "needs_review"
      : "failed"
    : "passed";

  return {
    executionStatus: failures.some((failure) => failure.layer === "execution") ? "failed" : "passed",
    toolStatus: failures.some((failure) => failure.layer === "tool") ? "failed" : "passed",
    contractStatus: failures.some((failure) => failure.layer === "contract") ? "failed" : "passed",
    finalStatus,
    failureLevel,
    failureReasons: failures.map((failure) => `[${failure.level}] ${failure.reason}`),
  };
}

export function assertAgentToolCallResult(input: {
  testCase: AgentToolCallCase;
  result: BlackboxTurnResult;
}) {
  const assertion = evaluateAgentToolCallResult(input);
  const context = {
    id: input.testCase.id,
    name: input.testCase.name,
    userInput: input.testCase.userInput,
    stateFixture: input.testCase.stateFixture,
    expectedAgentStatuses: input.testCase.expectation.expectedAgentStatuses,
    actualAgentStatus: input.result.agentDiagnostics.status,
    expectedCardTypes: input.testCase.expectation.expectedCardTypes,
    actualCardTypes: input.result.actionTypes,
    requiredAgentTools: input.testCase.expectation.requiredAgentTools,
    forbiddenAgentTools: input.testCase.expectation.forbiddenAgentTools,
    actualAgentTools: input.result.agentDiagnostics.toolNames,
    conversationId: input.result.conversationId,
    responseMessageId: input.result.responseMessageId,
    traceId: input.result.traceId,
    runnerError: input.result.error,
    agentDiagnostics: input.result.agentDiagnostics,
    assertion,
  };

  expect(assertion.finalStatus, JSON.stringify(context, null, 2)).toBe("passed");
}

export function previewAgentToolText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function evaluateCardTypes(
  testCase: AgentToolCallCase,
  result: BlackboxTurnResult,
): Array<{ level: AgentToolAssertionFailureLevel; reason: string; layer: "tool" }> {
  const failures: Array<{ level: AgentToolAssertionFailureLevel; reason: string; layer: "tool" }> = [];
  const expectation = testCase.expectation;
  const actualSet = new Set(result.actionTypes);
  const allowedSet = new Set([
    ...expectation.expectedCardTypes,
    ...(expectation.allowedCardTypes ?? []),
  ]);

  for (const expectedCardType of expectation.expectedCardTypes) {
    if (!actualSet.has(expectedCardType)) {
      failures.push({
        level: "P1",
        layer: "tool",
        reason: `缺少期望卡片类型：${expectedCardType}`,
      });
    }
  }

  if (allowedSet.size > 0) {
    const unexpectedCardTypes = result.actionTypes.filter((cardType) => !allowedSet.has(cardType));
    if (unexpectedCardTypes.length > 0) {
      failures.push({
        level: "P1",
        layer: "tool",
        reason: `出现未允许的卡片类型：${unexpectedCardTypes.join(", ")}`,
      });
    }
  }

  if (expectation.forbidTrainingCards) {
    const pushedTrainingCards = result.actionTypes.filter((cardType) => trainingCardTypes.has(cardType));
    if (pushedTrainingCards.length > 0) {
      failures.push({
        level: "P1",
        layer: "tool",
        reason: `预期无训练卡片，但出现：${pushedTrainingCards.join(", ")}`,
      });
    }
  }

  return failures;
}

function evaluateToolEvidence(
  testCase: AgentToolCallCase,
  result: BlackboxTurnResult,
): Array<{ level: AgentToolAssertionFailureLevel; reason: string; layer: "tool" }> {
  const failures: Array<{ level: AgentToolAssertionFailureLevel; reason: string; layer: "tool" }> = [];
  const expectation = testCase.expectation;

  for (const toolName of expectation.requiredAgentTools) {
    if (!result.agentDiagnostics.toolNames.includes(toolName)) {
      failures.push({
        level: "P1",
        layer: "tool",
        reason: `缺少必需 Agent tool 证据：${toolName}`,
      });
    }
  }

  for (const toolName of expectation.forbiddenAgentTools) {
    if (result.agentDiagnostics.toolNames.includes(toolName)) {
      failures.push({
        level: "P1",
        layer: "tool",
        reason: `出现禁用 Agent tool 或旧路径证据：${toolName}`,
      });
    }
  }

  if (expectation.requireLegacyPathDisabled) {
    const skip = result.agentDiagnostics.legacyPathSkip;
    if (!skip.intentFirst || !skip.normalize || !skip.summaryOnlyContext || !skip.referenceResolverFirst) {
      failures.push({
        level: "P1",
        layer: "tool",
        reason: "legacy path skip 未证明旧 intent-first / normalize / summary-only / ReferenceResolver-first 主路径均未参与执行。",
      });
    }
  }

  return failures;
}

function evaluateResultContract(
  testCase: AgentToolCallCase,
  result: BlackboxTurnResult,
): Array<{ level: AgentToolAssertionFailureLevel; reason: string; layer: "contract" }> {
  const failures: Array<{ level: AgentToolAssertionFailureLevel; reason: string; layer: "contract" }> = [];
  const expectation = testCase.expectation;

  if (expectation.requireCandidateSetId && result.agentDiagnostics.candidateSetIds.length === 0) {
    failures.push({ level: "P2", layer: "contract", reason: "缺少 candidateSetId 证据。" });
  }

  if (expectation.requireValidationId && result.agentDiagnostics.validationIds.length === 0) {
    failures.push({ level: "P2", layer: "contract", reason: "缺少 validationId 证据。" });
  }

  if (expectation.requirePolicyDecisionId && result.agentDiagnostics.policyDecisionIds.length === 0) {
    failures.push({ level: "P2", layer: "contract", reason: "缺少 policyDecisionId 证据。" });
  }

  if (expectation.requireRevisionId && result.agentDiagnostics.revisionIds.length === 0) {
    failures.push({ level: "P2", layer: "contract", reason: "缺少 revisionId 证据。" });
  }

  if (
    (result.agentDiagnostics.status === "generated" || result.agentDiagnostics.status === "patched") &&
    result.agentDiagnostics.toolResultIds.length === 0
  ) {
    failures.push({ level: "P2", layer: "contract", reason: "generated/patched 结果缺少 usedToolResultIds 回连证据。" });
  }

  if (
    typeof expectation.maxRepairTurnCount === "number" &&
    result.agentDiagnostics.repairTurnCount > expectation.maxRepairTurnCount
  ) {
    failures.push({
      level: "P2",
      layer: "contract",
      reason: `repairTurnCount 超过上限：期望 <= ${expectation.maxRepairTurnCount}，实际 ${result.agentDiagnostics.repairTurnCount}`,
    });
  }

  if (result.agentDiagnostics.unregisteredResourceReferences.length > 0) {
    failures.push({
      level: "P2",
      layer: "contract",
      reason: `存在未注册资源引用：${result.agentDiagnostics.unregisteredResourceReferences.join(", ")}`,
    });
  }

  if (result.agentDiagnostics.fusedFailureCount > 0) {
    failures.push({
      level: "P2",
      layer: "contract",
      reason: `存在 fused failure：${result.agentDiagnostics.fusedFailureCount}`,
    });
  }

  return failures;
}

function rankFailureLevel(levels: AgentToolAssertionFailureLevel[]) {
  if (levels.includes("P0")) return "P0";
  if (levels.includes("P1")) return "P1";
  if (levels.includes("P2")) return "P2";
  if (levels.includes("P3")) return "P3";
  return undefined;
}
