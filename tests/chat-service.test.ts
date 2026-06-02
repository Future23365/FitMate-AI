import { describe, expect, it } from "vitest";

import {
  chatRequestSchema,
  buildChatArtifactStreamEvents,
  createResolvedChatIntent,
  createFallbackChatIntent,
  deriveChatIntentFromResolvedIntent,
  encodeChatStreamEvent,
  formatReferencedExerciseExplanation,
  getActionBlockingMissingFields,
  getReferencedExerciseOrdinalIndex,
  isOrdinalExerciseExplanationMessage,
  normalizeAssistantSuggestions,
  applyChatIntentContractNormalization,
  parseChatIntentModelOutput,
  parseJsonObject,
  prepareAiChatRequest,
  resolveReferencedExerciseIdFromArtifactPayload,
  resolveAssistantAction,
  resolveAssistantSuggestions,
  resolveVisibleSuggestedReplies,
  shouldUseReferenceResolutionForChat,
  toExerciseRecommendationCandidatesFromContext,
  validateResolvedIntentGate,
  type ChatIntent,
  type ExerciseContext,
} from "@/lib/server/chat/chat-service";
import { aiPromptConfig } from "@/lib/server/ai/prompt-config";

import { createChatConversation, createConversationContext, createWorkoutPlanIntent } from "./fixtures/domain";

const routineIntent = createWorkoutPlanIntent();
const conversationContext = createConversationContext({ currentIntent: routineIntent });

