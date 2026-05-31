import { describe, expect, it } from "vitest";

import {
  chatRequestSchema,
  createFallbackChatIntent,
  encodeChatStreamEvent,
  formatReferencedExerciseExplanation,
  getActionBlockingMissingFields,
  getReferencedExerciseOrdinalIndex,
  isOrdinalExerciseExplanationMessage,
  normalizeChatIntentForBlackboxFlows,
  parseJsonObject,
  prepareAiChatRequest,
  resolveReferencedExerciseIdFromArtifactPayload,
  resolveAssistantAction,
  resolveVisibleSuggestedReplies,
  shouldUseReferenceResolutionForChat,
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
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "目标明确的纯动作推荐不得返回 suggestedReplies",
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
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
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

  it("normalizes today target-only chest requests to exercise recommendations", () => {
    const modelIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "今天我想练胸",
        sessionMinutes: 30,
        equipment: [],
      }),
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: ["equipmentOrLocation", "sessionMinutes"],
      suggestedReplies: ["我在家自重练胸", "我去健身房练胸"],
    };

    const normalized = normalizeChatIntentForBlackboxFlows({
      chatIntent: modelIntent,
      fallbackIntent: createFallbackChatIntent(
        [{ role: "user", content: "今天我想练胸" }],
        createEmptyConversationContext(),
      ),
      messages: [{ role: "user", content: "今天我想练胸" }],
      conversationSummaryContext: { summary: "", latestUserMessage: "今天我想练胸" },
      conversationContext: createEmptyConversationContext(),
      recentArtifactSummaries: [],
    });

    expect(normalized).toMatchObject({
      type: "exercise_recommendation",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    });
    expect(resolveAssistantAction(normalized, createExerciseContext({ intent: normalized.workoutIntent! }))).toMatchObject({
      action: "exercise_recommendation",
      intent: { goal: "练胸" },
    });
  });

  it("keeps standalone equipment facts from triggering training cards", () => {
    const modelIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "今天练点什么",
        sessionMinutes: 30,
        equipment: ["哑铃"],
      }),
      requestedExerciseName: "",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };

    const normalized = normalizeChatIntentForBlackboxFlows({
      chatIntent: modelIntent,
      fallbackIntent: createFallbackChatIntent(
        [{ role: "user", content: "我有哑铃" }],
        createEmptyConversationContext(),
      ),
      messages: [{ role: "user", content: "我有哑铃" }],
      conversationSummaryContext: { summary: "", latestUserMessage: "我有哑铃" },
      conversationContext: createEmptyConversationContext(),
      recentArtifactSummaries: [],
    });

    expect(normalized).toMatchObject({
      type: "general_fitness_advice",
      needsExerciseContext: false,
      canTriggerAction: false,
    });
    expect(resolveAssistantAction(normalized, createExerciseContext({ intent: modelIntent.workoutIntent }))).toBeNull();
  });

  it("inherits recent routine facts when normalizing duration adjustments", () => {
    const currentRoutine = createWorkoutPlanIntent({
      intentType: "routine",
      goal: "练背",
      sessionMinutes: 30,
      weeklyFrequency: 1,
      equipment: [],
      preferences: ["居家训练"],
    });
    const currentContext = createConversationContext({ currentIntent: currentRoutine });
    const modelIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "改成45分钟",
        sessionMinutes: 45,
      }),
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: ["goal", "equipmentOrLocation"],
      suggestedReplies: ["我想练背 45 分钟"],
    };

    const normalized = normalizeChatIntentForBlackboxFlows({
      chatIntent: modelIntent,
      fallbackIntent: createFallbackChatIntent(
        [{ role: "user", content: "改成45分钟" }],
        currentContext,
      ),
      messages: [{ role: "user", content: "改成45分钟" }],
      conversationSummaryContext: {
        summary: "用户刚生成了居家背部 30 分钟训练。",
        latestUserMessage: "改成45分钟",
      },
      conversationContext: currentContext,
      recentArtifactSummaries: [],
    });

    expect(normalized).toMatchObject({
      type: "routine",
      canTriggerAction: true,
      missingActionFields: [],
      workoutIntent: {
        goal: "练背",
        sessionMinutes: 45,
        preferences: ["居家训练"],
      },
    });
    expect(
      shouldUseReferenceResolutionForChat({
        latestUserMessage: "改成45分钟",
        chatIntent: normalized,
        conversationContext: currentContext,
        recentArtifactSummaries: [],
      }),
    ).toBe(false);
  });

  it("normalizes non-fitness recovery and six-day plan phrases", () => {
    const chestIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "那我今天练胸",
        sessionMinutes: 30,
      }),
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: ["equipmentOrLocation"],
      suggestedReplies: ["我在家练胸"],
    };

    const normalizedChest = normalizeChatIntentForBlackboxFlows({
      chatIntent: chestIntent,
      fallbackIntent: createFallbackChatIntent(
        [{ role: "user", content: "那我今天练胸" }],
        createEmptyConversationContext(),
      ),
      messages: [{ role: "user", content: "那我今天练胸" }],
      conversationSummaryContext: {
        summary: "上一轮用户问了非健身天气问题。",
        latestUserMessage: "那我今天练胸",
      },
      conversationContext: createEmptyConversationContext(),
      recentArtifactSummaries: [],
    });
    expect(normalizedChest.type).toBe("exercise_recommendation");
    expect(normalizedChest.canTriggerAction).toBe(true);

    const planIntent: ChatIntent = {
      type: "workout_plan",
      needsExerciseContext: true,
      workoutIntent: createWorkoutPlanIntent({
        intentType: "plan",
        goal: "6天训练计划",
        weeklyFrequency: 3,
      }),
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: ["equipmentOrLocation", "experience"],
      suggestedReplies: ["我在家练", "我去健身房练"],
    };
    const normalizedPlan = normalizeChatIntentForBlackboxFlows({
      chatIntent: planIntent,
      fallbackIntent: createFallbackChatIntent(
        [{ role: "user", content: "给我一个6天训练计划" }],
        createEmptyConversationContext(),
      ),
      messages: [{ role: "user", content: "给我一个6天训练计划" }],
      conversationSummaryContext: { summary: "", latestUserMessage: "给我一个6天训练计划" },
      conversationContext: createEmptyConversationContext(),
      recentArtifactSummaries: [],
    });

    expect(normalizedPlan).toMatchObject({
      type: "workout_plan",
      canTriggerAction: true,
      suggestedReplies: [],
    });
    expect(normalizedPlan.missingActionFields).toEqual([]);
    expect(normalizedPlan.workoutIntent?.weeklyFrequency).toBe(3);
  });

  it("keeps recommendation refinements as exercise recommendations", () => {
    const chestRecommendationIntent = createWorkoutPlanIntent({
      intentType: "routine",
      goal: "练胸",
      sessionMinutes: 30,
      equipment: ["哑铃"],
    });
    const currentContext = createConversationContext({ currentIntent: chestRecommendationIntent });
    const modelIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "练胸",
        sessionMinutes: 30,
        equipment: [],
      }),
      requestedExerciseName: "",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };

    const normalized = normalizeChatIntentForBlackboxFlows({
      chatIntent: modelIntent,
      fallbackIntent: createFallbackChatIntent(
        [{ role: "user", content: "推荐几个不用器械的" }],
        currentContext,
      ),
      messages: [{ role: "user", content: "推荐几个不用器械的" }],
      conversationSummaryContext: {
        summary: "用户最近已生成胸部动作推荐。",
        latestUserMessage: "推荐几个不用器械的",
      },
      conversationContext: currentContext,
      recentArtifactSummaries: [
        {
          artifactId: "rec-1",
          kind: "exercise_recommendation",
          title: "胸部动作推荐",
          exerciseIds: [],
          goals: ["练胸"],
          muscles: ["胸部"],
          equipment: ["哑铃"],
          updatedAt: "2026-05-31T00:00:00.000Z",
        },
      ],
    });

    expect(normalized).toMatchObject({
      type: "exercise_recommendation",
      canTriggerAction: true,
      missingActionFields: [],
      workoutIntent: {
        goal: "练胸",
        equipment: ["自重"],
        preferences: expect.arrayContaining(["无器械"]),
      },
    });
    expect(resolveAssistantAction(normalized, createExerciseContext({ intent: normalized.workoutIntent! }))).toMatchObject({
      action: "exercise_recommendation",
      intent: { goal: "练胸" },
    });
  });

  it("blocks under-specified weekly plans until core facts are provided", () => {
    const modelIntent: ChatIntent = {
      type: "workout_plan",
      needsExerciseContext: true,
      workoutIntent: createWorkoutPlanIntent({
        intentType: "plan",
        goal: "每周训练计划",
        sessionMinutes: 30,
        weeklyFrequency: 3,
      }),
      requestedExerciseName: "",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };

    const normalized = normalizeChatIntentForBlackboxFlows({
      chatIntent: modelIntent,
      fallbackIntent: createFallbackChatIntent(
        [{ role: "user", content: "给我一个每周训练计划" }],
        createEmptyConversationContext(),
      ),
      messages: [{ role: "user", content: "给我一个每周训练计划" }],
      conversationSummaryContext: { summary: "", latestUserMessage: "给我一个每周训练计划" },
      conversationContext: createEmptyConversationContext(),
      recentArtifactSummaries: [],
    });

    expect(normalized).toMatchObject({
      type: "workout_plan",
      canTriggerAction: false,
      missingActionFields: ["trainingGoal", "weeklyFrequency", "equipmentOrLocation"],
    });
    expect(normalized.suggestedReplies.length).toBeGreaterThan(0);
    expect(resolveAssistantAction(normalized, createExerciseContext({ intent: normalized.workoutIntent! }))).toBeNull();
  });

  it("inherits standalone equipment facts for the next complete routine request", () => {
    const equipmentOnlyContext = {
      ...createEmptyConversationContext(),
      summary: "用户有哑铃。",
      knownFacts: {
        ...createEmptyConversationContext().knownFacts,
        equipment: ["哑铃"],
        latestUserMessage: "我有哑铃",
      },
    };
    const modelIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "练胸",
        sessionMinutes: 30,
        equipment: [],
      }),
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: ["equipmentOrLocation"],
      suggestedReplies: ["我有哑铃"],
    };

    const normalized = normalizeChatIntentForBlackboxFlows({
      chatIntent: modelIntent,
      fallbackIntent: createFallbackChatIntent(
        [{ role: "user", content: "今天练胸30分钟" }],
        equipmentOnlyContext,
      ),
      messages: [{ role: "user", content: "今天练胸30分钟" }],
      conversationSummaryContext: { summary: "用户有哑铃。", latestUserMessage: "今天练胸30分钟" },
      conversationContext: equipmentOnlyContext,
      recentArtifactSummaries: [],
    });

    expect(normalized).toMatchObject({
      type: "routine",
      canTriggerAction: true,
      missingActionFields: [],
      workoutIntent: {
        goal: "练胸",
        sessionMinutes: 30,
        equipment: ["哑铃"],
      },
    });
    expect(resolveAssistantAction(normalized, createExerciseContext({ intent: normalized.workoutIntent! }))).toMatchObject({
      action: "workout_routine",
      intent: { goal: "练胸", equipment: ["哑铃"] },
    });
  });

  it("keeps weekly plan completion in plan context after frequency and duration are known", () => {
    const weeklyFactsContext = {
      ...createEmptyConversationContext(),
      summary: "用户想制定每周训练计划，已补充每周4练，每次45分钟。",
      knownFacts: {
        ...createEmptyConversationContext().knownFacts,
        sessionMinutes: 45,
        weeklyFrequency: 4,
        latestUserMessage: "每周4练，每次45分钟",
      },
    };
    const modelIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "增肌",
        sessionMinutes: 30,
        weeklyFrequency: 1,
        equipment: ["固定器械"],
        preferences: ["健身房训练"],
      }),
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: ["goal"],
      suggestedReplies: ["我想增肌"],
    };

    const normalized = normalizeChatIntentForBlackboxFlows({
      chatIntent: modelIntent,
      fallbackIntent: createFallbackChatIntent(
        [{ role: "user", content: "增肌，有健身房器械" }],
        weeklyFactsContext,
      ),
      messages: [{ role: "user", content: "增肌，有健身房器械" }],
      conversationSummaryContext: {
        summary: "用户想制定每周训练计划，已补充每周4练，每次45分钟。",
        latestUserMessage: "增肌，有健身房器械",
      },
      conversationContext: weeklyFactsContext,
      recentArtifactSummaries: [],
    });

    expect(normalized).toMatchObject({
      type: "workout_plan",
      canTriggerAction: true,
      workoutIntent: {
        intentType: "plan",
        goal: "增肌，有健身房器械",
        sessionMinutes: 45,
        weeklyFrequency: 4,
        equipment: ["固定器械"],
      },
    });
  });

  it("normalizes ordinal exercise explanations without triggering new training cards", () => {
    const modelIntent: ChatIntent = {
      type: "exercise_recommendation",
      needsExerciseContext: true,
      workoutIntent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "练胸",
        sessionMinutes: 20,
        weeklyFrequency: 1,
      }),
      requestedExerciseName: "",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };

    const normalized = normalizeChatIntentForBlackboxFlows({
      chatIntent: modelIntent,
      fallbackIntent: createFallbackChatIntent(
        [{ role: "user", content: "第一个动作怎么做" }],
        createConversationContext({
          currentIntent: createWorkoutPlanIntent({
            intentType: "routine",
            goal: "练胸",
            sessionMinutes: 20,
            weeklyFrequency: 1,
          }),
        }),
      ),
      messages: [{ role: "user", content: "第一个动作怎么做" }],
      conversationSummaryContext: {
        summary: "用户刚生成了 20 分钟胸部 routine。",
        latestUserMessage: "第一个动作怎么做",
      },
      conversationContext: createConversationContext({
        currentIntent: createWorkoutPlanIntent({
          intentType: "routine",
          goal: "练胸",
          sessionMinutes: 20,
          weeklyFrequency: 1,
        }),
      }),
      recentArtifactSummaries: [
        {
          artifactId: "routine-1",
          kind: "routine",
          title: "20分钟胸部训练",
          exerciseIds: ["push-up"],
          goals: ["练胸"],
          muscles: ["胸部"],
          equipment: ["自重"],
          sessionMinutes: 20,
          updatedAt: "2026-05-31T00:00:00.000Z",
        },
      ],
    });

    expect(isOrdinalExerciseExplanationMessage("第一个动作怎么做")).toBe(true);
    expect(normalized).toMatchObject({
      type: "exercise_explanation",
      needsExerciseContext: false,
      canTriggerAction: false,
      missingActionFields: [],
      suggestedReplies: [],
    });
    expect(resolveAssistantAction(normalized, createExerciseContext({ intent: modelIntent.workoutIntent! }))).toBeNull();
    expect(
      shouldUseReferenceResolutionForChat({
        latestUserMessage: "第一个动作怎么做",
        chatIntent: normalized,
        conversationContext: createEmptyConversationContext(),
        recentArtifactSummaries: [],
      }),
    ).toBe(true);
  });

  it("reads the referenced exercise from artifact payload display order", () => {
    const routinePayload = {
      kind: "routine" as const,
      title: "20分钟胸部训练",
      goal: "练胸",
      estimatedSessionMinutes: 20,
      trainingLoopRounds: 2,
      trainingLoopRestSeconds: 60,
      sections: [
        {
          section: "warmup" as const,
          title: "热身",
          items: [
            {
              section: "warmup" as const,
              exerciseId: "arm-circle",
              mode: "duration" as const,
              sets: 1,
              target: 45,
              setRestSeconds: 0,
              transitionRestSeconds: 20,
            },
          ],
        },
        {
          section: "training" as const,
          title: "主训练",
          items: [
            {
              section: "training" as const,
              exerciseId: "push-up",
              mode: "reps" as const,
              sets: 3,
              target: 10,
              setRestSeconds: 60,
              transitionRestSeconds: 30,
            },
          ],
        },
        {
          section: "stretch" as const,
          title: "拉伸",
          items: [
            {
              section: "stretch" as const,
              exerciseId: "chest-stretch",
              mode: "duration" as const,
              sets: 1,
              target: 40,
              setRestSeconds: 0,
              transitionRestSeconds: 0,
            },
          ],
        },
      ],
      safetyNotes: [],
    };

    expect(getReferencedExerciseOrdinalIndex("第2个动作怎么做")).toBe(1);
    expect(
      resolveReferencedExerciseIdFromArtifactPayload({
        payload: routinePayload,
        message: "第二个动作怎么做",
      }),
    ).toEqual({ exerciseId: "push-up", ordinalIndex: 1 });
    expect(
      formatReferencedExerciseExplanation({
        exercise: {
          id: "push-up",
          source: "manual",
          sourceUrl: "",
          sourceId: "push-up",
          license: "",
          nameEn: "Push-up",
          nameZh: "俯卧撑",
          category: "strength",
          categoryZh: "力量",
          level: "beginner",
          levelZh: "新手",
          force: "",
          forceZh: "",
          mechanic: "",
          mechanicZh: "",
          equipment: "bodyweight",
          equipmentZh: "自重",
          homeRequirement: "",
          homeRequirementZh: "",
          primaryMuscles: ["chest"],
          primaryMusclesZh: ["胸部"],
          secondaryMuscles: [],
          secondaryMusclesZh: [],
          instructionsEn: [],
          instructionsZh: ["双手撑地略宽于肩。", "身体保持一条直线。", "屈肘下降后推回起始位。"],
          images: [],
          imageUrls: [],
          allowedSections: ["training"],
          intensityRole: "strength",
          movementPattern: "push",
          difficulty: "beginner",
          riskTags: [],
          contraindications: [],
          regressionExerciseIds: [],
          progressionExerciseIds: [],
          substitutionGroupId: null,
          goalTags: [],
          embeddingText: null,
          embedding: null,
          reviewStatus: "human_reviewed",
          isPublished: true,
        },
        ordinalIndex: 1,
        artifactKind: "routine",
      }),
    ).toContain("第 2 个动作是俯卧撑");
  });

  it("keeps clarification replies instead of triggering exercise recommendations", () => {
    const muscleGainIntent = createWorkoutPlanIntent({
      intentType: "routine",
      goal: "增肌",
      experience: "beginner",
      sessionMinutes: 30,
      weeklyFrequency: 1,
      equipment: [],
      preferences: [],
    });
    const chatIntent: ChatIntent = {
      type: "exercise_recommendation",
      needsExerciseContext: true,
      workoutIntent: muscleGainIntent,
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: ["goal", "equipmentOrLocation", "sessionMinutes"],
      suggestedReplies: [
        "我今天想练增肌，20分钟，在家自重",
        "我去健身房练增肌，45分钟",
        "我想练上半身增肌，30分钟",
      ],
    };

    const action = resolveAssistantAction(chatIntent, createExerciseContext({ intent: muscleGainIntent }));

    expect(action).toBeNull();
    expect(resolveVisibleSuggestedReplies(chatIntent, action)).toEqual(chatIntent.suggestedReplies);
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

function createEmptyConversationContext() {
  return {
    summary: "",
    knownFacts: {
      equipment: [],
      injuryLimitations: [],
      preferences: [],
      avoidances: [],
    },
    unresolvedQuestions: [],
  };
}
