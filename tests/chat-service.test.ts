import { describe, expect, it } from "vitest";

import {
  chatRequestSchema,
  createFallbackChatIntent,
  encodeChatStreamEvent,
  parseJsonObject,
  prepareAiChatRequest,
  resolveAssistantAction,
  resolveVisibleSuggestedReplies,
  type ChatIntent,
  type ExerciseContext,
} from "@/lib/server/chat/chat-service";

import { createConversationContext, createWorkoutPlanIntent } from "./fixtures/domain";

const routineIntent = createWorkoutPlanIntent();
const conversationContext = createConversationContext({ currentIntent: routineIntent });

function createExerciseContext(overrides: Partial<ExerciseContext> = {}): ExerciseContext {
  return {
    intent: overrides.intent ?? routineIntent,
    providedExercises: overrides.providedExercises ?? [
      {
        exerciseId: "push-up",
        nameZh: "俯卧撑",
        categoryZh: "力量",
        level: "beginner",
        equipmentZh: "自重",
        primaryMusclesZh: ["胸部"],
        secondaryMusclesZh: ["肱三头肌"],
        riskTags: [],
        goalTags: ["strength"],
        source: "primary",
      },
    ],
    candidateStatus: overrides.candidateStatus ?? "enough",
    relevantCandidateCount: overrides.relevantCandidateCount ?? 8,
    requiredRelevantCandidateCount: overrides.requiredRelevantCandidateCount ?? 4,
    warnings: overrides.warnings ?? [],
  };
}

describe("AI chat service deterministic boundaries", () => {
  it("validates input and prepares AI request context", () => {
    expect(
      chatRequestSchema.safeParse({
        messages: [{ role: "user", content: "" }],
      }).success,
    ).toBe(false);

    const preparedRequest = prepareAiChatRequest({
      messages: [
        { role: "user", content: "  今天在家练胸 30 分钟  " },
        { role: "assistant", content: "可以，我来整理。" },
      ],
      thinkingEnabled: false,
    });

    expect(preparedRequest.rawMessages).toHaveLength(2);
    expect(preparedRequest.messages).toHaveLength(2);
    expect(preparedRequest.thinkingEnabled).toBe(false);
    expect(preparedRequest.hasClientConversationContext).toBe(false);
  });

  it("resolves fallback intent, assistant action, and visible suggested replies", () => {
    const fallbackIntent = createFallbackChatIntent(
      [{ role: "user", content: "换一批动作" }],
      conversationContext,
    );
    expect(fallbackIntent.workoutIntent?.goal).toBe(routineIntent.goal);

    const chatIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: routineIntent,
      requestedExerciseName: "",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };
    const routineAction = resolveAssistantAction(chatIntent, createExerciseContext());
    expect(routineAction).toMatchObject({
      action: "workout_routine",
      intent: { weeklyFrequency: 1 },
    });
    expect(resolveAssistantAction(chatIntent, createExerciseContext({ candidateStatus: "insufficient" }))).toBeNull();
    expect(
      resolveVisibleSuggestedReplies(
        {
          ...chatIntent,
          canTriggerAction: false,
          suggestedReplies: ["我今天在家自重练 30 分钟"],
        },
        null,
      ),
    ).toEqual(["我今天在家自重练 30 分钟"]);
    expect(resolveVisibleSuggestedReplies({ ...chatIntent, suggestedReplies: ["补充信息"] }, routineAction)).toEqual([]);
  });

  it("parses fenced JSON and encodes NDJSON stream events", () => {
    const parsedJson = parseJsonObject("```json\n{\"ok\":true}\n```");
    const streamEvent = new TextDecoder().decode(
      encodeChatStreamEvent("done", "", { traceId: "trace-1" }),
    );

    expect(parsedJson).toMatchObject({ ok: true, value: { ok: true } });
    expect(streamEvent).toBe("{\"type\":\"done\",\"delta\":\"\",\"traceId\":\"trace-1\"}\n");
  });
});
