import "server-only";

import type { ContextPackage } from "@/lib/server/agent-orchestrator/contracts";
import { toUtcISOString } from "@/lib/shared/time/utc-date-time";

export type AiTokenBudgetRoute =
  | "/api/chat"
  | "/api/ai/exercise-recommendations"
  | "/api/ai/workout-plan";

export type AiTokenBudgetStage =
  | "agent_context_build"
  | "agent_tool_decision"
  | "agent_tool_execution"
  | "agent_final_result"
  | "agent_response_writer"
  | "agent_summary_update"
  | "exercise_candidate_selection"
  | "conversation_summary_update"
  | "exercise_recommendation_generation"
  | "workout_plan_intent_extraction"
  | "workout_plan_draft_generation"
  | "workout_plan_draft_repair";

export type AiTokenBudgetStageStatus = "planned" | "executed" | "skipped";

export type AiPromptModuleId =
  | "base_safety"
  | "agent_context_build"
  | "agent_tool_decision"
  | "agent_tool_execution"
  | "agent_final_result"
  | "agent_response_writer"
  | "agent_summary_update"
  | "conversation_summary_context"
  | "exercise_candidate_constraints"
  | "user_feedback_memory"
  | "exercise_recommendation_generation"
  | "workout_plan_intent_extraction"
  | "workout_plan_draft_base"
  | "workout_plan_draft_routine"
  | "workout_plan_draft_plan"
  | "workout_plan_draft_schema"
  | "workout_plan_draft_repair"
  | "conversation_summary_update";

export type CandidateTrimSummary = {
  beforeCount: number;
  afterCount: number;
  maxVisibleCount: number;
  visibleFields: string[];
  reason: string;
};

export type ModelVisibleContextSummary = {
  usesConversationSummary: boolean;
  conversationSummaryChars: number;
  usesLatestUserMessage: boolean;
  latestUserMessageChars: number;
  usesFullHistory: false;
  usesContextPackage?: boolean;
  recentMessagesCount?: number;
  recentArtifactsCount?: number;
  memoryFactCount?: number;
  toolResultCount?: number;
  contextSnapshotChars?: number;
  provenanceCount?: number;
  notes: string[];
};

export type AiTokenBudgetStageDecision = {
  stage: AiTokenBudgetStage;
  status: AiTokenBudgetStageStatus;
  model?: string;
  skipReason?: string;
  promptModules: AiPromptModuleId[];
  context: ModelVisibleContextSummary;
  candidateTrim?: CandidateTrimSummary;
};

export type AiTokenBudgetDecision = {
  decisionId: string;
  route: AiTokenBudgetRoute;
  createdAt: string;
  intentType?: string;
  modelVisibleContext: ModelVisibleContextSummary;
  stages: AiTokenBudgetStageDecision[];
  candidateTrim?: CandidateTrimSummary;
};

export const modelVisibleExerciseCandidateFields = [
  "exerciseId",
  "nameZh",
  "targetMusclesZh",
  "equipmentOrLocation",
  "level",
  "categoryZh",
  "matchingReasons",
  "candidateSource",
] as const;

export function createModelVisibleContextSummary(input: {
  conversationSummary?: string;
  latestUserMessage: string;
  notes?: string[];
}): ModelVisibleContextSummary {
  return {
    usesConversationSummary: Boolean(input.conversationSummary?.trim()),
    conversationSummaryChars: input.conversationSummary?.trim().length ?? 0,
    usesLatestUserMessage: true,
    latestUserMessageChars: input.latestUserMessage.trim().length,
    usesFullHistory: false,
    notes: [
      "独立 AI API 的兼容上下文只允许来自 conversationSummary。",
      "本轮模型输入只包含最新用户消息和服务端传入的结构化材料。",
      ...(input.notes ?? []),
    ],
  };
}

