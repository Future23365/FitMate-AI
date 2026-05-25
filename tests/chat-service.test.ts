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
import type { FitnessConversationContext } from "@/lib/shared/chat/fitness-conversation-context";
import type { WorkoutPlanIntent } from "@/lib/shared/workout-plans/draft-schema";

const routineIntent: WorkoutPlanIntent = {
  intentType: "routine",
  goal: "胸肌训练",
  experience: "beginner",
  sessionMinutes: 30,
  weeklyFrequency: 1,
  equipment: ["自重"],
  injuryLimitations: [],
  preferences: ["居家"],
  avoidances: [],
};

const conversationContext: FitnessConversationContext = {
  summary: "用户想在家练胸肌。",
  currentIntent: routineIntent,
  knownFacts: {
    goal: "胸肌训练",
    experience: "beginner",
    sessionMinutes: 30,
    weeklyFrequency: 1,
    equipment: ["自重"],
    injuryLimitations: [],
    preferences: ["居家"],
    avoidances: [],
  },
  unresolvedQuestions: [],
};

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

export function runAiChatServiceBoundaryTests() {
  console.log("🧪 测试 AI chat 服务边界与确定性规则...");

  const invalidRequest = chatRequestSchema.safeParse({
    messages: [{ role: "user", content: "" }],
  });
  console.assert(!invalidRequest.success, "空消息内容必须在 HTTP 入参 Schema 层被拦截");

  const preparedRequest = prepareAiChatRequest({
    messages: [
      { role: "user", content: "  今天在家练胸 30 分钟  " },
      { role: "assistant", content: "可以，我来整理。" },
    ],
    thinkingEnabled: false,
  });
  console.assert(preparedRequest.rawMessages.length === 2, "prepareAiChatRequest 应保留合法消息");
  console.assert(preparedRequest.messages.length === 2, "prepareAiChatRequest 应生成 AI 上下文消息窗口");
  console.assert(!preparedRequest.thinkingEnabled, "thinkingEnabled=false 应被保留");
  console.assert(
    !preparedRequest.hasClientConversationContext,
    "没有客户端 conversationContext 时应标记为服务端 fallback",
  );

  const fallbackIntent = createFallbackChatIntent(
    [{ role: "user", content: "换一批动作" }],
    conversationContext,
  );
  console.assert(
    fallbackIntent.workoutIntent?.goal === routineIntent.goal,
    "推荐刷新 fallback 应沿用 conversationContext.currentIntent",
  );

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
  console.assert(routineAction?.action === "workout_routine", "routine 意图应转成 workout_routine 内部动作");
  console.assert(routineAction?.intent.weeklyFrequency === 1, "routine 内部动作必须保持 weeklyFrequency=1");

  const insufficientAction = resolveAssistantAction(
    chatIntent,
    createExerciseContext({ candidateStatus: "insufficient" }),
  );
  console.assert(insufficientAction === null, "候选不足时不能触发内部动作");

  const visibleReplies = resolveVisibleSuggestedReplies(
    {
      ...chatIntent,
      canTriggerAction: false,
      suggestedReplies: ["我今天在家自重练 30 分钟"],
    },
    null,
  );
  console.assert(visibleReplies.length === 1, "缺信息且未触发动作时应展示 suggested replies");
  console.assert(
    resolveVisibleSuggestedReplies({ ...chatIntent, suggestedReplies: ["补充信息"] }, routineAction).length === 0,
    "已触发内部动作时必须隐藏 suggested replies",
  );

  const parsedJson = parseJsonObject("```json\n{\"ok\":true}\n```");
  console.assert(parsedJson.ok && parsedJson.value && typeof parsedJson.value === "object", "应解析 fenced JSON");

  const streamEvent = new TextDecoder().decode(
    encodeChatStreamEvent("done", "", { traceId: "trace-1" }),
  );
  console.assert(
    streamEvent === "{\"type\":\"done\",\"delta\":\"\",\"traceId\":\"trace-1\"}\n",
    "stream event 编码格式必须保持 NDJSON 兼容",
  );
}
