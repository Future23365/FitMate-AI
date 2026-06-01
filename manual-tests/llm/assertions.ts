import { expect } from "vitest";

import type { BlackboxTurnResult } from "./blackbox-runner";
import type { BlackboxFlowCase, BlackboxFlowTurn, BlackboxCardType } from "./flow-fixtures";

export type AssertionStatus = "passed" | "failed" | "skipped" | "needs_review";
export type AssertionFailureLevel = "P0" | "P1" | "P2" | "P3";

export type LayeredAssertionResult = {
  cardStatus: AssertionStatus;
  semanticStatus: AssertionStatus;
  finalStatus: AssertionStatus;
  failureLevel?: AssertionFailureLevel;
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
  /workout_(?:plan|routine)_trigger/i,
  /exercise_recommendation_trigger/i,
  /assistant_action/i,
  /serverParsedIntent/i,
  /serverWorkoutIntent/i,
  /canTriggerAction/i,
  /raw\s+payload/i,
  /后台流程/,
];

const unsafeReferenceFailurePatterns = [
  /没有安全读取到对应的动作详情/,
  /没有安全读取到.*动作详情/,
  /无法安全读取.*动作/,
];

// 分级断言先评估用户可见基础流程，再评估 fixture 声明的语义目标，报告可以区分卡片通过但语义失败。
export function evaluateBlackboxTurnResult(input: {
  flowCase: BlackboxFlowCase;
  turn: BlackboxFlowTurn;
  turnIndex: number;
  result: BlackboxTurnResult;
}): LayeredAssertionResult {
  const { turn, result } = input;
  const failures: Array<{ level: AssertionFailureLevel; reason: string; layer: "card" | "semantic" }> = [];
  const assistantText = result.assistantText.trim();

  if (result.error) {
    failures.push({
      level: "P0",
      layer: "card",
      reason: `${result.error.code}: ${result.error.message}`,
    });
  }

  if (!assistantText) {
    failures.push({ level: "P0", layer: "card", reason: "assistant 用户可见回复为空。" });
  }

  for (const pattern of internalLeakPatterns) {
    if (pattern.test(result.assistantText)) {
      failures.push({ level: "P0", layer: "card", reason: `assistant 回复泄漏内部字段：${pattern.toString()}` });
    }
  }

  failures.push(...evaluateCardTypes(turn, result));
  failures.push(...evaluateSemanticExpectations(turn, result));

  const cardFailures = failures.filter((failure) => failure.layer === "card");
  const semanticFailures = failures.filter((failure) => failure.layer === "semantic");
  const failureLevel = rankFailureLevel(failures.map((failure) => failure.level));
  const finalStatus = failureLevel
    ? failureLevel === "P3"
      ? "needs_review"
      : "failed"
    : "passed";

  return {
    cardStatus: cardFailures.length ? "failed" : "passed",
    semanticStatus: semanticFailures.length
      ? semanticFailures.every((failure) => failure.level === "P3")
        ? "needs_review"
        : "failed"
      : "passed",
    finalStatus,
    failureLevel,
    failureReasons: failures.map((failure) => `[${failure.level}] ${failure.reason}`),
  };
}

// Vitest 入口仍硬失败 P0-P2，避免真实回归被“需要复核”掩盖。
export function assertBlackboxTurnResult(input: {
  flowCase: BlackboxFlowCase;
  turn: BlackboxFlowTurn;
  turnIndex: number;
  result: BlackboxTurnResult;
}) {
  const assertion = evaluateBlackboxTurnResult(input);
  const assertionContext = {
    flowId: input.flowCase.id,
    flowName: input.flowCase.name,
    turnIndex: input.turnIndex,
    turnName: input.turn.name,
    userInput: input.turn.userInput,
    expectedCardTypes: input.turn.expectation.expectedCardTypes,
    actualCardTypes: input.result.actionTypes,
    conversationId: input.result.conversationId,
    responseMessageId: input.result.responseMessageId,
    traceId: input.result.traceId,
    runnerError: input.result.error,
    assistantPreview: previewText(input.result.assistantText, 240),
    artifactDiagnostics: input.result.artifactDiagnostics,
    assertion,
  };

  expect(assertion.finalStatus, JSON.stringify(assertionContext, null, 2)).toBe("passed");
}