// Agent 可见上下文摘要记录 ContextPackage，而不是 summary-only 历史协议。
export function createAgentModelVisibleContextSummary(input: {
  context: ContextPackage;
  toolResultCount?: number;
  notes?: string[];
}): ModelVisibleContextSummary {
  return {
    usesConversationSummary: false,
    conversationSummaryChars: 0,
    usesLatestUserMessage: true,
    latestUserMessageChars: input.context.latestUserMessage.trim().length,
    usesFullHistory: false,
    usesContextPackage: true,
    recentMessagesCount: input.context.recentMessages.length,
    recentArtifactsCount: input.context.recentArtifacts.length,
    memoryFactCount:
      (input.context.memorySnapshot?.facts.length ?? 0) +
      (input.context.memorySnapshot?.preferences.length ?? 0) +
      (input.context.memorySnapshot?.avoidances.length ?? 0),
    toolResultCount: input.toolResultCount ?? 0,
    contextSnapshotChars: input.context.optionalContextSnapshot?.summary.length ?? 0,
    provenanceCount: input.context.provenance.length,
    notes: [
      "Agent 主链使用 ContextPackage、recent messages、recent artifacts、用户记忆和 tool results。",
      "conversationSummary 只能作为后台摘要、标题或调试材料，不作为执行事实源。",
      ...(input.notes ?? []),
    ],
  };
}

export function createCandidateTrimSummary(input: {
  beforeCount: number;
  afterCount: number;
  maxVisibleCount: number;
  reason: string;
  visibleFields?: readonly string[];
}): CandidateTrimSummary {
  return {
    beforeCount: input.beforeCount,
    afterCount: input.afterCount,
    maxVisibleCount: input.maxVisibleCount,
    visibleFields: [...(input.visibleFields ?? modelVisibleExerciseCandidateFields)],
    reason: input.reason,
  };
}

export function createAgentChatTokenBudgetDecision(input: {
  context: ContextPackage;
  toolResultCount?: number;
  summaryUpdateSkipped?: boolean;
  summarySkipReason?: string;
}): AiTokenBudgetDecision {
  const context = createAgentModelVisibleContextSummary({
    context: input.context,
    toolResultCount: input.toolResultCount,
  });

  return createDecision({
    route: "/api/chat",
    modelVisibleContext: context,
    stages: [
      stage("agent_context_build", "executed", context, {
        promptModules: ["agent_context_build"],
      }),
      stage("agent_tool_decision", "planned", context, {
        model: "deepseek-v4-flash",
        promptModules: ["base_safety", "agent_tool_decision"],
      }),
      stage("agent_tool_execution", "planned", context, {
        promptModules: ["agent_tool_execution"],
      }),
      stage("agent_final_result", "planned", context, {
        model: "deepseek-v4-flash",
        promptModules: ["agent_final_result"],
      }),
      stage("agent_response_writer", "planned", context, {
        model: "deepseek-v4-flash",
        promptModules: ["agent_response_writer"],
      }),
      stage("agent_summary_update", input.summaryUpdateSkipped ? "skipped" : "planned", context, {
        model: input.summaryUpdateSkipped ? undefined : "deepseek-v4-flash",
        skipReason: input.summarySkipReason,
        promptModules: input.summaryUpdateSkipped ? [] : ["agent_summary_update"],
      }),
    ],
  });
}

export function createExerciseRecommendationBudgetDecision(input: {
  latestUserMessage: string;
  conversationSummary: string;
  candidateTrim: CandidateTrimSummary;
}): AiTokenBudgetDecision {
  const context = createModelVisibleContextSummary({
    conversationSummary: input.conversationSummary,
    latestUserMessage: input.latestUserMessage,
  });

  return createDecision({
    route: "/api/ai/exercise-recommendations",
    intentType: "exercise_recommendation",
    modelVisibleContext: context,
    candidateTrim: input.candidateTrim,
    stages: [
      stage("exercise_candidate_selection", "executed", context, {
        promptModules: ["exercise_candidate_constraints"],
        candidateTrim: input.candidateTrim,
      }),
      stage("exercise_recommendation_generation", "planned", context, {
        model: "deepseek-v4-flash",
        promptModules: [
          "base_safety",
          "conversation_summary_context",
          "exercise_recommendation_generation",
          "exercise_candidate_constraints",
        ],
        candidateTrim: input.candidateTrim,
      }),
    ],
  });
}

