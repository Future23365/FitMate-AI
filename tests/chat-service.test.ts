import { describe, expect, it } from "vitest";

import {
  chatRequestSchema,
  createFallbackChatIntent,
  encodeChatStreamEvent,
  getActionBlockingMissingFields,
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

  it("treats multi-week repeat requests as workout plan actions", () => {
    const fallbackIntent = createFallbackChatIntent(
      [{ role: "user", content: "三周都练这个，一周三练" }],
      conversationContext,
    );

    expect(fallbackIntent.type).toBe("workout_plan");
    expect(fallbackIntent.workoutIntent?.intentType).toBe("plan");

    const conservativePlanIntent = createFallbackChatIntent(
      [{ role: "user", content: "改成一周四练但别太累" }],
      conversationContext,
    );
    expect(conservativePlanIntent.type).toBe("workout_plan");
    expect(conservativePlanIntent.workoutIntent?.weeklyFrequency).toBe(4);
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

  it("triggers exercise recommendations when only the target body part is clear", () => {
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "即使缺少器械、场地或训练时长",
    );
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "missingActionFields 不要包含 equipmentOrLocation 或 sessionMinutes",
    );

    const legRecommendationIntent = createWorkoutPlanIntent({
      intentType: "routine",
      goal: "练腿",
      sessionMinutes: 30,
      equipment: [],
      preferences: [],
    });
    const chatIntent: ChatIntent = {
      type: "exercise_recommendation",
      needsExerciseContext: true,
      workoutIntent: legRecommendationIntent,
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: ["equipmentOrLocation"],
      suggestedReplies: ["我今天在家用自重练腿"],
    };

    expect(resolveAssistantAction(chatIntent, createExerciseContext({ intent: legRecommendationIntent }))).toMatchObject({
      action: "exercise_recommendation",
      intent: {
        intentType: "routine",
        goal: "练腿",
      },
    });
    expect(
      resolveAssistantAction(
        chatIntent,
        createExerciseContext({ intent: legRecommendationIntent, candidateStatus: "insufficient" }),
      ),
    ).toBeNull();
    expect(resolveVisibleSuggestedReplies(chatIntent, resolveAssistantAction(chatIntent, createExerciseContext({ intent: legRecommendationIntent })))).toEqual([]);
  });

  it("ignores health-related missing fields when deriving assistant actions", () => {
    const weeklyPlanIntent = createWorkoutPlanIntent({
      intentType: "plan",
      goal: "居家自重练腿",
      sessionMinutes: 20,
      weeklyFrequency: 7,
      equipment: ["自重"],
    });
    const chatIntent: ChatIntent = {
      type: "workout_plan",
      needsExerciseContext: true,
      workoutIntent: weeklyPlanIntent,
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: ["goal", "injuryLimitations"],
      suggestedReplies: ["我没有额外信息"],
    };

    expect(getActionBlockingMissingFields(chatIntent.missingActionFields, weeklyPlanIntent)).toEqual([]);
    expect(resolveAssistantAction(chatIntent, createExerciseContext({ intent: weeklyPlanIntent }))).toMatchObject({
      action: "workout_plan",
      intent: {
        intentType: "plan",
        goal: "居家自重练腿",
        sessionMinutes: 20,
        weeklyFrequency: 7,
      },
    });
    expect(resolveVisibleSuggestedReplies(chatIntent, resolveAssistantAction(chatIntent, createExerciseContext({ intent: weeklyPlanIntent })))).toEqual([]);
  });

  it("uses default beginner experience when routine core fields are complete", () => {
    const noEquipmentRoutineIntent = createWorkoutPlanIntent({
      intentType: "routine",
      goal: "增肌",
      experience: "beginner",
      sessionMinutes: 30,
      weeklyFrequency: 3,
      equipment: [],
      preferences: ["无器械"],
    });
    const chatIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: noEquipmentRoutineIntent,
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: ["experience"],
      suggestedReplies: ["我是初学者"],
    };

    expect(getActionBlockingMissingFields(chatIntent.missingActionFields, noEquipmentRoutineIntent)).toEqual([]);
    expect(resolveAssistantAction(chatIntent, createExerciseContext({ intent: noEquipmentRoutineIntent }))).toMatchObject({
      action: "workout_routine",
      intent: {
        intentType: "routine",
        goal: "增肌",
        sessionMinutes: 30,
        weeklyFrequency: 1,
      },
    });
  });

  it("uses default beginner experience when plan core fields are complete", () => {
    const weeklyPlanIntent = createWorkoutPlanIntent({
      intentType: "plan",
      goal: "增肌",
      experience: "beginner",
      sessionMinutes: 30,
      weeklyFrequency: 3,
      equipment: [],
      preferences: ["无器械"],
    });
    const chatIntent: ChatIntent = {
      type: "workout_plan",
      needsExerciseContext: true,
      workoutIntent: weeklyPlanIntent,
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: ["experience", "injuryLimitations"],
      suggestedReplies: ["我是初学者", "我没有受伤限制"],
    };

    expect(getActionBlockingMissingFields(chatIntent.missingActionFields, weeklyPlanIntent)).toEqual([]);
    expect(resolveAssistantAction(chatIntent, createExerciseContext({ intent: weeklyPlanIntent }))).toMatchObject({
      action: "workout_plan",
      intent: {
        intentType: "plan",
        goal: "增肌",
        sessionMinutes: 30,
        weeklyFrequency: 3,
      },
    });
  });

  it("keeps non-health missing fields as action blockers", () => {
    const incompleteIntent = createWorkoutPlanIntent({
      intentType: "routine",
      goal: "",
      sessionMinutes: 0,
      equipment: [],
      preferences: [],
    });

    expect(getActionBlockingMissingFields(["goal", "sessionMinutes"], incompleteIntent)).toEqual([
      "goal",
      "sessionMinutes",
    ]);
  });

  it("does not let default beginner experience bypass candidate or core field blockers", () => {
    const incompleteIntent = createWorkoutPlanIntent({
      intentType: "routine",
      goal: "",
      experience: "beginner",
      sessionMinutes: 0,
      equipment: [],
      preferences: [],
    });
    const chatIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: incompleteIntent,
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: ["experience", "goal", "sessionMinutes"],
      suggestedReplies: ["我想先练 20 分钟全身"],
    };

    expect(getActionBlockingMissingFields(chatIntent.missingActionFields, incompleteIntent)).toEqual([
      "goal",
      "sessionMinutes",
    ]);
    expect(resolveAssistantAction(chatIntent, createExerciseContext({ intent: incompleteIntent }))).toBeNull();
    expect(
      resolveAssistantAction(
        { ...chatIntent, missingActionFields: ["experience"] },
        createExerciseContext({ intent: incompleteIntent, candidateStatus: "insufficient" }),
      ),
    ).toBeNull();
  });

  it("documents prompts do not ask for health checks", () => {
    const promptText = [
      aiPromptConfig.chatIntentResolution.system,
      aiPromptConfig.chatCompletion.system,
      aiPromptConfig.chatCompletion.exerciseContext,
      aiPromptConfig.exerciseRecommendationGeneration.system,
      aiPromptConfig.workoutPlanDraftGeneration.base.join("\n"),
      aiPromptConfig.workoutPlanDraftGeneration.schema.join("\n"),
    ].join("\n");

    expect(promptText).not.toContain("膝盖不适");
    expect(promptText).not.toContain("高风险健康");
    expect(promptText).not.toContain("咨询医生");
    expect(promptText).not.toContain("医疗诊断");
    expect(promptText).not.toContain("就医");
  });

  it("documents default beginner action trigger prompt boundaries", () => {
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "默认按 beginner / 简单训练推送",
    );
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "不要仅因为缺少经验把 experience 或 trainingExperience 放入 missingActionFields",
    );
    expect(aiPromptConfig.chatCompletion.system).toContain("serverAssistantAction.triggered");
    expect(aiPromptConfig.chatCompletion.system).toContain("blockingMissingFields");
    expect(aiPromptConfig.chatCompletion.system).toContain("不要把该默认值说成用户明确确认过的经验");
    expect(aiPromptConfig.chatContextSummarization.system).toContain("不要把系统默认值描述成用户明确提供的信息");
  });

  it("documents intent prompt must carry forward equipment and location facts", () => {
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "当前消息只补充其中一个字段时，必须把摘要中仍然有效的字段合并进 workoutIntent",
    );
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "在家、自重、徒手、无器械或没有可用设备",
    );
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "missingActionFields 不得包含 equipmentOrLocation",
    );
    expect(aiPromptConfig.chatCompletion.system).toContain(
      "当 serverAssistantAction.triggered 为 false，以上三条都不适用",
    );
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
