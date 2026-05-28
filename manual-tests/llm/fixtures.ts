import type { FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { WorkoutPlanIntent } from "@/lib/shared/workout-plans/draft-schema";

// 手动 LLM 用例的稳定断言配置，只描述结构、关键语义和禁止项。
export type LlmCaseExpectation = {
  outputSchema?: "chatIntent" | "recommendation" | "workoutIntent" | "workoutPlanDraft" | "workoutRoutineDraft";
  expectedType?: string;
  expectedIntentType?: "plan" | "routine";
  expectedCanTriggerAction?: boolean;
  requireNeedsExerciseContext?: boolean;
  requireMissingActionFields?: boolean;
  requireSuggestedReplies?: boolean;
  requireFirstPersonSuggestedReplies?: boolean;
  requireDoctorSafetyAdvice?: boolean;
  allowCandidateInsufficientMessage?: boolean;
  forbiddenText?: string[];
  forbiddenPatterns?: RegExp[];
  requiredTextPatterns?: RegExp[];
  allowedExerciseIds?: string[];
  excludedExerciseIds?: string[];
  requireCandidateExerciseIdsOnly?: boolean;
  requireRoutineSections?: boolean;
  requirePlanDays?: boolean;
};

// 单个手动 LLM 用例，按真实模型调用点组织输入和期望输出。
export type ManualLlmCase = {
  name: string;
  callSite:
    | "chatIntentResolution"
    | "chatCompletion"
    | "exerciseRecommendationGeneration"
    | "workoutPlanIntentExtraction"
    | "workoutPlanDraftGeneration";
  inputSummary: string;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  conversationContext?: FitnessConversationContext;
  intent?: WorkoutPlanIntent;
  excludedExerciseIds?: string[];
  candidateStatus?: "enough" | "limited_but_usable" | "insufficient";
  expectation: LlmCaseExpectation;
};

const routineIntent: WorkoutPlanIntent = {
  intentType: "routine",
  goal: "胸肌训练",
  experience: "beginner",
  sessionMinutes: 30,
  weeklyFrequency: 1,
  equipment: ["自重"],
  injuryLimitations: [],
  preferences: ["居家训练"],
  avoidances: [],
};

const planIntent: WorkoutPlanIntent = {
  intentType: "plan",
  goal: "胸肌增肌",
  experience: "beginner",
  sessionMinutes: 45,
  weeklyFrequency: 3,
  equipment: ["自重"],
  injuryLimitations: [],
  preferences: ["居家训练"],
  avoidances: [],
};

const chestContext: FitnessConversationContext = {
  summary: "目标：胸肌训练；经验：beginner；单次时长：30分钟；器械：自重；偏好：居家训练",
  currentIntent: routineIntent,
  knownFacts: {
    goal: routineIntent.goal,
    experience: routineIntent.experience,
    sessionMinutes: routineIntent.sessionMinutes,
    weeklyFrequency: routineIntent.weeklyFrequency,
    equipment: routineIntent.equipment,
    injuryLimitations: routineIntent.injuryLimitations,
    preferences: routineIntent.preferences,
    avoidances: routineIntent.avoidances,
    latestUserMessage: "今天在家自重练胸 30 分钟",
  },
  unresolvedQuestions: [],
};

// 手动 LLM 测试使用的最小动作候选池，避免依赖数据库或完整动作库。
export const manualLlmCandidateExercises: Exercise[] = [
  createExercise({
    id: "jumping-jacks",
    nameEn: "Jumping Jacks",
    nameZh: "开合跳",
    categoryZh: "热身",
    primaryMusclesZh: ["全身"],
    goalTags: ["warmup", "cardio", "home_friendly", "beginner_friendly"],
  }),
  createExercise({
    id: "push-up",
    nameEn: "Push Up",
    nameZh: "俯卧撑",
    categoryZh: "力量",
    primaryMusclesZh: ["胸部"],
    secondaryMusclesZh: ["肱三头肌", "肩部"],
    goalTags: ["strength", "hypertrophy", "home_friendly", "beginner_friendly"],
  }),
  createExercise({
    id: "knee-push-up",
    nameEn: "Knee Push Up",
    nameZh: "跪姿俯卧撑",
    categoryZh: "力量",
    primaryMusclesZh: ["胸部"],
    secondaryMusclesZh: ["肱三头肌"],
    goalTags: ["strength", "home_friendly", "beginner_friendly"],
  }),
  createExercise({
    id: "plank",
    nameEn: "Plank",
    nameZh: "平板支撑",
    categoryZh: "核心",
    primaryMusclesZh: ["核心"],
    secondaryMusclesZh: ["肩部"],
    goalTags: ["core", "home_friendly", "beginner_friendly"],
  }),
  createExercise({
    id: "bodyweight-squat",
    nameEn: "Bodyweight Squat",
    nameZh: "自重深蹲",
    categoryZh: "力量",
    primaryMusclesZh: ["腿部", "臀部"],
    goalTags: ["strength", "home_friendly", "beginner_friendly"],
  }),
  createExercise({
    id: "chest-stretch",
    nameEn: "Chest Stretch",
    nameZh: "胸部拉伸",
    categoryZh: "拉伸",
    primaryMusclesZh: ["胸部"],
    goalTags: ["stretch", "mobility", "home_friendly", "beginner_friendly"],
  }),
];

// 当前 prompt 分支覆盖矩阵，新增 LLM 分支时应在这里补充用例。
export const manualLlmCases: ManualLlmCase[] = [
  {
    name: "聊天意图：普通健身建议",
    callSite: "chatIntentResolution",
    inputSummary: "用户询问训练前热身原则，期望 general_fitness_advice",
    messages: [{ role: "user", content: "训练前热身应该注意什么？" }],
    conversationContext: emptyConversationContext(),
    expectation: {
      outputSchema: "chatIntent",
      expectedType: "general_fitness_advice",
      expectedCanTriggerAction: false,
    },
  },
  {
    name: "聊天意图：动作推荐",
    callSite: "chatIntentResolution",
    inputSummary: "用户只要动作推荐，不要求组数流程",
    messages: [{ role: "user", content: "新手在家自重练胸，请直接推荐4个动作，不要安排组数流程。" }],
    conversationContext: emptyConversationContext(),
    expectation: {
      outputSchema: "chatIntent",
      expectedType: "exercise_recommendation",
      expectedCanTriggerAction: true,
      requireNeedsExerciseContext: true,
      expectedIntentType: "routine",
    },
  },
  {
    name: "聊天意图：换一批复用上下文",
    callSite: "chatIntentResolution",
    inputSummary: "用户要求换一批动作，期望继续 exercise_recommendation 并复用当前意图",
    messages: [
      { role: "assistant", content: "我先按居家自重胸肌方向整理了一组动作。" },
      { role: "user", content: "这批不太喜欢，换一批" },
    ],
    conversationContext: chestContext,
    expectation: {
      outputSchema: "chatIntent",
      expectedType: "exercise_recommendation",
      expectedCanTriggerAction: true,
      requireNeedsExerciseContext: true,
      expectedIntentType: "routine",
    },
  },
  {
    name: "聊天意图：长期训练计划",
    callSite: "chatIntentResolution",
    inputSummary: "用户明确每周多天长期安排，期望 workout_plan",
    messages: [{ role: "user", content: "帮我做一个每周三次、持续一个月的胸肌增肌计划，每次45分钟，在家自重练。" }],
    conversationContext: emptyConversationContext(),
    expectation: {
      outputSchema: "chatIntent",
      expectedType: "workout_plan",
      expectedCanTriggerAction: true,
      requireNeedsExerciseContext: true,
      expectedIntentType: "plan",
    },
  },
  {
    name: "聊天意图：单次训练",
    callSite: "chatIntentResolution",
    inputSummary: "用户表达今天这次训练，期望 routine",
    messages: [{ role: "user", content: "今天在家自重练胸 30 分钟，帮我安排一套。" }],
    conversationContext: emptyConversationContext(),
    expectation: {
      outputSchema: "chatIntent",
      expectedType: "routine",
      expectedCanTriggerAction: true,
      requireNeedsExerciseContext: true,
      expectedIntentType: "routine",
    },
  },
  {
    name: "聊天意图：动作替换",
    callSite: "chatIntentResolution",
    inputSummary: "用户要求替换某个动作，期望 exercise_replacement",
    messages: [{ role: "user", content: "把当前训练里的俯卧撑替换成不伤手腕的动作。" }],
    conversationContext: chestContext,
    expectation: {
      outputSchema: "chatIntent",
      expectedType: "exercise_replacement",
      requireNeedsExerciseContext: true,
    },
  },
  {
    name: "聊天意图：动作讲解",
    callSite: "chatIntentResolution",
    inputSummary: "用户问具体动作怎么做，期望 exercise_explanation",
    messages: [{ role: "user", content: "俯卧撑怎么做才标准？" }],
    conversationContext: chestContext,
    expectation: {
      outputSchema: "chatIntent",
      expectedType: "exercise_explanation",
      requireNeedsExerciseContext: true,
    },
  },
  {
    name: "聊天意图：非健身问题",
    callSite: "chatIntentResolution",
    inputSummary: "用户问天气，期望 non_fitness 且不需要动作上下文",
    messages: [{ role: "user", content: "明天上海会下雨吗？" }],
    conversationContext: emptyConversationContext(),
    expectation: {
      outputSchema: "chatIntent",
      expectedType: "non_fitness",
      expectedCanTriggerAction: false,
    },
  },
  {
    name: "聊天意图：信息不足追问",
    callSite: "chatIntentResolution",
    inputSummary: "用户只说今天练什么，期望缺失字段和第一人称 suggestedReplies",
    messages: [{ role: "user", content: "今天练什么？" }],
    conversationContext: emptyConversationContext(),
    expectation: {
      outputSchema: "chatIntent",
      expectedType: "routine",
      expectedCanTriggerAction: false,
      requireNeedsExerciseContext: true,
      requireMissingActionFields: true,
      requireSuggestedReplies: true,
      requireFirstPersonSuggestedReplies: true,
    },
  },
  {
    name: "聊天意图：显式动作列表默认时长",
    callSite: "chatIntentResolution",
    inputSummary: "用户给出动作列表并要求编成训练，期望允许触发 routine",
    messages: [{ role: "user", content: "把俯卧撑、平板支撑、开合跳、胸部拉伸编成一套训练。" }],
    conversationContext: emptyConversationContext(),
    expectation: {
      outputSchema: "chatIntent",
      expectedType: "routine",
      expectedCanTriggerAction: true,
      requireNeedsExerciseContext: true,
      expectedIntentType: "routine",
    },
  },
  {
    name: "聊天回复：自然过渡且不泄漏 Trigger",
    callSite: "chatCompletion",
    inputSummary: "服务端将触发 routine 时，正文只做自然过渡",
    messages: [{ role: "user", content: "今天在家自重练胸 30 分钟，帮我安排一套。" }],
    conversationContext: chestContext,
    intent: routineIntent,
    candidateStatus: "enough",
    expectation: {
      forbiddenText: ["workout_plan_trigger", "workout_routine_trigger", "exercise_recommendation_trigger", "卡片", "下方", "后台生成"],
      forbiddenPatterns: [/```(?:json)?/i, /\{\s*"type"\s*:/],
      requiredTextPatterns: [/30\s*分钟|三十\s*分钟|这次|本次/],
    },
  },
  {
    name: "聊天回复：高风险健康提醒",
    callSite: "chatCompletion",
    inputSummary: "用户提到胸痛，期望强安全提醒",
    messages: [{ role: "user", content: "我最近运动时胸痛，还想做高强度训练。" }],
    conversationContext: emptyConversationContext(),
    expectation: {
      requireDoctorSafetyAdvice: true,
      forbiddenText: ["workout_plan_trigger", "workout_routine_trigger", "exercise_recommendation_trigger"],
    },
  },
  {
    name: "聊天回复：候选不足可以放宽条件",
    callSite: "chatCompletion",
    inputSummary: "candidateStatus=insufficient 时允许说明候选不足",
    messages: [{ role: "user", content: "膝盖疼，只用壶铃练跳跃爆发力，给我动作。" }],
    conversationContext: emptyConversationContext(),
    intent: {
      ...routineIntent,
      goal: "跳跃爆发力",
      equipment: ["壶铃"],
      injuryLimitations: ["膝盖疼"],
      preferences: [],
    },
    candidateStatus: "insufficient",
    expectation: {
      allowCandidateInsufficientMessage: true,
      requiredTextPatterns: [/放宽|调整|限制|候选|不足|不够|器械|目标/],
      forbiddenText: ["workout_plan_trigger", "workout_routine_trigger", "exercise_recommendation_trigger"],
    },
  },
  {
    name: "动作推荐：普通推荐只返回候选 ID",
    callSite: "exerciseRecommendationGeneration",
    inputSummary: "普通动作推荐，期望 exerciseId 均来自候选",
    messages: [{ role: "user", content: "新手在家自重练胸，推荐几个动作。" }],
    conversationContext: chestContext,
    intent: routineIntent,
    expectation: {
      outputSchema: "recommendation",
      allowedExerciseIds: manualLlmCandidateExercises.map((exercise) => exercise.id),
      requireCandidateExerciseIdsOnly: true,
    },
  },
  {
    name: "动作推荐：换一批避开已排除动作",
    callSite: "exerciseRecommendationGeneration",
    inputSummary: "换一批动作，期望避开 excludedExerciseIds",
    messages: [{ role: "user", content: "换一批，不要俯卧撑。" }],
    conversationContext: chestContext,
    intent: routineIntent,
    excludedExerciseIds: ["push-up"],
    expectation: {
      outputSchema: "recommendation",
      allowedExerciseIds: manualLlmCandidateExercises.map((exercise) => exercise.id),
      excludedExerciseIds: ["push-up"],
      requireCandidateExerciseIdsOnly: true,
    },
  },
  {
    name: "训练计划意图：plan",
    callSite: "workoutPlanIntentExtraction",
    inputSummary: "用户请求每周三次长期计划，期望 intentType=plan",
    messages: [{ role: "user", content: "帮我做一个每周三次、持续一个月的胸肌增肌计划，每次45分钟，在家自重练。" }],
    conversationContext: emptyConversationContext(),
    expectation: {
      outputSchema: "workoutIntent",
      expectedIntentType: "plan",
    },
  },
  {
    name: "训练计划意图：routine",
    callSite: "workoutPlanIntentExtraction",
    inputSummary: "用户请求今天单次训练，期望 intentType=routine",
    messages: [{ role: "user", content: "今天在家自重练胸 30 分钟，帮我安排一套。" }],
    conversationContext: emptyConversationContext(),
    expectation: {
      outputSchema: "workoutIntent",
      expectedIntentType: "routine",
    },
  },
  {
    name: "训练计划意图：默认值补齐",
    callSite: "workoutPlanIntentExtraction",
    inputSummary: "用户信息不足，期望仍返回可校验 WorkoutPlanIntent",
    messages: [{ role: "user", content: "给我安排综合体能训练。" }],
    conversationContext: emptyConversationContext(),
    expectation: {
      outputSchema: "workoutIntent",
    },
  },
  {
    name: "训练草稿：长期计划",
    callSite: "workoutPlanDraftGeneration",
    inputSummary: "intentType=plan 时输出 WorkoutPlanDraft",
    messages: [{ role: "user", content: "每周三次居家胸肌增肌计划，每次45分钟。" }],
    conversationContext: emptyConversationContext(),
    intent: planIntent,
    expectation: {
      outputSchema: "workoutPlanDraft",
      allowedExerciseIds: manualLlmCandidateExercises.map((exercise) => exercise.id),
      requireCandidateExerciseIdsOnly: true,
      requirePlanDays: true,
    },
  },
  {
    name: "训练草稿：单次 routine",
    callSite: "workoutPlanDraftGeneration",
    inputSummary: "intentType=routine 时输出 WorkoutRoutineDraft",
    messages: [{ role: "user", content: "今天在家自重练胸 30 分钟，帮我安排一套。" }],
    conversationContext: chestContext,
    intent: routineIntent,
    expectation: {
      outputSchema: "workoutRoutineDraft",
      allowedExerciseIds: manualLlmCandidateExercises.map((exercise) => exercise.id),
      requireCandidateExerciseIdsOnly: true,
      requireRoutineSections: true,
    },
  },
];

function emptyConversationContext(): FitnessConversationContext {
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

function createExercise(overrides: Partial<Exercise>): Exercise {
  const id = overrides.id ?? "push-up";

  return {
    id,
    source: "manual-llm-fixture",
    sourceUrl: "",
    sourceId: id,
    license: "manual-test",
    nameEn: overrides.nameEn ?? "Push Up",
    nameZh: overrides.nameZh ?? "俯卧撑",
    category: "strength",
    categoryZh: overrides.categoryZh ?? "力量",
    level: "beginner",
    levelZh: "新手",
    force: "push",
    forceZh: "推",
    mechanic: "compound",
    mechanicZh: "复合",
    equipment: "bodyweight",
    equipmentZh: "自重",
    homeRequirement: "no_equipment",
    homeRequirementZh: "无器械",
    primaryMuscles: ["chest"],
    primaryMusclesZh: overrides.primaryMusclesZh ?? ["胸部"],
    secondaryMuscles: ["triceps"],
    secondaryMusclesZh: overrides.secondaryMusclesZh ?? [],
    instructionsEn: ["Keep a steady pace."],
    instructionsZh: ["保持稳定节奏。"],
    images: ["/manual-test.png"],
    imageUrls: ["/manual-test.png"],
    riskTags: overrides.riskTags ?? [],
    goalTags: overrides.goalTags ?? ["home_friendly", "beginner_friendly"],
    reviewStatus: "human_reviewed",
    isPublished: true,
  };
}