export function createWorkoutPlanBudgetDecision(input: {
  latestUserMessage: string;
  conversationSummary: string;
  intentType?: "plan" | "routine";
  hasClientIntent: boolean;
  candidateTrim?: CandidateTrimSummary;
  needsRepair?: boolean;
}): AiTokenBudgetDecision {
  const context = createModelVisibleContextSummary({
    conversationSummary: input.conversationSummary,
    latestUserMessage: input.latestUserMessage,
  });
  const draftModules: AiPromptModuleId[] = [
    "base_safety",
    "conversation_summary_context",
    "workout_plan_draft_base",
    input.intentType === "routine" ? "workout_plan_draft_routine" : "workout_plan_draft_plan",
    "workout_plan_draft_schema",
    "exercise_candidate_constraints",
  ];

  return createDecision({
    route: "/api/ai/workout-plan",
    intentType: input.intentType,
    modelVisibleContext: context,
    candidateTrim: input.candidateTrim,
    stages: [
      stage(
        "workout_plan_intent_extraction",
        input.hasClientIntent ? "skipped" : "planned",
        context,
        {
          model: input.hasClientIntent ? undefined : "deepseek-v4-flash",
          skipReason: input.hasClientIntent ? "上游 `/api/chat` 已提供结构化意图。" : undefined,
          promptModules: input.hasClientIntent
            ? []
            : ["base_safety", "conversation_summary_context", "workout_plan_intent_extraction"],
        },
      ),
      stage("exercise_candidate_selection", input.candidateTrim ? "executed" : "planned", context, {
        promptModules: ["exercise_candidate_constraints"],
        candidateTrim: input.candidateTrim,
      }),
      stage("workout_plan_draft_generation", input.candidateTrim ? "planned" : "skipped", context, {
        model: input.candidateTrim ? "deepseek-v4-flash" : undefined,
        skipReason: input.candidateTrim ? undefined : "候选动作尚未生成或候选不足。",
        promptModules: input.candidateTrim ? draftModules : [],
        candidateTrim: input.candidateTrim,
      }),
      stage("workout_plan_draft_repair", input.needsRepair ? "planned" : "skipped", context, {
        model: input.needsRepair ? "deepseek-v4-flash" : undefined,
        skipReason: input.needsRepair ? undefined : "首轮草稿校验通过或尚未进入修复流程。",
        promptModules: input.needsRepair ? [...draftModules, "workout_plan_draft_repair"] : [],
        candidateTrim: input.candidateTrim,
      }),
    ],
  });
}

export function shouldSkipConversationSummaryUpdate(input: {
  previousSummary: string;
  latestUserMessage: string;
  assistantReply: string;
  internalActionSummary?: string;
}) {
  if (!input.previousSummary.trim()) {
    return null;
  }

  if (input.internalActionSummary?.trim()) {
    return null;
  }

  const latestUserMessage = input.latestUserMessage.trim();
  const assistantReply = input.assistantReply.trim();
  const isShortOperation =
    /^(好|好的|可以|确认|取消|不用|不要|算了|换一批|再来一批|再换|换几个|查看详情|详情|展开|收起|返回)$/i.test(
      latestUserMessage,
    ) ||
    /^(换一批|再换|不要这些|看详情|详情)$/.test(latestUserMessage);

  if (isShortOperation && assistantReply.length <= 260) {
    return "本轮是确认、取消、换一批或查看详情等短操作，没有新的长期训练事实。";
  }

  return null;
}

export function getStageDecision(
  decision: AiTokenBudgetDecision | undefined,
  stageName: AiTokenBudgetStage,
) {
  return decision?.stages.find((item) => item.stage === stageName);
}

function createDecision(input: {
  route: AiTokenBudgetRoute;
  intentType?: string;
  modelVisibleContext: ModelVisibleContextSummary;
  stages: AiTokenBudgetStageDecision[];
  candidateTrim?: CandidateTrimSummary;
}): AiTokenBudgetDecision {
  return {
    decisionId: `budget_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    route: input.route,
    createdAt: toUtcISOString(new Date()),
    intentType: input.intentType,
    modelVisibleContext: input.modelVisibleContext,
    stages: input.stages,
    candidateTrim: input.candidateTrim,
  };
}

function stage(
  stageName: AiTokenBudgetStage,
  status: AiTokenBudgetStageStatus,
  context: ModelVisibleContextSummary,
  options: {
    model?: string;
    skipReason?: string;
    promptModules?: AiPromptModuleId[];
    candidateTrim?: CandidateTrimSummary;
  } = {},
): AiTokenBudgetStageDecision {
  return {
    stage: stageName,
    status,
    model: options.model,
    skipReason: options.skipReason,
    promptModules: options.promptModules ?? [],
    context,
    candidateTrim: options.candidateTrim,
  };
}