function createExerciseContext(overrides: Partial<ExerciseContext> = {}): ExerciseContext {
  return {
    intent: overrides.intent ?? routineIntent,
    providedExercises: overrides.providedExercises ?? [
      {
        exercise: createTestExercise(),
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

function createTestExercise(
  overrides: Partial<ExerciseContext["providedExercises"][number]["exercise"]> = {},
): ExerciseContext["providedExercises"][number]["exercise"] {
  return {
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
    secondaryMuscles: ["triceps"],
    secondaryMusclesZh: ["肱三头肌"],
    instructionsEn: [],
    instructionsZh: [],
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
    goalTags: ["strength"],
    embeddingText: null,
    embedding: null,
    reviewStatus: "human_reviewed",
    isPublished: true,
    ...overrides,
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

  it("hydrates saved conversation context before client fallback context", () => {
    const savedIntent = createWorkoutPlanIntent({
      intentType: "plan",
      goal: "增肌",
      sessionMinutes: 45,
      weeklyFrequency: 4,
      equipment: ["固定器械"],
      preferences: ["健身房训练"],
    });
    const clientIntent = createWorkoutPlanIntent({
      intentType: "routine",
      goal: "练胸",
      sessionMinutes: 20,
      weeklyFrequency: 1,
      equipment: ["自重"],
    });
    const savedConversation = createChatConversation({
      id: "conversation-1",
      messages: [
        { id: "u1", role: "user", content: "给我一个每周训练计划" },
        { id: "a1", role: "assistant", content: "请补充周频、时长、目标和器械。" },
        { id: "u2", role: "user", content: "每周4练，每次45分钟" },
      ],
      conversationContext: createConversationContext({
        currentIntent: savedIntent,
        knownFacts: {
          goal: "增肌",
          experience: "beginner",
          sessionMinutes: 45,
          weeklyFrequency: 4,
          equipment: ["固定器械"],
          injuryLimitations: [],
          preferences: ["健身房训练"],
          avoidances: [],
        },
      }),
      recommendationIntents: { a1: savedIntent },
      conversationSummary: { summary: "用户要每周4练，每次45分钟的增肌计划。" },
    });

    const preparedRequest = prepareAiChatRequest(
      {
        conversationId: "conversation-1",
        latestUserMessage: "增肌，有健身房器械",
        conversationSummary: "客户端空摘要不可信。",
        conversationContext: createConversationContext({ currentIntent: clientIntent }),
      },
      {
        savedConversation,
        recentArtifactSummaries: [
          {
            artifactId: "plan-1",
            kind: "plan",
            title: "增肌计划",
            exerciseIds: ["push-up"],
            goals: ["增肌"],
            muscles: ["胸部"],
            equipment: ["固定器械"],
            sessionMinutes: 45,
            weeklyFrequency: 4,
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
    );

    expect(preparedRequest.hydration).toMatchObject({
      source: "server_saved",
      savedConversationFound: true,
      restoredMessageCount: 4,
      hasSavedConversationContext: true,
      hasClientConversationContext: true,
      recommendationIntentCount: 1,
      recentArtifactCount: 1,
    });
    expect(preparedRequest.rawMessages.at(-1)).toEqual({ role: "user", content: "增肌，有健身房器械" });
    expect(preparedRequest.conversationSummaryContext.summary).toBe("用户要每周4练，每次45分钟的增肌计划。");
    expect(preparedRequest.internalConversationContext.currentIntent).toMatchObject({
      intentType: "plan",
      weeklyFrequency: 4,
      sessionMinutes: 45,
    });
  });

  it("resolves fallback intent, assistant action, and visible suggested replies", () => {
    const fallbackIntent = createFallbackChatIntent(
      [{ role: "user", content: "换一批动作" }],
      conversationContext,
    );
    expect(fallbackIntent).toMatchObject({
      type: "general_fitness_advice",
      needsExerciseContext: false,
      canTriggerAction: false,
      action: {
        kind: "none",
        shouldTrigger: false,
      },
    });
    expect(fallbackIntent.workoutIntent).toBeUndefined();

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

  it("preserves suggested replies when a greeting intent returns workoutIntent null", () => {
    const fallbackIntent = createFallbackChatIntent(
      [{ role: "user", content: "你好" }],
      createEmptyConversationContext(),
    );
    const parsed = parseChatIntentModelOutput(
      {
        type: "general_fitness_advice",
        needsExerciseContext: false,
        workoutIntent: null,
        requestedExerciseName: "",
        canTriggerAction: false,
        missingActionFields: ["goal", "equipmentOrLocation"],
        responseMode: "ask_clarification",
        suggestedReplies: [
          "我想减脂，在家自重练，每周3次每次30分钟",
          "我想增肌，有健身房器械，每周4次",
        ],
        action: {
          kind: "none",
          shouldTrigger: false,
          blockingMissingFields: ["goal", "equipmentOrLocation"],
        },
      },
      fallbackIntent,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.intent.workoutIntent).toBeUndefined();
    expect(parsed.diagnostics.normalizedWorkoutIntentNull).toBe(true);
    expect(parsed.intent.suggestedReplies).toEqual([
      "我想减脂，在家自重练，每周3次每次30分钟",
      "我想增肌，有健身房器械，每周4次",
    ]);
    expect(resolveAssistantAction(parsed.intent, null)).toBeNull();
    expect(resolveVisibleSuggestedReplies(parsed.intent, null)).toEqual(parsed.intent.suggestedReplies);

    const streamEvent = new TextDecoder().decode(
      encodeChatStreamEvent("suggested_replies", "", {
        suggestedReplies: resolveVisibleSuggestedReplies(parsed.intent, null),
      }),
    );
    expect(streamEvent).toContain("\"type\":\"suggested_replies\"");
    expect(streamEvent).toContain("我想减脂，在家自重练，每周3次每次30分钟");
  });

  it("adds starter assistant suggestions for first-turn greetings when the model returns none", () => {
    const modelIntent: ChatIntent = {
      type: "general_fitness_advice",
      needsExerciseContext: false,
      requestedExerciseName: "",
      canTriggerAction: false,
      missingActionFields: [],
      suggestedReplies: [],
    };

    const normalized = applyChatIntentContractNormalization({
      chatIntent: modelIntent,
      messages: [{ role: "user", content: "你好" }],
      conversationSummaryContext: { summary: "", latestUserMessage: "你好" },
      conversationContext: createEmptyConversationContext(),
      recentArtifactSummaries: [],
    });
    const suggestions = resolveAssistantSuggestions({
      chatIntent: normalized,
      assistantAction: null,
      artifactResult: null,
    }).assistantSuggestions;

    expect(suggestions).toEqual([
      expect.objectContaining({
        label: "肩膀徒手动作",
        message: "我想练一练肩膀，居家徒手推荐几个动作",
        kind: "next_action",
        blocking: false,
        source: "intent",
      }),
      expect.objectContaining({
        label: "20 分钟哑铃全身",
        message: "今天有 20 分钟，家里有哑铃，来一次全身训练",
      }),
      expect.objectContaining({
        label: "每周 4 天增肌计划",
        message: "想制定一个每周练 4 天的增肌计划",
      }),
    ]);
  });

  it("normalizes legacy suggested replies into assistantSuggestions", () => {
    const normalized = normalizeAssistantSuggestions([
      {
        source: "intent",
        sourceField: "suggestedReplies",
        kind: "clarification",
        blocking: true,
        values: ["我在家自重练 30 分钟", "我在家自重练 30 分钟"],
      },
    ]);

    expect(normalized.assistantSuggestions).toEqual([
      {
        label: "我在家自重练 30 分钟",
        message: "我在家自重练 30 分钟",
        kind: "clarification",
        blocking: true,
        source: "intent",
      },
    ]);
    expect(normalized.diagnostics.finalCount).toBe(1);
  });

  it("filters assistant-tone suggestions before they become visible chips", () => {
    const normalized = normalizeAssistantSuggestions([
      {
        source: "intent",
        sourceField: "assistantSuggestions",
        kind: "clarification",
        blocking: true,
        values: ["请重新说明你的训练目标、时间和器械条件", "我在家自重练 30 分钟全身"],
      },
    ]);

    expect(normalized.assistantSuggestions.map((suggestion) => suggestion.message)).toEqual([
      "我在家自重练 30 分钟全身",
    ]);
    expect(normalized.diagnostics.filtered).toEqual([
      expect.objectContaining({
        message: "请重新说明你的训练目标、时间和器械条件",
        reason: "assistant_instruction_tone",
      }),
    ]);
  });

  it("emits unified assistant_suggestions events while preserving legacy suggested_replies payloads", () => {
    const assistantSuggestions = normalizeAssistantSuggestions([
      {
        source: "intent",
        sourceField: "suggestedReplies",
        kind: "clarification",
        blocking: true,
        values: ["我想先在家自重练 20 分钟"],
      },
    ]).assistantSuggestions;
    const unifiedEvent = new TextDecoder().decode(
      encodeChatStreamEvent("assistant_suggestions", "", { assistantSuggestions }),
    );
    const legacyEvent = new TextDecoder().decode(
      encodeChatStreamEvent("suggested_replies", "", {
        suggestedReplies: assistantSuggestions.map((suggestion) => suggestion.message),
      }),
    );

    expect(unifiedEvent).toContain("\"type\":\"assistant_suggestions\"");
    expect(unifiedEvent).toContain("\"assistantSuggestions\"");
    expect(legacyEvent).toContain("\"type\":\"suggested_replies\"");
    expect(legacyEvent).toContain("我想先在家自重练 20 分钟");
  });

  it("returns next action suggestions after successful exercise recommendations", () => {
    const chatIntent: ChatIntent = {
      type: "exercise_recommendation",
      needsExerciseContext: true,
      workoutIntent: routineIntent,
      requestedExerciseName: "",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };
    const normalized = resolveAssistantSuggestions({
      chatIntent,
      assistantAction: resolveAssistantAction(chatIntent, createExerciseContext()),
      artifactResult: {
        status: "success",
        kind: "exercise_recommendation",
        payload: {
          title: "练胸动作推荐",
          goal: "练胸",
          items: [
            {
              exerciseId: "push-up",
              nameZh: "俯卧撑",
              categoryZh: "力量",
              levelZh: "新手",
              equipmentZh: "自重",
              primaryMusclesZh: ["胸部"],
              secondaryMusclesZh: ["肱三头肌"],
              reasons: ["匹配胸部推类训练"],
            },
          ],
          safetyNotes: [],
        },
        intent: routineIntent,
        assistantSuggestions: [
          {
            label: "生成训练",
            message: "按这些动作生成 30 分钟训练",
            kind: "next_action",
            blocking: false,
            source: "exercise_recommendation",
          },
        ],
      },
    });

    expect(normalized.assistantSuggestions).toEqual([
      expect.objectContaining({
        message: "按这些动作生成 30 分钟训练",
        kind: "next_action",
        blocking: false,
        source: "exercise_recommendation",
      }),
    ]);
  });

  it("blocks executable intents when workoutIntent is missing or invalid", () => {
    const fallbackIntent = createFallbackChatIntent(
      [{ role: "user", content: "给我安排一套训练" }],
      createEmptyConversationContext(),
    );
    const parsed = parseChatIntentModelOutput(
      {
        type: "routine",
        needsExerciseContext: true,
        workoutIntent: null,
        requestedExerciseName: "",
        canTriggerAction: true,
        missingActionFields: [],
        responseMode: "generate_directly",
        suggestedReplies: ["我在家自重练 30 分钟"],
        action: {
          kind: "workout_routine",
          shouldTrigger: true,
          blockingMissingFields: [],
        },
      },
      fallbackIntent,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.intent.canTriggerAction).toBe(false);
    expect(parsed.intent.needsExerciseContext).toBe(false);
    expect(parsed.intent.missingActionFields).toContain("workoutIntent");
    expect(parsed.diagnostics.executionBlockedReason).toBe("executable_intent_missing_valid_workoutIntent");
    expect(resolveAssistantAction(parsed.intent, createExerciseContext())).toBeNull();
    expect(resolveVisibleSuggestedReplies(parsed.intent, null)).toEqual(["我在家自重练 30 分钟"]);
  });

  it("filters invalid structured suggested replies without deriving buttons from body text", () => {
    const fallbackIntent = createFallbackChatIntent(
      [{ role: "user", content: "你好" }],
      createEmptyConversationContext(),
    );
    const parsed = parseChatIntentModelOutput(
      {
        type: "general_fitness_advice",
        needsExerciseContext: false,
        workoutIntent: null,
        requestedExerciseName: "",
        canTriggerAction: false,
        missingActionFields: [],
        responseMode: "answer_only",
        suggestedReplies: [
          "",
          "这次大概多久？",
          123,
          "我想先在家自重练 20 分钟",
          "x".repeat(121),
        ],
      },
      fallbackIntent,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.intent.suggestedReplies).toEqual(["我想先在家自重练 20 分钟"]);
    expect(parsed.diagnostics.suggestedReplies.droppedCount).toBe(4);
    expect(resolveAssistantAction(parsed.intent, null)).toBeNull();

    const bodyOnlyIntent = parseChatIntentModelOutput(
      {
        type: "general_fitness_advice",
        needsExerciseContext: false,
        workoutIntent: null,
        requestedExerciseName: "",
        canTriggerAction: false,
        missingActionFields: [],
        responseMode: "answer_only",
        suggestedReplies: [],
      },
      fallbackIntent,
    );
    expect(bodyOnlyIntent.ok).toBe(true);
    if (!bodyOnlyIntent.ok) {
      return;
    }
    expect(resolveVisibleSuggestedReplies(bodyOnlyIntent.intent, null)).toEqual([]);
  });

  it("derives a resolved intent contract and blocks clarification/action conflicts", () => {
    const chatIntent: ChatIntent = {
      type: "workout_plan",
      needsExerciseContext: true,
      workoutIntent: createWorkoutPlanIntent({ intentType: "plan", weeklyFrequency: 3 }),
      requestedExerciseName: "",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };
    const action = resolveAssistantAction(
      chatIntent,
      createExerciseContext({ intent: chatIntent.workoutIntent }),
    );
    const resolved = createResolvedChatIntent({
      chatIntent,
      exerciseContext: createExerciseContext({ intent: chatIntent.workoutIntent }),
      assistantAction: action,
      referenceResolution: null,
    });

    expect(resolved).toMatchObject({
      type: "workout_plan",
      action: { kind: "workout_plan", shouldTrigger: true },
      responseMode: "generate_directly",
      workoutIntent: { intentType: "plan", weeklyFrequency: 3 },
    });
    expect(validateResolvedIntentGate(resolved)).toEqual({ valid: true, violations: [] });

    const conflicting = {
      ...resolved,
      responseMode: "ask_clarification" as const,
      missingActionFields: ["goal"],
    };
    expect(validateResolvedIntentGate(conflicting)).toMatchObject({
      valid: false,
      violations: expect.arrayContaining([
        "responseMode=ask_clarification conflicts with action.shouldTrigger=true",
        "missingActionFields must be empty when action.shouldTrigger=true",
      ]),
    });
    expect(deriveChatIntentFromResolvedIntent(chatIntent, {
      ...resolved,
      action: { kind: "none", shouldTrigger: false, blockingMissingFields: ["goal"] },
      responseMode: "ask_clarification",
      missingActionFields: ["goal"],
      clarificationReplies: ["我想增肌，每周 3 练"],
    })).toMatchObject({
      canTriggerAction: false,
      missingActionFields: ["goal"],
      suggestedReplies: ["我想增肌，每周 3 练"],
    });
  });

  it("blocks reference-dependent actions when reference resolution is unavailable", () => {
    const chatIntent: ChatIntent = {
      type: "exercise_explanation",
      needsExerciseContext: false,
      requestedExerciseName: "",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
      action: {
        kind: "exercise_explanation",
        shouldTrigger: true,
        blockingMissingFields: [],
      },
    };
    const resolved = createResolvedChatIntent({
      chatIntent,
      exerciseContext: null,
      assistantAction: {
        action: "exercise_explanation",
        intent: createWorkoutPlanIntent(),
      },
      referenceResolution: {
        status: "not_found",
        confidence: "low",
        reason: "没有可用历史训练",
        candidates: [],
      },
    });

    expect(validateResolvedIntentGate(resolved)).toMatchObject({
      valid: false,
      violations: expect.arrayContaining([
        "referenceRequirement is required but referenceResolution is not_found",
      ]),
    });
  });

  it("restores exercise_replacement action kind and reference requirement from a conflicting model action", () => {
    const chatIntent: ChatIntent = {
      type: "exercise_replacement",
      needsExerciseContext: false,
      requestedExerciseName: "俯卧撑",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
      action: {
        kind: "none",
        shouldTrigger: false,
        blockingMissingFields: [],
      },
      responseMode: "answer_only",
    };

    const resolved = createResolvedChatIntent({
      chatIntent,
      exerciseContext: null,
      assistantAction: null,
      referenceResolution: null,
    });

    expect(resolved).toMatchObject({
      type: "exercise_replacement",
      action: { kind: "exercise_replacement" },
      responseMode: "ask_clarification",
      referenceRequirement: {
        required: true,
        allowedArtifactKinds: ["exercise_recommendation", "routine", "plan"],
      },
    });
    expect(validateResolvedIntentGate(resolved)).toMatchObject({
      valid: false,
      violations: expect.arrayContaining([
        "referenceRequirement is required but referenceResolution is missing",
      ]),
    });
    expect(deriveChatIntentFromResolvedIntent(chatIntent, resolved)).toMatchObject({
      type: "exercise_replacement",
      action: { kind: "exercise_replacement" },
      responseMode: "ask_clarification",
    });
  });

  it("builds artifact stream events without sending card payload before final reply completion", () => {
    const intent = createWorkoutPlanIntent({ intentType: "routine" });
    const events = buildChatArtifactStreamEvents({
      status: "success",
      kind: "exercise_recommendation",
      payload: {
        title: "动作推荐",
        goal: "练胸",
        items: [
          {
            exerciseId: "push-up",
            nameZh: "俯卧撑",
            categoryZh: "力量",
            levelZh: "新手",
            equipmentZh: "自重",
            primaryMusclesZh: ["胸部"],
            secondaryMusclesZh: ["肱三头肌"],
            reasons: ["匹配目标"],
          },
        ],
        safetyNotes: [],
      },
      intent,
    });

    expect(events.map((event) => event.type)).toEqual(["artifact_validated", "artifact"]);
  });

  it("keeps full exercise facts for exercise recommendation artifacts", () => {
    const exerciseWithoutImage = createTestExercise({
      id: "bodyweight-chest-press",
      nameZh: "自重胸推",
      imageUrls: [],
    });
    const exerciseContext = createExerciseContext({
      providedExercises: [
        {
          exercise: exerciseWithoutImage,
          exerciseId: exerciseWithoutImage.id,
          nameZh: exerciseWithoutImage.nameZh,
          categoryZh: exerciseWithoutImage.categoryZh ?? "训练",
          level: exerciseWithoutImage.level ?? "beginner",
          equipmentZh: exerciseWithoutImage.equipmentZh ?? "未标注器械",
          primaryMusclesZh: exerciseWithoutImage.primaryMusclesZh,
          secondaryMusclesZh: exerciseWithoutImage.secondaryMusclesZh,
          riskTags: exerciseWithoutImage.riskTags,
          goalTags: exerciseWithoutImage.goalTags,
          matchingReasons: ["匹配胸部目标"],
          source: "primary",
        },
      ],
    });

    const candidates = toExerciseRecommendationCandidatesFromContext(exerciseContext);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].exercise).toBe(exerciseWithoutImage);
    expect(candidates[0].exercise.imageUrls).toEqual([]);
    expect(candidates[0].reasons).toEqual(["匹配胸部目标"]);
  });

  it("keeps fallback intent non-executable even for action-like phrasing", () => {
    const fallbackIntent = createFallbackChatIntent(
      [{ role: "user", content: "三周都练这个，一周三练" }],
      conversationContext,
    );

    expect(fallbackIntent.type).toBe("general_fitness_advice");
    expect(fallbackIntent.canTriggerAction).toBe(false);
    expect(resolveAssistantAction(fallbackIntent, createExerciseContext())).toBeNull();

    const conservativePlanIntent = createFallbackChatIntent(
      [{ role: "user", content: "改成一周四练但别太累" }],
      conversationContext,
    );
    expect(conservativePlanIntent.type).toBe("general_fitness_advice");
    expect(conservativePlanIntent.canTriggerAction).toBe(false);
    expect(resolveAssistantAction(conservativePlanIntent, createExerciseContext())).toBeNull();
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
      "今天在家练背30分钟",
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

  it("does not rewrite model type or action from keyword-like user text", () => {
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
      action: {
        kind: "workout_routine",
        shouldTrigger: false,
        blockingMissingFields: ["equipmentOrLocation", "sessionMinutes"],
      },
    };

    const normalized = applyChatIntentContractNormalization({
      chatIntent: modelIntent,
      messages: [{ role: "user", content: "今天我想练胸" }],
      conversationSummaryContext: { summary: "", latestUserMessage: "今天我想练胸" },
      conversationContext: createEmptyConversationContext(),
      recentArtifactSummaries: [],
    });

    expect(normalized).toEqual(modelIntent);
    expect(resolveAssistantAction(normalized, createExerciseContext({ intent: normalized.workoutIntent! }))).toMatchObject({
      action: "workout_routine",
    });
  });

  it("allows reference actions without workoutIntent and keeps their action kind", () => {
    const fallbackIntent = createFallbackChatIntent(
      [{ role: "user", content: "跳绳换成别的" }],
      conversationContext,
    );
    const parsed = parseChatIntentModelOutput(
      {
        type: "exercise_replacement",
        needsExerciseContext: false,
        workoutIntent: null,
        requestedExerciseName: "跳绳",
        canTriggerAction: true,
        missingActionFields: [],
        suggestedReplies: [],
        action: {
          kind: "exercise_replacement",
          shouldTrigger: true,
          blockingMissingFields: [],
        },
        referenceRequirement: {
          required: true,
          reason: "替换已有训练中的目标动作",
          allowedArtifactKinds: ["routine", "plan"],
        },
      },
      fallbackIntent,
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.intent.type).toBe("exercise_replacement");
    expect(parsed.intent.action?.kind).toBe("exercise_replacement");
    expect(parsed.intent.workoutIntent).toBeUndefined();
    expect(parsed.intent.missingActionFields).not.toContain("workoutIntent");
    expect(parsed.diagnostics.executionBlockedReason).toBeUndefined();
    expect(resolveAssistantAction(parsed.intent, createExerciseContext())).toBeNull();
    expect(
      shouldUseReferenceResolutionForChat({
        latestUserMessage: "跳绳换成别的",
        chatIntent: parsed.intent,
        conversationContext,
        recentArtifactSummaries: [],
      }),
    ).toBe(true);
  });

  it("does not let patch keywords route generating actions into ReferenceResolver", () => {
    const modelIntent: ChatIntent = {
      type: "routine",
      needsExerciseContext: true,
      workoutIntent: createWorkoutPlanIntent({
        intentType: "routine",
        goal: "腿部训练",
        sessionMinutes: 30,
      }),
      requestedExerciseName: "",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
      action: {
        kind: "workout_routine",
        shouldTrigger: true,
        blockingMissingFields: [],
      },
    };

    expect(
      shouldUseReferenceResolutionForChat({
        latestUserMessage: "把第二天换简单点",
        chatIntent: modelIntent,
        conversationContext,
        recentArtifactSummaries: [
          {
            artifactId: "plan-1",
            kind: "plan",
            title: "每周计划",
            exerciseIds: ["Rope_Jumping"],
            goals: ["减脂"],
            muscles: ["全身"],
            equipment: ["自重"],
            weeklyFrequency: 3,
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      }),
    ).toBe(false);
  });

  it("uses model-owned exercise explanation actions for reference resolution", () => {
    const modelIntent: ChatIntent = {
      type: "exercise_explanation",
      needsExerciseContext: false,
      workoutIntent: undefined,
      requestedExerciseName: "",
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
      action: {
        kind: "exercise_explanation",
        shouldTrigger: true,
        blockingMissingFields: [],
      },
      referenceRequirement: {
        required: true,
        allowedArtifactKinds: ["exercise_recommendation", "routine", "plan"],
      },
    };

    const normalized = applyChatIntentContractNormalization({
      chatIntent: modelIntent,
      messages: [{ role: "user", content: "第一个动作怎么做" }],
      conversationSummaryContext: { summary: "用户刚生成了 20 分钟胸部 routine。", latestUserMessage: "第一个动作怎么做" },
      conversationContext: conversationContext,
      recentArtifactSummaries: [],
    });

    expect(isOrdinalExerciseExplanationMessage("第一个动作怎么做")).toBe(true);
    expect(normalized).toEqual(modelIntent);
    expect(resolveAssistantAction(normalized, createExerciseContext())).toBeNull();
    expect(
      shouldUseReferenceResolutionForChat({
        latestUserMessage: "第一个动作怎么做",
        chatIntent: normalized,
        conversationContext: createEmptyConversationContext(),
        recentArtifactSummaries: [],
      }),
    ).toBe(true);
  });

  it("keeps schema-parse fallback non-executable", () => {
    const fallbackIntent = createFallbackChatIntent(
      [{ role: "user", content: "换成别的动作" }],
      conversationContext,
    );
    const parsed = parseChatIntentModelOutput(null, fallbackIntent);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }

    expect(parsed.fallbackIntent.type).toBe("general_fitness_advice");
    expect(parsed.fallbackIntent.canTriggerAction).toBe(false);
    expect(parsed.fallbackIntent.action?.shouldTrigger).toBe(false);
    expect(resolveAssistantAction(parsed.fallbackIntent, createExerciseContext())).toBeNull();
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
      "非执行场景可以省略 workoutIntent，或返回 workoutIntent:null",
    );
    expect(aiPromptConfig.chatIntentResolution.system).toContain(
      "needsExerciseContext 为 true 或 action.shouldTrigger=true 时必须给出合法结构",
    );
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