function evaluateCardTypes(
  turn: BlackboxFlowTurn,
  result: BlackboxTurnResult,
): Array<{ level: AssertionFailureLevel; reason: string; layer: "card" }> {
  const failures: Array<{ level: AssertionFailureLevel; reason: string; layer: "card" }> = [];
  const actualSet = new Set(result.actionTypes);
  const allowedSet = new Set([
    ...turn.expectation.expectedCardTypes,
    ...(turn.expectation.allowedCardTypes ?? []),
  ]);

  for (const expectedCardType of turn.expectation.expectedCardTypes) {
    if (!actualSet.has(expectedCardType)) {
      failures.push({
        level: "P0",
        layer: "card",
        reason: `缺少期望卡片类型：${expectedCardType}`,
      });
    }
  }

  if (allowedSet.size > 0) {
    const unexpectedCardTypes = result.actionTypes.filter((cardType) => !allowedSet.has(cardType));
    if (unexpectedCardTypes.length > 0) {
      failures.push({
        level: "P0",
        layer: "card",
        reason: `出现未允许的卡片类型：${unexpectedCardTypes.join(", ")}`,
      });
    }
  }

  if (turn.expectation.forbidTrainingCards) {
    const pushedTrainingCards = result.actionTypes.filter((cardType) => trainingCardTypes.has(cardType));
    if (pushedTrainingCards.length > 0) {
      failures.push({
        level: "P0",
        layer: "card",
        reason: `预期无训练卡片，但出现：${pushedTrainingCards.join(", ")}`,
      });
    }
  }

  return failures;
}

function evaluateSemanticExpectations(
  turn: BlackboxFlowTurn,
  result: BlackboxTurnResult,
): Array<{ level: AssertionFailureLevel; reason: string; layer: "semantic" }> {
  const failures: Array<{ level: AssertionFailureLevel; reason: string; layer: "semantic" }> = [];
  const expectation = turn.expectation;
  const semanticLevel = expectation.semanticFailureLevel ?? "P1";
  const normalizedText = normalizeText(result.assistantText);

  if (
    (expectation.expectedReferenceStatus === "resolved" || expectation.expectedArtifactPayloadReadable) &&
    unsafeReferenceFailurePatterns.some((pattern) => pattern.test(result.assistantText))
  ) {
    failures.push({
      level: "P1",
      layer: "semantic",
      reason: "引用类回复未安全读取到动作详情。",
    });
  }

  if (expectation.expectedReferenceStatus === "resolved" && result.artifactDiagnostics.referenceResolutionStatus !== "resolved") {
    failures.push({
      level: semanticLevel,
      layer: "semantic",
      reason: "期望引用解析成功，但报告未记录 resolved referenceResolution。",
    });
  }

  if (expectation.expectedArtifactPayloadReadable && !result.artifactDiagnostics.payloadReadable) {
    failures.push({
      level: semanticLevel,
      layer: "semantic",
      reason: "期望读取真实 artifact payload，但报告未记录可读 payload。",
    });
  }

  if (expectation.mustIncludeAny?.length) {
    const matched = expectation.mustIncludeAny.some((keyword) => normalizedText.includes(normalizeText(keyword)));
    if (!matched) {
      failures.push({
        level: semanticLevel,
        layer: "semantic",
        reason: `回复未包含任一期望关键词：${expectation.mustIncludeAny.join(" / ")}`,
      });
    }
  }

  for (const keyword of expectation.mustNotIncludeAny ?? []) {
    if (normalizedText.includes(normalizeText(keyword))) {
      failures.push({
        level: semanticLevel,
        layer: "semantic",
        reason: `回复包含禁用关键词：${keyword}`,
      });
    }
  }

  return failures;
}

function rankFailureLevel(levels: AssertionFailureLevel[]) {
  if (levels.includes("P0")) {
    return "P0";
  }

  if (levels.includes("P1")) {
    return "P1";
  }

  if (levels.includes("P2")) {
    return "P2";
  }

  if (levels.includes("P3")) {
    return "P3";
  }

  return undefined;
}

export function previewText(content: string, maxLength: number) {
  const normalized = content.trim().replace(/\s+/g, " ");

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function normalizeText(content: string) {
  return content.trim().replace(/\s+/g, "").toLowerCase();
}
