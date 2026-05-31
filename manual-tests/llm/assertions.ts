import { expect } from "vitest";

import type { BlackboxTurnResult } from "./blackbox-runner";
import type { BlackboxFlowCase, BlackboxFlowTurn, BlackboxCardType } from "./flow-fixtures";

const trainingCardTypes = new Set<BlackboxCardType>([
  "exercise_recommendation",
  "workout_routine",
  "workout_plan",
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

// 用户可见断言只验证回复能展示和卡片类型是否正确，避免把内部编排字段变成通过条件。
export function assertBlackboxTurnResult(input: {
  flowCase: BlackboxFlowCase;
  turn: BlackboxFlowTurn;
  turnIndex: number;
  result: BlackboxTurnResult;
}) {
  const { flowCase, turn, turnIndex, result } = input;
  const assertionContext = {
    flowId: flowCase.id,
    flowName: flowCase.name,
    turnIndex,
    turnName: turn.name,
    userInput: turn.userInput,
    expectedCardTypes: turn.expectation.expectedCardTypes,
    actualCardTypes: result.actionTypes,
    conversationId: result.conversationId,
    responseMessageId: result.responseMessageId,
    traceId: result.traceId,
    runnerError: result.error,
    assistantPreview: previewText(result.assistantText, 240),
  };

  expect(result.error, JSON.stringify(assertionContext, null, 2)).toBeUndefined();
  expect(result.assistantText.trim().length, JSON.stringify(assertionContext, null, 2)).toBeGreaterThan(0);

  for (const pattern of internalLeakPatterns) {
    expect(pattern.test(result.assistantText), JSON.stringify({
      ...assertionContext,
      leakPattern: pattern.toString(),
    }, null, 2)).toBe(false);
  }

  assertCardTypes({
    actualCardTypes: result.actionTypes,
    expectedCardTypes: turn.expectation.expectedCardTypes,
    allowedCardTypes: turn.expectation.allowedCardTypes,
    forbidTrainingCards: turn.expectation.forbidTrainingCards,
    assertionContext,
  });
}

function assertCardTypes(input: {
  actualCardTypes: BlackboxCardType[];
  expectedCardTypes: BlackboxCardType[];
  allowedCardTypes?: BlackboxCardType[];
  forbidTrainingCards: boolean;
  assertionContext: Record<string, unknown>;
}) {
  const actualSet = new Set(input.actualCardTypes);
  const allowedSet = new Set([
    ...input.expectedCardTypes,
    ...(input.allowedCardTypes ?? []),
  ]);

  for (const expectedCardType of input.expectedCardTypes) {
    expect(actualSet.has(expectedCardType), JSON.stringify(input.assertionContext, null, 2)).toBe(true);
  }

  if (allowedSet.size > 0) {
    const unexpectedCardTypes = input.actualCardTypes.filter((cardType) => !allowedSet.has(cardType));

    expect(unexpectedCardTypes, JSON.stringify({
      ...input.assertionContext,
      unexpectedCardTypes,
    }, null, 2)).toHaveLength(0);
  }

  if (input.forbidTrainingCards) {
    const pushedTrainingCards = input.actualCardTypes.filter((cardType) => trainingCardTypes.has(cardType));

    expect(pushedTrainingCards, JSON.stringify({
      ...input.assertionContext,
      pushedTrainingCards,
    }, null, 2)).toHaveLength(0);
  }
}

export function previewText(content: string, maxLength: number) {
  const normalized = content.trim().replace(/\s+/g, " ");

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}
