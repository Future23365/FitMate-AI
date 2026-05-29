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
import { aiPromptConfig } from "@/lib/server/ai/prompt-config";

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
        latestUserMessage: "",
      }).success,
    ).toBe(false);

    const preparedRequest = prepareAiChatRequest({
      latestUserMessage: "今天在家练胸 30 分钟",
      conversationSummary: "用户想在家练胸肌。",
      thinkingEnabled: false,
    });

    expect(preparedRequest.rawMessages).toHaveLength(1);
    expect(preparedRequest.messages).toEqual([{ role: "user", content: "今天在家练胸 30 分钟" }]);
    expect(preparedRequest.conversationSummaryContext.summary).toBe("用户想在家练胸肌。");
    expect(preparedRequest.thinkingEnabled).toBe(false);
    expect(preparedRequest.hasClientConversationSummary).toBe(true);
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

  it("documents explicit exercise list routines can use default duration", () => {
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "明确列出具体动作名称",
    );
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "missingActionFields 不要包含 sessionMinutes",
    );
    expect(aiPromptConfig.chatCompletion.system).toContain("按估算时长整理");
    expect(aiPromptConfig.chatCompletion.system).toContain("不要使用固定模板句");
    expect(aiPromptConfig.chatCompletion.system).not.toContain("你还没有告诉我具体训练时长");

    const chatIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: {
        ...routineIntent,
        goal: "把这批动作编成一套训练：卷腹、单腿臀桥、侧举腿、90/90 腘绳肌拉伸",
        sessionMinutes: 20,
        weeklyFrequency: 1,
      },
      requestedExerciseName: "",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };

    expect(resolveAssistantAction(chatIntent, createExerciseContext({ intent: chatIntent.workoutIntent }))).toMatchObject({
      action: "workout_routine",
      intent: {
        intentType: "routine",
        sessionMinutes: 20,
        weeklyFrequency: 1,
      },
    });
  });

  it("documents chat completion should follow structured session minutes", () => {
    expect(aiPromptConfig.chatCompletion.system).toContain(
      "如果 serverWorkoutIntent 中已有 sessionMinutes",
    );
    expect(aiPromptConfig.chatCompletion.system).toContain(
      "我先按 20 分钟整理这次训练",
    );
    expect(aiPromptConfig.chatCompletion.system).toContain(
      "如果 serverWorkoutIntent 没有明确 sessionMinutes",
    );
  });

  it("documents timed single-session requests must trigger routine composition", () => {
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "顶层 type 是服务端唯一触发意图",
    );
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "练腿，20分钟，没有器械",
    );
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "不得返回 exercise_recommendation",
    );

    const timedLegIntent = createWorkoutPlanIntent({
      intentType: "routine",
      goal: "练腿",
      sessionMinutes: 20,
      weeklyFrequency: 1,
      equipment: [],
    });
    const chatIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: timedLegIntent,
      requestedExerciseName: "",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };

    expect(resolveAssistantAction(chatIntent, createExerciseContext({ intent: timedLegIntent }))).toMatchObject({
      action: "workout_routine",
      intent: {
        intentType: "routine",
        goal: "练腿",
        sessionMinutes: 20,
        weeklyFrequency: 1,
      },
    });
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
