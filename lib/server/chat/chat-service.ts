import "server-only";

import { z } from "zod";

import { aiPromptConfig, buildPromptFromModules } from "@/lib/server/ai/prompt-config";
import {
  createCandidateTrimSummary,
  createExerciseRecommendationBudgetDecision,
  createChatTokenBudgetDecision,
  getStageDecision,
  shouldSkipConversationSummaryUpdate,
  type AiPromptModuleId,
  type AiTokenBudgetDecision,
  type CandidateTrimSummary,
} from "@/lib/server/ai/token-budget";
import {
  decideReadonlyToolLoopEligibility,
  formatReadonlyToolContextBundleForPrompt,
  runReadonlyToolLoop,
  type ReadonlyToolContextBundle,
} from "@/lib/server/ai/tools";
import { updateConversationSummary } from "@/lib/server/chat/conversation-summary-service";
import {
  formatRecentArtifactSummariesForPrompt,
  getArtifactPayload,
  type RecentArtifactSummary,
} from "@/lib/server/conversation-artifacts/artifact-service";
import {
  buildReferenceResolutionReply,
  formatReferenceResolutionForPrompt,
  resolveReference,
  shouldAttemptReferenceResolution,
} from "@/lib/server/reference-resolver/reference-resolver-service";
import { getCurrentUser } from "@/lib/server/users/current-user";
import {
  buildAndApplyWorkoutPatchFromChat,
  formatWorkoutPatchReply,
} from "@/lib/server/workout-patches/workout-patch-chat-service";
import {
  aiContextChatMessageSchema,
  buildFitnessConversationContext,
  buildConversationSummaryContext,
  formatConversationSummaryContextForPrompt,
  fitnessConversationContextSchema,
  normalizeAiContextMessages,
  type ConversationSummaryContext,
  type FitnessConversationContext,
} from "@/lib/shared/chat/fitness-conversation-context";
import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import {
  createFinalDecision,
  summarizeRecentArtifactsForTrace,
  summarizeReferenceResolutionForTrace,
  summarizeWorkoutPatchResultForTrace,
} from "@/lib/server/dev/ai-run-trace";
import { getExerciseById, listAllExercises } from "@/lib/server/exercises/exercise-service";
import { serverRequest } from "@/lib/server/http/server-request";
import {
  buildConversationMemoryState,
  formatMemoryStateForPrompt,
  mergeMemoryStateIntoWorkoutIntent,
  recordUserFeedbackFromChat,
} from "@/lib/server/user-feedback-memory/user-feedback-memory-service";
import {
  selectExerciseCandidates,
  generateAiWorkoutPlanDraft,
  workoutPlanIntentSchema,
  type AiWorkoutPlanResult,
  type ExerciseCandidate,
  type WorkoutPlanIntent,
} from "@/lib/server/workout-plans";
import { generateAiExerciseRecommendations } from "@/lib/server/exercise-recommendations/ai-exercise-recommendation-service";
import type { ReferenceResolution } from "@/lib/shared/reference-resolver/schema";
import {
  resolvedChatIntentSchema,
  type ResolvedActionKind,
  type ResolvedChatIntent,
  type ResolvedFieldSource,
  type ResolvedFieldSources,
} from "@/lib/shared/chat/resolved-intent";
import {
  assistantSuggestionListSchema,
  assistantSuggestionSchema,
  type AssistantSuggestion,
  type AssistantSuggestionKind,
  type AssistantSuggestionSource,
} from "@/lib/shared/chat/assistant-suggestions";
import type { ExerciseRecommendationCard } from "@/lib/shared/exercise-recommendations/schema";
import type {
  ConversationArtifactKind,
  ConversationArtifactPayload,
} from "@/lib/shared/conversation-artifacts/schema";
import type { Exercise } from "@/lib/shared/exercises/types";
import type { ConversationMemoryState } from "@/lib/shared/user-feedback-memory/schema";
import type { WorkoutPatchResult } from "@/lib/shared/workout-patches/schema";

type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

type DeepSeekStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
  usage?: DeepSeekTokenUsage | null;
};

type DeepSeekChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type DeepSeekTokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type DeepSeekChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: DeepSeekTokenUsage;
};

const chatIntentTypes = [
  "general_fitness_advice",
  "exercise_recommendation",
  "workout_plan",
  "routine",
  "exercise_replacement",
  "exercise_explanation",
  "non_fitness",
] as const;

const chatIntentTypeSchema = z.enum(chatIntentTypes).default("general_fitness_advice");

function normalizeSuggestedReplyList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 120 && !/[?？]/.test(item))
    .slice(0, 3);
}

const suggestedReplyListSchema = z.preprocess(
  normalizeSuggestedReplyList,
  z.array(z.string().trim().min(1).max(120)).max(3).default([]),
);
const assistantSuggestionInputListSchema = assistantSuggestionListSchema.catch([]);

const optionalWorkoutIntentSchema = z.preprocess(
  (value) => (value === null ? undefined : value),
  workoutPlanIntentSchema.optional(),
);

const optionalActionSchema = resolvedChatIntentSchema.shape.action.optional().catch(undefined);
const optionalResponseModeSchema = resolvedChatIntentSchema.shape.responseMode.optional().catch(undefined);
const optionalFieldSourcesSchema = resolvedChatIntentSchema.shape.fieldSources.optional().catch(undefined);
const optionalReferenceRequirementSchema = resolvedChatIntentSchema.shape.referenceRequirement.optional().catch(undefined);

// 聊天意图 schema 是模型输出进入服务端的第一道边界，交互按钮独立过滤，执行意图保持结构化校验。
export const chatIntentSchema = z.object({
  type: chatIntentTypeSchema,
  needsExerciseContext: z.boolean().default(false),
  workoutIntent: optionalWorkoutIntentSchema,
  requestedExerciseName: z.string().trim().max(80).optional(),
  canTriggerAction: z.boolean().default(false),
  missingActionFields: z.array(z.string().trim().min(1)).max(12).default([]),
  suggestedReplies: suggestedReplyListSchema,
  suggestedQuestions: suggestedReplyListSchema,
  assistantSuggestions: assistantSuggestionInputListSchema,
  action: optionalActionSchema,
  responseMode: optionalResponseModeSchema,
  fieldSources: optionalFieldSourcesSchema,
  referenceRequirement: optionalReferenceRequirementSchema,
  clarificationReplies: suggestedReplyListSchema.optional(),
  adjustmentReplies: suggestedReplyListSchema.optional(),
}).transform(({ suggestedQuestions, ...data }) => ({
  ...data,
  suggestedReplies: data.suggestedReplies.length > 0 ? data.suggestedReplies : suggestedQuestions,
}));

type ParsedChatIntent = z.infer<typeof chatIntentSchema>;
export type ChatIntent = Omit<ParsedChatIntent, "assistantSuggestions"> & {
  assistantSuggestions?: AssistantSuggestion[];
};

const recoverableChatIntentEnvelopeSchema = z.object({
  type: chatIntentTypeSchema,
  needsExerciseContext: z.boolean().default(false),
  workoutIntent: z.unknown().optional().nullable(),
  requestedExerciseName: z.string().trim().max(80).optional().catch(undefined),
  canTriggerAction: z.boolean().default(false),
  missingActionFields: z.array(z.string().trim().min(1)).max(12).default([]).catch([]),
  suggestedReplies: suggestedReplyListSchema,
  suggestedQuestions: suggestedReplyListSchema,
  assistantSuggestions: assistantSuggestionInputListSchema,
  action: optionalActionSchema,
  responseMode: optionalResponseModeSchema,
  fieldSources: optionalFieldSourcesSchema,
  referenceRequirement: optionalReferenceRequirementSchema,
  clarificationReplies: suggestedReplyListSchema.optional(),
  adjustmentReplies: suggestedReplyListSchema.optional(),
}).transform(({ suggestedQuestions, ...data }) => ({
  ...data,
  suggestedReplies: data.suggestedReplies.length > 0 ? data.suggestedReplies : suggestedQuestions,
}));

type ChatIntentParseDiagnostics = {
  parseMode: "schema" | "interaction_recovery";
  normalizedWorkoutIntentNull: boolean;
  workoutIntentValid: boolean;
  executionBlockedReason?: string;
  suggestedReplies: {
    sourceField: "suggestedReplies" | "suggestedQuestions" | "none";
    rawCount: number;
    visibleCount: number;
    droppedCount: number;
    clearedReason?: string;
  };
};

type ChatIntentParseResult =
  | {
      ok: true;
      intent: ChatIntent;
      diagnostics: ChatIntentParseDiagnostics;
    }
  | {
      ok: false;
      fallbackIntent: ChatIntent;
      error: unknown;
      diagnostics: ChatIntentParseDiagnostics;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRawSuggestedReplySource(value: unknown) {
  const record = isRecord(value) ? value : {};
  const rawSuggestedReplies = record.suggestedReplies;
  const normalizedSuggestedReplies = normalizeSuggestedReplyList(rawSuggestedReplies);

  if (normalizedSuggestedReplies.length > 0) {
    return {
      sourceField: "suggestedReplies" as const,
      rawValue: rawSuggestedReplies,
      normalized: normalizedSuggestedReplies,
    };
  }

  const rawSuggestedQuestions = record.suggestedQuestions;
  return {
    sourceField: normalizeSuggestedReplyList(rawSuggestedQuestions).length > 0
      ? "suggestedQuestions" as const
      : "none" as const,
    rawValue: rawSuggestedQuestions,
    normalized: normalizeSuggestedReplyList(rawSuggestedQuestions),
  };
}

function createSuggestedReplyDiagnostics(value: unknown, intent: Pick<ChatIntent, "suggestedReplies">) {
  const source = getRawSuggestedReplySource(value);
  const rawCount = Array.isArray(source.rawValue) ? source.rawValue.length : 0;
  const visibleCount = intent.suggestedReplies.length;
  const droppedCount = Math.max(0, rawCount - visibleCount);

  return {
    sourceField: source.sourceField,
    rawCount,
    visibleCount,
    droppedCount,
    clearedReason:
      rawCount > 0 && visibleCount === 0
        ? "all_suggested_replies_failed_validation"
        : undefined,
  };
}

function getRawWorkoutIntent(value: unknown) {
  return isRecord(value) ? value.workoutIntent : undefined;
}

function shouldRequireValidWorkoutIntent(intent: Pick<ChatIntent, "type" | "needsExerciseContext" | "canTriggerAction" | "action">) {
  const actionKind = intent.action?.kind;
  const actionNeedsWorkoutIntent =
    actionKind === "exercise_recommendation" ||
    actionKind === "workout_routine" ||
    actionKind === "workout_plan";

  return (
    intent.needsExerciseContext ||
    intent.canTriggerAction ||
    intent.action?.shouldTrigger ||
    isActionType(intent.type) ||
    actionNeedsWorkoutIntent
  );
}

function blockExecutableIntentWithoutWorkoutIntent(intent: ChatIntent): {
  intent: ChatIntent;
  reason?: string;
} {
  if (!shouldRequireValidWorkoutIntent(intent) || intent.workoutIntent) {
    return { intent };
  }

  const missingActionFields = uniqueStrings([...intent.missingActionFields, "workoutIntent"]);
  return {
    intent: chatIntentSchema.parse({
      ...intent,
      needsExerciseContext: false,
      canTriggerAction: false,
      missingActionFields,
      action: intent.action
        ? {
            ...intent.action,
            shouldTrigger: false,
            blockingMissingFields: uniqueStrings([
              ...intent.action.blockingMissingFields,
              "workoutIntent",
            ]),
          }
        : intent.action,
      responseMode: intent.suggestedReplies.length > 0 ? "ask_clarification" : intent.responseMode,
      clarificationReplies: intent.clarificationReplies ?? intent.suggestedReplies,
    }),
    reason: "executable_intent_missing_valid_workoutIntent",
  };
}

function createChatIntentDiagnostics(input: {
  rawValue: unknown;
  intent: ChatIntent;
  parseMode: ChatIntentParseDiagnostics["parseMode"];
  workoutIntentValid: boolean;
  executionBlockedReason?: string;
}): ChatIntentParseDiagnostics {
  return {
    parseMode: input.parseMode,
    normalizedWorkoutIntentNull: getRawWorkoutIntent(input.rawValue) === null && !input.intent.workoutIntent,
    workoutIntentValid: input.workoutIntentValid,
    executionBlockedReason: input.executionBlockedReason,
    suggestedReplies: createSuggestedReplyDiagnostics(input.rawValue, input.intent),
  };
}

// 模型输出可能只在执行层字段漂移；该函数保留合法交互按钮，同时阻止无效执行意图进入内部动作。
export function parseChatIntentModelOutput(value: unknown, fallbackIntent: ChatIntent): ChatIntentParseResult {
  const parsedIntent = chatIntentSchema.safeParse(value);

  if (parsedIntent.success) {
    const guarded = blockExecutableIntentWithoutWorkoutIntent(parsedIntent.data);
    return {
      ok: true,
      intent: guarded.intent,
      diagnostics: createChatIntentDiagnostics({
        rawValue: value,
        intent: guarded.intent,
        parseMode: "schema",
        workoutIntentValid: Boolean(guarded.intent.workoutIntent),
        executionBlockedReason: guarded.reason,
      }),
    };
  }

  const recoveredEnvelope = recoverableChatIntentEnvelopeSchema.safeParse(value);

  if (!recoveredEnvelope.success) {
    return {
      ok: false,
      fallbackIntent,
      error: parsedIntent.error.flatten(),
      diagnostics: createChatIntentDiagnostics({
        rawValue: value,
        intent: fallbackIntent,
        parseMode: "interaction_recovery",
        workoutIntentValid: Boolean(fallbackIntent.workoutIntent),
      }),
    };
  }

  const rawWorkoutIntent = recoveredEnvelope.data.workoutIntent;
  const recoveredWorkoutIntentResult = rawWorkoutIntent === null || rawWorkoutIntent === undefined
    ? null
    : workoutPlanIntentSchema.safeParse(rawWorkoutIntent);
  const recoveredWorkoutIntent = recoveredWorkoutIntentResult?.success
    ? recoveredWorkoutIntentResult.data
    : undefined;
  const recoveredIntent = chatIntentSchema.parse({
    ...recoveredEnvelope.data,
    workoutIntent: recoveredWorkoutIntent,
  });
  const guarded = blockExecutableIntentWithoutWorkoutIntent(recoveredIntent);

  return {
    ok: true,
    intent: guarded.intent,
    diagnostics: createChatIntentDiagnostics({
      rawValue: value,
      intent: guarded.intent,
      parseMode: "interaction_recovery",
      workoutIntentValid: Boolean(recoveredWorkoutIntent),
      executionBlockedReason: guarded.reason,
    }),
  };
}

export const chatRequestSchema = z.object({
  conversationId: z.string().trim().min(1).max(120).optional(),
  responseMessageId: z.string().trim().min(1).max(120).optional(),
  latestUserMessage: z.string().trim().min(1).max(4000),
  conversationSummary: z.string().trim().max(2000).default(""),
  messages: z.array(aiContextChatMessageSchema).min(1).max(200).optional(),
  conversationContext: fitnessConversationContextSchema.optional(),
  thinkingEnabled: z.boolean().optional(),
});

export type AiChatRequest = z.infer<typeof chatRequestSchema>;

export type PreparedAiChatRequest = {
  conversationId?: string;
  responseMessageId?: string;
  rawMessages: ChatMessage[];
  messages: ChatMessage[];
  conversationSummaryContext: ConversationSummaryContext;
  internalConversationContext: FitnessConversationContext;
  recentArtifactSummaries: RecentArtifactSummary[];
  thinkingEnabled: boolean;
  hasClientConversationSummary: boolean;
};

export type AssistantAction = {
  action: Exclude<ResolvedActionKind, "none">;
  intent: WorkoutPlanIntent;
  resolvedIntent?: ResolvedChatIntent;
  referenceResolution?: Extract<ReferenceResolution, { status: "resolved" }>;
};

export type ChatArtifactResult =
  | {
      status: "success";
      kind: "exercise_recommendation";
      payload: ExerciseRecommendationCard;
      intent: WorkoutPlanIntent;
      assistantSuggestions?: AssistantSuggestion[];
    }
  | {
      status: "success";
      kind: "routine" | "plan";
      payload: Extract<AiWorkoutPlanResult, { ok: true }>["draft"];
      intent: WorkoutPlanIntent;
      candidates: Extract<AiWorkoutPlanResult, { ok: true }>["candidates"];
      assistantSuggestions?: AssistantSuggestion[];
    }
  | {
      status: "failed";
      kind: "exercise_recommendation" | "routine" | "plan";
      message: string;
      recoverable: boolean;
      guidanceMessage?: string;
      suggestedReplies: string[];
      detail?: unknown;
    };

export type ExerciseContext = {
  intent: WorkoutPlanIntent;
  providedExercises: Array<{
    /** 服务端完整动作事实源，artifact 展示字段从这里补齐，不暴露给模型。 */
    exercise: Exercise;
    exerciseId: string;
    nameZh: string;
    categoryZh: string;
    level: string;
    equipmentZh: string;
    primaryMusclesZh: string[];
    secondaryMusclesZh: string[];
    riskTags: string[];
    goalTags: string[];
    matchingReasons?: string[];
    source: "primary" | "supplementary" | "name_match";
  }>;
  candidateStatus: "enough" | "limited_but_usable" | "insufficient";
  relevantCandidateCount: number;
  requiredRelevantCandidateCount: number;
  warnings: string[];
  candidateTrim?: CandidateTrimSummary;
};

const DEEPSEEK_REQUEST_TIMEOUT_MS = 45_000;
const INTENT_REQUEST_TIMEOUT_MS = 12_000;

export function prepareAiChatRequest(request: AiChatRequest): PreparedAiChatRequest {
  const rawMessages = normalizeAiContextMessages(
    request.messages ?? [{ role: "user", content: request.latestUserMessage }],
  );
  const messages = [{ role: "user" as const, content: request.latestUserMessage }];
  const conversationSummaryContext = buildConversationSummaryContext({
    summary: request.conversationSummary,
    latestUserMessage: request.latestUserMessage,
  });

  return {
    conversationId: request.conversationId,
    responseMessageId: request.responseMessageId,
    rawMessages,
    conversationSummaryContext,
    internalConversationContext:
      request.conversationContext ?? buildFitnessConversationContext(rawMessages),
    recentArtifactSummaries: [],
    messages,
    thinkingEnabled: request.thinkingEnabled !== false,
    hasClientConversationSummary: request.conversationSummary.trim().length > 0,
  };
}

export function encodeChatStreamEvent(type: string, delta = "", metadata?: Record<string, unknown>) {
  return new TextEncoder().encode(`${JSON.stringify({ type, delta, ...metadata })}\n`);
}

export async function createAiChatResponse({
  apiKey,
  request,
  trace,
}: {
  apiKey: string;
  request: PreparedAiChatRequest;
  trace: AiTraceLogger;
}): Promise<Response> {
  const {
    rawMessages,
    conversationSummaryContext,
    internalConversationContext,
    messages,
    recentArtifactSummaries,
    thinkingEnabled,
  } = request;

  trace.addStep({
    name: "用户输入",
    type: "user_input",
    input: {
      messages: rawMessages,
      latestUserMessage: conversationSummaryContext.latestUserMessage,
      conversationSummary: conversationSummaryContext.summary,
      recentArtifactSummaries: summarizeRecentArtifactsForTrace(recentArtifactSummaries),
      aiContextMessages: messages,
      thinkingEnabled,
    },
  });

  let chatIntent = await resolveChatIntent(
    apiKey,
    messages,
    conversationSummaryContext,
    internalConversationContext,
    recentArtifactSummaries,
    trace,
  );
  const user = await getCurrentUser();
  const exercisesForMemory = chatIntent.needsExerciseContext || shouldInspectUserFeedback(conversationSummaryContext.latestUserMessage)
    ? await listAllExercises()
    : [];
  const feedbackWrite = await recordUserFeedbackFromChat({
    userId: user.id,
    latestUserMessage: conversationSummaryContext.latestUserMessage,
    exercises: exercisesForMemory,
  });
  const memoryState = await buildConversationMemoryState({
    userId: user.id,
    latestUserMessage: conversationSummaryContext.latestUserMessage,
    exercises: exercisesForMemory,
  });

  trace.addStep({
    name: "用户反馈记忆状态",
    type: "persistence",
    output: {
      feedbackWrite,
      currentMessage: memoryState.currentMessage,
      activeMemoryCount: memoryState.activeMemories.length,
      activeExerciseFeedbackCount: memoryState.activeExerciseFeedback.length,
      recentWorkoutFeedbackCount: memoryState.recentWorkoutFeedback.length,
    },
  });
  const referenceResolution = shouldAttemptReferenceResolution(
    conversationSummaryContext.latestUserMessage,
    chatIntent.type,
  ) && shouldUseReferenceResolutionForChat({
    latestUserMessage: conversationSummaryContext.latestUserMessage,
    chatIntent,
    conversationContext: internalConversationContext,
    recentArtifactSummaries,
  })
    ? await resolveReference({
        latestUserMessage: conversationSummaryContext.latestUserMessage,
        sessionId: request.conversationId,
        recentArtifacts: recentArtifactSummaries,
        intentType: chatIntent.type,
        trace,
      })
    : null;

  trace.addStep({
    name: "引用解析结果",
    type: "reference_resolution",
    output: summarizeReferenceResolutionForTrace(referenceResolution),
    metadata: {
      skipped: !referenceResolution,
      status: referenceResolution?.status,
      reason: referenceResolution?.reason,
    },
  });

  if (referenceResolution?.status === "ambiguous" || referenceResolution?.status === "not_found") {
    traceReadonlyToolLoopSkipped(trace, "引用解析需要澄清，确定性早返回不进入只读工具循环。", {
      skippedReason: "reference_resolution_clarification",
      referenceResolutionStatus: referenceResolution.status,
    });
    const assistantReply = buildReferenceResolutionReply(referenceResolution);
    const tokenBudgetDecision = createChatTokenBudgetDecision({
      intentType: chatIntent.type,
      needsExerciseContext: false,
      hasAssistantAction: false,
      latestUserMessage: conversationSummaryContext.latestUserMessage,
      conversationSummary: conversationSummaryContext.summary,
      deterministicReplyReason: "引用解析需要用户澄清，服务端直接生成确定性回复。",
      summarySkipReason: shouldSkipConversationSummaryUpdate({
        previousSummary: conversationSummaryContext.summary,
        latestUserMessage: conversationSummaryContext.latestUserMessage,
        assistantReply,
      }),
    });
    traceTokenBudgetDecision(trace, tokenBudgetDecision);

    return createDeterministicChatResponse({
      apiKey,
      trace,
      conversationSummaryContext,
      assistantReply,
      internalActionSummary: JSON.stringify({ referenceResolution }),
      assistantSuggestions: buildReferenceResolutionAssistantSuggestions(referenceResolution),
      tokenBudgetDecision,
    });
  }

  if (referenceResolution?.status === "resolved") {
    const patchResult = await buildAndApplyWorkoutPatchFromChat({
      userId: user.id,
      latestUserMessage: conversationSummaryContext.latestUserMessage,
      referenceResolution,
      responseMessageId: request.responseMessageId,
      memoryState,
      trace,
    });

    trace.addStep({
      name: "聊天 Patch 编排结果",
      type: "patch_proposal",
      status: patchResult.handled && patchResult.result.status !== "applied" ? "failed" : "success",
      output: patchResult.handled
        ? summarizeWorkoutPatchResultForTrace(patchResult.result)
        : patchResult,
      metadata: {
        handled: patchResult.handled,
        resultStatus: patchResult.handled ? patchResult.result.status : undefined,
      },
    });

    if (patchResult.handled) {
      traceReadonlyToolLoopSkipped(trace, "Workout Patch 已由服务端确定性链路处理，不进入只读工具循环。", {
        skippedReason: "patch_deterministic_handled",
        patchStatus: patchResult.result.status,
      });
      const assistantReply = formatWorkoutPatchReply(patchResult.result);
      const tokenBudgetDecision = createChatTokenBudgetDecision({
        intentType: chatIntent.type,
        needsExerciseContext: false,
        hasAssistantAction: false,
        latestUserMessage: conversationSummaryContext.latestUserMessage,
        conversationSummary: conversationSummaryContext.summary,
        deterministicReplyReason: "Workout Patch 链路已由服务端确定性回复完成。",
        summarySkipReason: shouldSkipConversationSummaryUpdate({
          previousSummary: conversationSummaryContext.summary,
          latestUserMessage: conversationSummaryContext.latestUserMessage,
          assistantReply,
          internalActionSummary: JSON.stringify({ referenceResolution, workoutPatch: patchResult.result }),
        }),
      });
      traceTokenBudgetDecision(trace, tokenBudgetDecision);

      return createDeterministicChatResponse({
        apiKey,
        trace,
        conversationSummaryContext,
        assistantReply,
        internalActionSummary: JSON.stringify({ referenceResolution, workoutPatch: patchResult.result }),
        workoutPatchResult: patchResult.result,
        assistantSuggestions: buildWorkoutPatchAssistantSuggestions(patchResult.result),
        tokenBudgetDecision,
      });
    }
  }

  if (referenceResolution?.status === "resolved" && chatIntent.type === "exercise_explanation") {
    traceReadonlyToolLoopSkipped(trace, "动作序号讲解已由服务端确定性读取，不进入只读工具循环。", {
      skippedReason: "exercise_explanation_deterministic_handled",
    });
    const explanationResult = await buildReferencedExerciseExplanationFromChat({
      userId: user.id,
      latestUserMessage: conversationSummaryContext.latestUserMessage,
      referenceResolution,
      trace,
    });
    const assistantReply = explanationResult.assistantReply;
    const internalActionSummary = JSON.stringify({
      referenceResolution,
      exerciseExplanation: explanationResult.summary,
    });
    const tokenBudgetDecision = createChatTokenBudgetDecision({
      intentType: chatIntent.type,
      needsExerciseContext: false,
      hasAssistantAction: false,
      latestUserMessage: conversationSummaryContext.latestUserMessage,
      conversationSummary: conversationSummaryContext.summary,
      deterministicReplyReason: "动作序号讲解已由服务端读取 artifact 和动作库后确定性回复。",
      summarySkipReason: shouldSkipConversationSummaryUpdate({
        previousSummary: conversationSummaryContext.summary,
        latestUserMessage: conversationSummaryContext.latestUserMessage,
        assistantReply,
        internalActionSummary,
      }),
    });
    traceTokenBudgetDecision(trace, tokenBudgetDecision);

    return createDeterministicChatResponse({
      apiKey,
      trace,
      conversationSummaryContext,
      assistantReply,
      internalActionSummary,
      tokenBudgetDecision,
    });
  }

  let exerciseContext = chatIntent.needsExerciseContext
    ? await buildExerciseContext(
        chatIntent,
        messages,
        internalConversationContext,
        {
          userId: user.id,
          exercises: exercisesForMemory,
          memoryState,
          trace,
        },
      )
    : null;
  let assistantAction = resolveAssistantAction(
    chatIntent,
    exerciseContext,
    referenceResolution?.status === "resolved" ? referenceResolution : undefined,
  );
  let resolvedIntent = createResolvedChatIntent({
    chatIntent,
    exerciseContext,
    assistantAction,
    referenceResolution,
  });
  let gate = validateResolvedIntentGate(resolvedIntent);

  if (!gate.valid) {
    const repair = await repairResolvedIntent({
      apiKey,
      messages,
      conversationSummaryContext,
      originalIntent: resolvedIntent,
      violations: gate.violations,
      trace,
    });

    if (repair.valid) {
      resolvedIntent = repair.intent;
      chatIntent = deriveChatIntentFromResolvedIntent(chatIntent, resolvedIntent);
      exerciseContext = chatIntent.needsExerciseContext
        ? await buildExerciseContext(
            chatIntent,
            messages,
            internalConversationContext,
            {
              userId: user.id,
              exercises: exercisesForMemory,
              memoryState,
              trace,
            },
          )
        : null;
      assistantAction = resolveAssistantAction(
        chatIntent,
        exerciseContext,
        referenceResolution?.status === "resolved" ? referenceResolution : undefined,
      );
      resolvedIntent = createResolvedChatIntent({
        chatIntent,
        exerciseContext,
        assistantAction,
        referenceResolution,
        preferredResolvedIntent: resolvedIntent,
      });
      gate = validateResolvedIntentGate(resolvedIntent);
    }

    if (!gate.valid) {
      resolvedIntent = createClarificationResolvedIntent(resolvedIntent, gate.violations);
      chatIntent = deriveChatIntentFromResolvedIntent(chatIntent, resolvedIntent);
      assistantAction = null;
    }
  }

  const visibleSuggestedReplies = resolveVisibleSuggestedReplies(chatIntent, assistantAction);
  if (assistantAction) {
    assistantAction = {
      ...assistantAction,
      resolvedIntent,
    };
  }
  trace.addStep({
    name: "Resolved intent 门控结果",
    type: "intent",
    status: gate.valid ? "success" : "failed",
    output: {
      rawIntent: chatIntent,
      resolvedIntent,
      gate,
      assistantAction,
      canTriggerAction: chatIntent.canTriggerAction,
      missingActionFields: chatIntent.missingActionFields,
      suggestedReplies: visibleSuggestedReplies,
      suppressedSuggestedReplies: chatIntent.suggestedReplies.filter(
        (reply) => !visibleSuggestedReplies.includes(reply),
      ),
      candidateStatus: exerciseContext?.candidateStatus,
    },
    metadata: {
      skipped: !assistantAction,
      responseMode: resolvedIntent.responseMode,
      actionKind: resolvedIntent.action.kind,
    },
  });
  const artifactResult = assistantAction
    ? await generateChatArtifact({
        apiKey,
        latestUserMessage: conversationSummaryContext.latestUserMessage,
        conversationSummary: conversationSummaryContext.summary,
        assistantAction,
        exerciseContext,
        trace,
      })
    : null;
  const assistantSuggestionResult = resolveAssistantSuggestions({
    chatIntent,
    assistantAction,
    artifactResult,
  });
  const assistantSuggestions = assistantSuggestionResult.assistantSuggestions;
  trace.addStep({
    name: "统一建议归一化结果",
    type: "intent",
    output: {
      assistantSuggestions,
    },
    metadata: assistantSuggestionResult.diagnostics,
  });
  const readonlyToolEligibility = decideReadonlyToolLoopEligibility({
    latestUserMessage: conversationSummaryContext.latestUserMessage,
    resolvedIntent,
    referenceResolution,
    assistantActionExists: Boolean(assistantAction || artifactResult),
  });
  const readonlyToolContextBundle = await runReadonlyToolLoop({
    apiKey,
    userId: user.id,
    sessionId: request.conversationId,
    messages,
    conversationSummaryContext,
    resolvedIntent,
    referenceResolution,
    trace,
    eligibility: readonlyToolEligibility,
  });
  const tokenBudgetDecision = createChatTokenBudgetDecision({
    intentType: chatIntent.type,
    needsExerciseContext: chatIntent.needsExerciseContext,
    hasAssistantAction: Boolean(assistantAction),
    latestUserMessage: conversationSummaryContext.latestUserMessage,
    conversationSummary: conversationSummaryContext.summary,
    candidateTrim: exerciseContext?.candidateTrim,
    summarySkipReason: shouldSkipConversationSummaryUpdate({
      previousSummary: conversationSummaryContext.summary,
      latestUserMessage: conversationSummaryContext.latestUserMessage,
      assistantReply: "",
      internalActionSummary: summarizeAssistantAction(assistantAction, artifactResult),
    }),
  });
  traceTokenBudgetDecision(trace, tokenBudgetDecision);

  const systemPrompt = buildSystemPrompt(
    chatIntent,
    exerciseContext,
    conversationSummaryContext,
    assistantAction,
    resolvedIntent,
    artifactResult,
    recentArtifactSummaries,
    referenceResolution,
    memoryState,
    tokenBudgetDecision,
    readonlyToolContextBundle,
  );
  const finalResponseStage = getStageDecision(tokenBudgetDecision, "chat_final_response");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPSEEK_REQUEST_TIMEOUT_MS);
  let response: Response;

  trace.addStep({
    name: "生成用户回复大模型调用参数",
    type: "model_request",
    input: {
      model: "deepseek-v4-flash",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
      stream_options: {
        include_usage: true,
      },
      thinking: {
        type: thinkingEnabled ? "enabled" : "disabled",
      },
    },
    metadata: {
      aiStage: "chat_final_response",
      aiStageStatus: "executed",
      promptModules: finalResponseStage?.promptModules ?? [],
      tokenBudgetDecision,
      candidateTrim: exerciseContext?.candidateTrim,
      intent: chatIntent.type,
      exerciseContextCount: exerciseContext?.providedExercises.length ?? 0,
      readonlyToolContext: {
        available: readonlyToolContextBundle.available,
        stopReason: readonlyToolContextBundle.stopReason,
        decisionCallCount: readonlyToolContextBundle.decisionCallCount,
        toolExecutionCount: readonlyToolContextBundle.toolExecutionCount,
        truncated: readonlyToolContextBundle.truncated,
      },
      modelVisibleMessageCount: 2,
      timeoutMs: DEEPSEEK_REQUEST_TIMEOUT_MS,
    },
  });

  try {
    response = await serverRequest("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      responseType: "raw",
      throwOnError: false,
      signal: controller.signal,
      body: {
        model: "deepseek-v4-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
        stream_options: {
          include_usage: true,
        },
        thinking: {
          type: thinkingEnabled ? "enabled" : "disabled",
        },
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    trace.addStep({
      name: "聊天模型请求失败",
      type: "error",
      status: "failed",
      error,
    });
    trace.finish("failed", createFinalDecision({
      status: "hard_failure",
      responseType: "error_response",
      reason: "聊天模型请求失败。",
      code: "deepseek_request_failed",
    }));
    console.warn("[chat] deepseek_failed", {
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "DeepSeek API request timed out."
          : "DeepSeek API request failed.",
      detail: error instanceof Error ? error.message : error,
    });

    return Response.json(
      {
        error:
          error instanceof DOMException && error.name === "AbortError"
            ? "DeepSeek API request timed out."
            : "DeepSeek API request failed.",
      },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    clearTimeout(timeout);
    trace.addStep({
      name: "聊天模型响应失败",
      type: "error",
      status: "failed",
      output: {
        status: response.status,
        detail: errorText,
      },
    });
    trace.finish("failed", createFinalDecision({
      status: "hard_failure",
      responseType: "error_response",
      reason: "聊天模型返回失败状态。",
      code: "deepseek_response_failed",
    }));

    console.warn("[chat] deepseek_failed", {
      status: response.status,
      detail: errorText,
    });

    return Response.json(
      {
        error: "DeepSeek API request failed.",
        detail: errorText,
      },
      { status: response.status },
    );
  }

  if (!response.body) {
    clearTimeout(timeout);
    trace.addStep({
      name: "聊天模型响应为空",
      type: "error",
      status: "failed",
      output: {
        status: 502,
        detail: "DeepSeek API returned an empty stream.",
      },
    });
    trace.finish("failed", createFinalDecision({
      status: "hard_failure",
      responseType: "error_response",
      reason: "聊天模型返回空流。",
      code: "empty_stream",
    }));
    console.warn("[chat] deepseek_failed", {
      status: 502,
      detail: "DeepSeek API returned an empty stream.",
    });

    return Response.json(
      { error: "DeepSeek API returned an empty stream." },
      { status: 502 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let contentText = "";
      let reasoningText = "";
      let tokenUsage: DeepSeekTokenUsage | null = null;

      if (assistantAction) {
        controller.enqueue(
          encodeChatStreamEvent("intent_resolved", "", {
            resolvedIntent,
            action: assistantAction.action,
            intent: assistantAction.intent,
            fieldSources: resolvedIntent.fieldSources,
            referenceResolution: assistantAction.referenceResolution,
          }),
        );
        controller.enqueue(
          encodeChatStreamEvent("assistant_action", "", {
            action: assistantAction.action,
            intent: assistantAction.intent,
            resolvedIntent,
            resolvedAction: resolvedIntent.action,
            fieldSources: resolvedIntent.fieldSources,
            referenceResolution: assistantAction.referenceResolution,
          }),
        );
      }

      if (assistantSuggestions.length > 0) {
        const legacySuggestedReplies = assistantSuggestions.map((suggestion) => suggestion.message);
        controller.enqueue(
          encodeChatStreamEvent("assistant_suggestions", "", {
            assistantSuggestions,
          }),
        );
        controller.enqueue(
          encodeChatStreamEvent("suggested_replies", "", {
            suggestedReplies: legacySuggestedReplies,
          }),
        );
      }

      if (!reader) {
        clearTimeout(timeout);
        trace.addStep({
          name: "聊天模型响应为空",
          type: "error",
          status: "failed",
          output: "DeepSeek API returned an empty stream.",
        });
        trace.finish("failed", createFinalDecision({
          status: "hard_failure",
          responseType: "stream_error",
          reason: "聊天模型返回空流。",
          code: "empty_stream",
        }));
        controller.enqueue(encodeChatStreamEvent("error", "DeepSeek API returned an empty stream."));
        controller.close();
        return;
      }

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();

            if (!line.startsWith("data:")) {
              continue;
            }

            const data = line.replace(/^data:\s*/, "");

            if (data === "[DONE]") {
              clearTimeout(timeout);
              trace.addStep({
                name: "生成用户回复大模型回答",
                type: "model_response",
                output: {
                  content: contentText,
                  reasoning: reasoningText,
                },
                metadata: {
                  tokenUsage,
                },
              });
              const summaryUpdate = await updateConversationSummary({
                apiKey,
                previousSummary: conversationSummaryContext.summary,
                latestUserMessage: conversationSummaryContext.latestUserMessage,
                assistantReply: contentText,
                internalActionSummary: summarizeAssistantAction(assistantAction, artifactResult),
                trace,
                tokenBudgetDecision,
              });
              trace.addStep({
                name: "聊天回复写入完成",
                type: "response_write",
                output: {
                  contentLength: contentText.length,
                  reasoningLength: reasoningText.length,
                  conversationSummarySource: summaryUpdate.source,
                },
              });
              for (const artifactEvent of buildChatArtifactStreamEvents(artifactResult)) {
                controller.enqueue(encodeChatStreamEvent(artifactEvent.type, "", artifactEvent.metadata));
              }
              trace.finish("success", createFinalDecision({
                status: "success",
                responseType: assistantAction ? "assistant_action_stream" : "chat_stream",
                reason: "聊天回复已流式输出并完成上下文总结更新。",
              }));
              controller.enqueue(
                encodeChatStreamEvent("done", "", {
                  traceId: trace.id,
                  conversationSummary: summaryUpdate.summary,
                }),
              );
              controller.close();
              return;
            }

            const chunk = JSON.parse(data) as DeepSeekStreamChunk;
            if (chunk.usage) {
              tokenUsage = chunk.usage;
            }

            const delta = chunk.choices?.[0]?.delta;
            const reasoning = delta?.reasoning_content;
            const content = delta?.content;

            if (reasoning) {
              reasoningText += reasoning;
              controller.enqueue(encodeChatStreamEvent("reasoning", reasoning));
            }

            if (content) {
              contentText += content;
              controller.enqueue(encodeChatStreamEvent("content", content));
            }
          }
        }

        clearTimeout(timeout);
        trace.addStep({
          name: "生成用户回复大模型回答",
          type: "model_response",
          output: {
            content: contentText,
            reasoning: reasoningText,
          },
          metadata: {
            tokenUsage,
          },
        });
        const summaryUpdate = await updateConversationSummary({
          apiKey,
          previousSummary: conversationSummaryContext.summary,
          latestUserMessage: conversationSummaryContext.latestUserMessage,
          assistantReply: contentText,
          internalActionSummary: summarizeAssistantAction(assistantAction, artifactResult),
          trace,
          tokenBudgetDecision,
        });
        trace.addStep({
          name: "聊天回复写入完成",
          type: "response_write",
          output: {
            contentLength: contentText.length,
            reasoningLength: reasoningText.length,
            conversationSummarySource: summaryUpdate.source,
          },
        });
        trace.finish("success", createFinalDecision({
          status: "success",
          responseType: assistantAction ? "assistant_action_stream" : "chat_stream",
          reason: "聊天回复已流式输出并完成上下文总结更新。",
        }));
        controller.enqueue(
          encodeChatStreamEvent("done", "", {
            traceId: trace.id,
            conversationSummary: summaryUpdate.summary,
          }),
        );
        controller.close();
      } catch (error) {
        clearTimeout(timeout);
        trace.addStep({
          name: "聊天模型流式读取失败",
          type: "error",
          status: "failed",
          error,
        });
        trace.finish("failed", createFinalDecision({
          status: "hard_failure",
          responseType: "stream_error",
          reason: "聊天流式读取失败。",
          code: "stream_read_failed",
        }));
        console.warn("[chat] deepseek_failed", {
          message:
            error instanceof DOMException && error.name === "AbortError"
              ? "DeepSeek API stream timed out."
              : "Failed to read DeepSeek stream.",
          detail: error instanceof Error ? error.message : error,
        });
        controller.enqueue(
          encodeChatStreamEvent(
            "error",
            error instanceof Error ? error.message : "Failed to read DeepSeek stream.",
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

function createDeterministicChatResponse(input: {
  apiKey: string;
  trace: AiTraceLogger;
  conversationSummaryContext: ConversationSummaryContext;
  assistantReply: string;
  internalActionSummary?: string;
  workoutPatchResult?: WorkoutPatchResult;
  assistantSuggestions?: AssistantSuggestion[];
  tokenBudgetDecision: AiTokenBudgetDecision;
}) {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      input.trace.addStep({
        name: "服务端确定性回复",
        type: "final_response",
        output: {
          content: input.assistantReply,
          internalActionSummary: input.internalActionSummary,
        },
      });
      if (input.workoutPatchResult?.status === "applied") {
        controller.enqueue(
          encodeChatStreamEvent("workout_patch", "", {
            artifactKind: input.workoutPatchResult.artifactKind,
            artifactId: input.workoutPatchResult.artifactId,
            sourceArtifactId: input.workoutPatchResult.sourceArtifactId,
            payload: input.workoutPatchResult.payload,
            diff: input.workoutPatchResult.diff,
          }),
        );
      }
      if (input.assistantSuggestions?.length) {
        input.trace.addStep({
          name: "确定性回复统一建议",
          type: "intent",
          output: {
            assistantSuggestions: input.assistantSuggestions,
          },
        });
        controller.enqueue(
          encodeChatStreamEvent("assistant_suggestions", "", {
            assistantSuggestions: input.assistantSuggestions,
          }),
        );
        controller.enqueue(
          encodeChatStreamEvent("suggested_replies", "", {
            suggestedReplies: input.assistantSuggestions.map((suggestion) => suggestion.message),
          }),
        );
      }
      controller.enqueue(encodeChatStreamEvent("content", input.assistantReply));

      const summaryUpdate = await updateConversationSummary({
        apiKey: input.apiKey,
        previousSummary: input.conversationSummaryContext.summary,
        latestUserMessage: input.conversationSummaryContext.latestUserMessage,
        assistantReply: input.assistantReply,
        internalActionSummary: input.internalActionSummary,
        tokenBudgetDecision: input.tokenBudgetDecision,
        trace: input.trace,
      });
      input.trace.addStep({
        name: "确定性回复写入完成",
        type: "response_write",
        output: {
          contentLength: input.assistantReply.length,
          conversationSummarySource: summaryUpdate.source,
          emittedWorkoutPatch: input.workoutPatchResult?.status === "applied",
        },
      });
      input.trace.finish("success", createFinalDecision({
        status: input.workoutPatchResult && input.workoutPatchResult.status !== "applied"
          ? "recoverable_failure"
          : "success",
        responseType: input.workoutPatchResult ? "workout_patch_response" : "deterministic_chat_response",
        reason: input.workoutPatchResult?.message ?? "服务端确定性回复已输出。",
        code: input.workoutPatchResult?.failureReasons[0],
      }));
      controller.enqueue(
        encodeChatStreamEvent("done", "", {
          traceId: input.trace.id,
          conversationSummary: summaryUpdate.summary,
        }),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

async function resolveChatIntent(
  apiKey: string,
  messages: ChatMessage[],
  conversationSummaryContext: ConversationSummaryContext,
  internalConversationContext: FitnessConversationContext,
  recentArtifactSummaries: RecentArtifactSummary[],
  trace?: AiTraceLogger,
): Promise<ChatIntent> {
  const fallbackIntent = createFallbackChatIntent(messages, internalConversationContext, conversationSummaryContext.summary);
  const contextPrompt = formatConversationSummaryContextForPrompt(conversationSummaryContext);
  const artifactPrompt = formatRecentArtifactSummariesForPrompt(recentArtifactSummaries);
  const promptModules: AiPromptModuleId[] = ["base_safety", "conversation_summary_context", "chat_intent_resolution"];

  try {
    const modelMessages: DeepSeekChatMessage[] = [
      {
        role: "system",
        content: [buildPromptFromModules(promptModules), contextPrompt, artifactPrompt]
          .filter(Boolean)
          .join("\n\n"),
      },
      ...messages,
    ];

    trace?.addStep({
      name: "意图判断请求参数",
      type: "model_request",
      input: {
        model: "deepseek-v4-flash",
        messages: modelMessages,
        stream: false,
        response_format: {
          type: "json_object",
        },
      },
      metadata: {
        aiStage: "chat_intent_resolution",
        aiStageStatus: "executed",
        promptModules,
        modelVisibleContext: {
          usesConversationSummary: conversationSummaryContext.summary.trim().length > 0,
          usesLatestUserMessage: true,
          usesFullHistory: false,
        },
      },
    });

    const result = await requestDeepSeekJson(apiKey, modelMessages, trace);

    if (!result.ok) {
      trace?.addStep({
        name: "意图解析失败，使用兜底意图",
        type: "intent",
        status: "failed",
        output: fallbackIntent,
        error: result,
      });
      console.warn("[chat] intent_resolution_failed", result);
      return fallbackIntent;
    }

    const parsedIntent = parseChatIntentModelOutput(result.value, fallbackIntent);

    if (!parsedIntent.ok) {
      trace?.addStep({
        name: "意图校验失败，使用兜底意图",
        type: "intent",
        status: "failed",
        output: fallbackIntent,
        error: parsedIntent.error,
        metadata: parsedIntent.diagnostics,
      });
      console.warn("[chat] intent_validation_failed", {
        detail: parsedIntent.error,
        value: result.value,
      });
      return fallbackIntent;
    }

    const data = parsedIntent.intent;
    trace?.addStep({
      name: parsedIntent.diagnostics.parseMode === "interaction_recovery"
        ? "意图判断结构化结果（部分恢复）"
        : parsedIntent.diagnostics.normalizedWorkoutIntentNull
          ? "意图判断结构化结果（归一化）"
          : "意图判断结构化结果",
      type: "intent",
      status: parsedIntent.diagnostics.executionBlockedReason ? "failed" : "success",
      output: data,
      metadata: {
        ...parsedIntent.diagnostics,
        visibleSuggestedRepliesBeforeActionGate: resolveVisibleSuggestedReplies(data, null),
      },
    });

    const normalizedIntent = normalizeChatIntentForBlackboxFlows({
      chatIntent: data,
      fallbackIntent,
      messages,
      conversationSummaryContext,
      conversationContext: internalConversationContext,
      recentArtifactSummaries,
    });

    if (normalizedIntent !== data) {
      trace?.addStep({
        name: "意图归一化结果",
        type: "intent",
        output: normalizedIntent,
        metadata: {
          sourceType: data.type,
          normalizedType: normalizedIntent.type,
        },
      });
    }

    if (normalizedIntent.needsExerciseContext && !normalizedIntent.workoutIntent) {
      return {
        ...normalizedIntent,
        workoutIntent: fallbackIntent.workoutIntent,
      };
    }

    return normalizedIntent;
  } catch (error) {
    trace?.addStep({
      name: "意图解析异常，使用兜底意图",
      type: "intent",
      status: "failed",
      output: fallbackIntent,
      error,
    });
    console.warn("[chat] intent_resolution_failed", {
      detail: error instanceof Error ? error.message : error,
    });
    return fallbackIntent;
  }
}

// 真实模型输出可能在高频短句上漂移；这里把黑盒主路径收敛为服务端可测试边界。
export function normalizeChatIntentForBlackboxFlows(input: {
  chatIntent: ChatIntent;
  fallbackIntent: ChatIntent;
  messages: ChatMessage[];
  conversationSummaryContext: ConversationSummaryContext;
  conversationContext: FitnessConversationContext;
  recentArtifactSummaries?: RecentArtifactSummary[];
}): ChatIntent {
  const latestUserMessage = getLatestUserMessage(input.messages);
  const contextualIntent = resolveContextualWorkoutIntent(input);
  const priorContextIntent =
    input.conversationContext.currentIntent ?? buildWorkoutIntentFromRecentArtifact(input.recentArtifactSummaries?.[0]);
  const hasPriorTrainingContext = Boolean(
    priorContextIntent ||
    input.conversationContext.knownFacts.goal ||
    input.recentArtifactSummaries?.length,
  );
  const hasAnyPriorWorkoutContext =
    hasPriorTrainingContext || hasDurableConditionFacts(input.conversationContext);

  if (isStandaloneConditionMessage(latestUserMessage) && !hasPriorTrainingContext) {
    return {
      type: "general_fitness_advice",
      needsExerciseContext: false,
      requestedExerciseName: input.chatIntent.requestedExerciseName ?? "",
      canTriggerAction: false,
      missingActionFields: [],
      suggestedReplies: [],
    };
  }

  if (isOrdinalExerciseExplanationMessage(latestUserMessage)) {
    return {
      type: "exercise_explanation",
      needsExerciseContext: false,
      requestedExerciseName: input.chatIntent.requestedExerciseName ?? "",
      canTriggerAction: false,
      missingActionFields: [],
      suggestedReplies: [],
    };
  }

  if (
    hasRecentExerciseRecommendationContext(input.recentArtifactSummaries, input.conversationSummaryContext.summary) &&
    isRecommendationRefinementMessage(latestUserMessage)
  ) {
    const workoutIntent = applyCurrentMessageOverrides(
      contextualIntent ?? input.chatIntent.workoutIntent ?? input.fallbackIntent.workoutIntent,
      latestUserMessage,
      "routine",
    );

    return {
      ...input.chatIntent,
      type: "exercise_recommendation",
      needsExerciseContext: true,
      workoutIntent,
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };
  }

  if (hasPriorPlanCadenceContext(input.conversationContext) && isPlanCompletionMessage(latestUserMessage)) {
    const workoutIntent = applyCurrentMessageOverrides(
      contextualIntent ?? input.chatIntent.workoutIntent ?? input.fallbackIntent.workoutIntent,
      latestUserMessage,
      "plan",
    );

    return {
      ...input.chatIntent,
      type: "workout_plan",
      needsExerciseContext: true,
      workoutIntent,
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };
  }

  if (isPureTargetRecommendationMessage(latestUserMessage)) {
    const workoutIntent = applyCurrentMessageOverrides(
      contextualIntent ?? input.chatIntent.workoutIntent ?? input.fallbackIntent.workoutIntent,
      latestUserMessage,
      "routine",
    );

    return {
      ...input.chatIntent,
      type: "exercise_recommendation",
      needsExerciseContext: true,
      workoutIntent,
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };
  }

  if (isCompleteSingleSessionRoutineMessage(latestUserMessage)) {
    const workoutIntent = applyCurrentMessageOverrides(
      contextualIntent ?? input.chatIntent.workoutIntent ?? input.fallbackIntent.workoutIntent,
      latestUserMessage,
      "routine",
    );

    return {
      ...input.chatIntent,
      type: "routine",
      needsExerciseContext: true,
      workoutIntent,
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };
  }

  if (isUnderSpecifiedLongTermPlanRequest(latestUserMessage, input.conversationContext)) {
    const workoutIntent = applyCurrentMessageOverrides(
      contextualIntent ?? input.chatIntent.workoutIntent ?? input.fallbackIntent.workoutIntent,
      latestUserMessage,
      "plan",
    );

    return {
      ...input.chatIntent,
      type: "workout_plan",
      needsExerciseContext: true,
      workoutIntent,
      canTriggerAction: false,
      missingActionFields: ["trainingGoal", "weeklyFrequency", "equipmentOrLocation"],
      suggestedReplies: [
        "我想增肌，每周4练，每次45分钟，有健身房器械",
        "我想减脂，每周3练，每次30分钟，在家自重",
        "我想提升体能，每周5练，每次40分钟",
      ],
    };
  }

  if (isLongTermPlanMessage(latestUserMessage)) {
    const workoutIntent = applyCurrentMessageOverrides(
      contextualIntent ?? input.chatIntent.workoutIntent ?? input.fallbackIntent.workoutIntent,
      latestUserMessage,
      "plan",
    );
    const canTriggerPlan = canTriggerLongTermPlanFromContext(
      latestUserMessage,
      workoutIntent,
      hasPriorTrainingContext,
      input.conversationContext,
    );

    return {
      ...input.chatIntent,
      type: "workout_plan",
      needsExerciseContext: true,
      workoutIntent,
      canTriggerAction: canTriggerPlan,
      missingActionFields: canTriggerPlan
        ? input.chatIntent.missingActionFields.filter(
            (field) => !isPlanDefaultableMissingField(field, workoutIntent),
          )
        : ["trainingGoal", "equipmentOrLocation"],
      suggestedReplies: canTriggerPlan
        ? []
        : [
            "我的目标是增肌，有健身房器械",
            "我的目标是减脂，在家自重",
            "我想提升体能，没有特殊器械",
          ],
    };
  }

  if (hasAnyPriorWorkoutContext && isContextualWorkoutAdjustment(latestUserMessage)) {
    const intentType = inferContextualIntentType(
      latestUserMessage,
      input.chatIntent,
      contextualIntent,
      input.conversationContext,
    );
    const workoutIntent = applyCurrentMessageOverrides(
      contextualIntent ?? input.chatIntent.workoutIntent ?? input.fallbackIntent.workoutIntent,
      latestUserMessage,
      intentType,
    );

    return {
      ...input.chatIntent,
      type: intentType === "plan" ? "workout_plan" : "routine",
      needsExerciseContext: true,
      workoutIntent,
      canTriggerAction: true,
      missingActionFields: [],
      suggestedReplies: [],
    };
  }

  return input.chatIntent;
}

export function shouldUseReferenceResolutionForChat(input: {
  latestUserMessage: string;
  chatIntent: ChatIntent;
  conversationContext: FitnessConversationContext;
  recentArtifactSummaries: RecentArtifactSummary[];
}) {
  if (hasExplicitReferenceMarker(input.latestUserMessage)) {
    return true;
  }

  if (
    isContextualWorkoutAdjustment(input.latestUserMessage) &&
    (input.conversationContext.currentIntent || input.recentArtifactSummaries.length > 0) &&
    (input.chatIntent.type === "routine" || input.chatIntent.type === "workout_plan")
  ) {
    return false;
  }

  return true;
}

type ReferencedExerciseSummary = {
  status: "resolved" | "not_found";
  artifactId: string;
  artifactKind: ConversationArtifactKind;
  ordinalIndex: number | null;
  exerciseId?: string;
  exerciseName?: string;
  reason?: string;
};

async function buildReferencedExerciseExplanationFromChat(input: {
  userId: string;
  latestUserMessage: string;
  referenceResolution: Extract<ReferenceResolution, { status: "resolved" }>;
  trace?: AiTraceLogger;
}): Promise<{
  assistantReply: string;
  summary: ReferencedExerciseSummary;
}> {
  const artifactResult = await getArtifactPayload({
    userId: input.userId,
    artifactId: input.referenceResolution.artifactId,
  });

  input.trace?.addStep({
    name: "动作讲解 artifact payload 读取",
    type: "tool_call",
    status: artifactResult.ok ? "success" : "failed",
    input: {
      toolName: "getArtifactPayload",
      artifactId: input.referenceResolution.artifactId,
      artifactKind: input.referenceResolution.artifactKind,
    },
    output: artifactResult.ok
      ? {
          artifactId: artifactResult.artifactId,
          kind: artifactResult.kind,
        }
      : artifactResult,
    metadata: {
      toolName: "getArtifactPayload",
    },
  });

  if (!artifactResult.ok) {
    return {
      assistantReply: "我找到了你引用的训练内容，但没有安全读取到对应的动作详情。你可以把动作名称再发我一次，我再按动作库内容给你讲解。",
      summary: {
        status: "not_found",
        artifactId: input.referenceResolution.artifactId,
        artifactKind: input.referenceResolution.artifactKind,
        ordinalIndex: getReferencedExerciseOrdinalIndex(input.latestUserMessage),
        reason: artifactResult.code,
      },
    };
  }

  const resolvedExercise = resolveReferencedExerciseIdFromArtifactPayload({
    payload: artifactResult.payload,
    message: input.latestUserMessage,
  });

  if (!resolvedExercise) {
    return {
      assistantReply: "我找到了你引用的训练内容，但里面没有可讲解的动作条目。你可以直接说动作名称，我再从动作库里读取做法。",
      summary: {
        status: "not_found",
        artifactId: artifactResult.artifactId,
        artifactKind: artifactResult.kind,
        ordinalIndex: getReferencedExerciseOrdinalIndex(input.latestUserMessage),
        reason: "exercise_not_in_artifact_payload",
      },
    };
  }

  const exercise = await getExerciseById(resolvedExercise.exerciseId);

  input.trace?.addStep({
    name: "动作讲解动作详情读取",
    type: "tool_call",
    status: exercise ? "success" : "failed",
    input: {
      toolName: "getExerciseById",
      exerciseId: resolvedExercise.exerciseId,
    },
    output: exercise
      ? {
          exerciseId: exercise.id,
          nameZh: exercise.nameZh,
          primaryMusclesZh: exercise.primaryMusclesZh,
        }
      : {
          exerciseId: resolvedExercise.exerciseId,
          code: "exercise_not_found",
        },
    metadata: {
      toolName: "getExerciseById",
    },
  });

  if (!exercise) {
    return {
      assistantReply: "我找到了最近训练里的这个动作，但动作库没有读到对应详情。你可以把动作名称发我一次，我再重新确认并讲解。",
      summary: {
        status: "not_found",
        artifactId: artifactResult.artifactId,
        artifactKind: artifactResult.kind,
        ordinalIndex: resolvedExercise.ordinalIndex,
        exerciseId: resolvedExercise.exerciseId,
        reason: "exercise_not_found",
      },
    };
  }

  return {
    assistantReply: formatReferencedExerciseExplanation({
      exercise,
      ordinalIndex: resolvedExercise.ordinalIndex,
      artifactKind: artifactResult.kind,
    }),
    summary: {
      status: "resolved",
      artifactId: artifactResult.artifactId,
      artifactKind: artifactResult.kind,
      ordinalIndex: resolvedExercise.ordinalIndex,
      exerciseId: exercise.id,
      exerciseName: exercise.nameZh,
    },
  };
}

// 序号动作讲解只用于读取最近 artifact 中已有动作，避免把“第一个动作怎么做”误当成新推荐。
export function isOrdinalExerciseExplanationMessage(message: string) {
  return (
    getReferencedExerciseOrdinalIndex(message) !== null &&
    /动作|训练/.test(message) &&
    /怎么做|怎么练|如何做|如何练|讲解|解释|说明|做法|要领/.test(message)
  );
}

// 将中文或数字序号转成 0-based 索引，供 artifact payload 顺序读取复用。
export function getReferencedExerciseOrdinalIndex(message: string): number | null {
  const normalized = message.replace(/\s+/g, "");
  const numericMatch = normalized.match(/第([1-9]\d*)(个|项|组)?(动作|训练)?/);

  if (numericMatch) {
    return Number(numericMatch[1]) - 1;
  }

  const chineseMatch = normalized.match(/第(一|二|两|三|四|五|六|七|八|九|十)(个|项|组)?(动作|训练)?/);
  if (!chineseMatch) {
    return null;
  }

  const ordinalMap: Record<string, number> = {
    一: 0,
    二: 1,
    两: 1,
    三: 2,
    四: 3,
    五: 4,
    六: 5,
    七: 6,
    八: 7,
    九: 8,
    十: 9,
  };

  return ordinalMap[chineseMatch[1]] ?? null;
}

// 从已校验的 artifact payload 中按用户序号读取 exerciseId，不从 summary 反推训练内容。
export function resolveReferencedExerciseIdFromArtifactPayload(input: {
  payload: ConversationArtifactPayload;
  message: string;
}): { exerciseId: string; ordinalIndex: number } | null {
  const ordinalIndex = getReferencedExerciseOrdinalIndex(input.message) ?? 0;
  const exerciseIds = collectArtifactExerciseIdsInDisplayOrder(input.payload);
  const exerciseId = exerciseIds[ordinalIndex];

  return exerciseId ? { exerciseId, ordinalIndex } : null;
}

// 动作讲解回复只使用动作库详情，避免自然语言 summary 编造成动作步骤。
export function formatReferencedExerciseExplanation(input: {
  exercise: Exercise;
  ordinalIndex: number;
  artifactKind: ConversationArtifactKind;
}) {
  const instructionText = input.exercise.instructionsZh
    .filter(Boolean)
    .slice(0, 5)
    .map((instruction, index) => `${index + 1}. ${instruction}`)
    .join(" ");
  const muscles = input.exercise.primaryMusclesZh.length
    ? input.exercise.primaryMusclesZh.join("、")
    : "目标肌群";
  const equipment = input.exercise.equipmentZh || "自重或标注器械";
  const sourceLabel = input.artifactKind === "exercise_recommendation" ? "最近动作推荐" : "最近训练";
  const prefix = `${sourceLabel}里的第 ${input.ordinalIndex + 1} 个动作是${input.exercise.nameZh}。`;

  if (!instructionText) {
    return `${prefix}动作库当前没有完整分步说明；你可以先按动作详情里的图片或演示确认轨迹，训练时保持核心稳定、动作可控，主要关注${muscles}发力。`;
  }

  return `${prefix}做法：${instructionText} 重点关注${muscles}发力，使用${equipment}，全程保持动作可控。`;
}

function collectArtifactExerciseIdsInDisplayOrder(payload: ConversationArtifactPayload) {
  if ("items" in payload) {
    return payload.items.map((item) => item.exerciseId).filter(Boolean);
  }

  if (payload.kind === "routine") {
    return payload.sections
      .flatMap((section) => section.items)
      .map((item) => item.exerciseId)
      .filter(Boolean);
  }

  return payload.days
    .filter((day) => !day.isRestDay)
    .flatMap((day) => day.sections.flatMap((section) => section.items))
    .map((item) => item.exerciseId)
    .filter(Boolean);
}

async function buildExerciseContext(
  chatIntent: ChatIntent,
  messages: ChatMessage[],
  conversationContext: FitnessConversationContext,
  options: {
    userId: string;
    exercises: Awaited<ReturnType<typeof listAllExercises>>;
    memoryState: ConversationMemoryState;
    trace?: AiTraceLogger;
  },
): Promise<ExerciseContext> {
  const exercises = options.exercises.length ? options.exercises : await listAllExercises();
  const intent =
    chatIntent.workoutIntent ??
    conversationContext.currentIntent ??
    createFallbackWorkoutIntent(messages, chatIntent.type, conversationContext);
  const memoryAwareIntent = mergeMemoryStateIntoWorkoutIntent(intent, options.memoryState);
  const candidates = selectExerciseCandidates(memoryAwareIntent, exercises, {
    userId: options.userId,
    memoryState: options.memoryState,
    hybridQuery: messages.at(-1)?.content,
  });
  const nameMatches = findExerciseNameMatches(exercises, chatIntent.requestedExerciseName);
  const seenIds = new Set<string>();
  const providedExercises: ExerciseContext["providedExercises"] = [];

  for (const exercise of nameMatches) {
    seenIds.add(exercise.id);
    providedExercises.push({
      exercise,
      exerciseId: exercise.id,
      nameZh: exercise.nameZh,
      categoryZh: exercise.categoryZh ?? "训练",
      level: exercise.level ?? "beginner",
      equipmentZh: exercise.equipmentZh ?? "未标注器械",
      primaryMusclesZh: exercise.primaryMusclesZh,
      secondaryMusclesZh: exercise.secondaryMusclesZh,
      riskTags: exercise.riskTags,
      goalTags: exercise.goalTags,
      matchingReasons: ["用户明确点名该动作。"],
      source: "name_match",
    });
  }

  for (const candidate of [
    ...candidates.primaryCandidates.slice(0, 12),
    ...candidates.supplementaryCandidates.slice(0, 8),
  ]) {
    if (seenIds.has(candidate.exercise.id)) {
      continue;
    }

    seenIds.add(candidate.exercise.id);
    providedExercises.push({
      exercise: candidate.exercise,
      exerciseId: candidate.exercise.id,
      nameZh: candidate.exercise.nameZh,
      categoryZh: candidate.exercise.categoryZh ?? "训练",
      level: candidate.exercise.level ?? "beginner",
      equipmentZh: candidate.exercise.equipmentZh ?? "未标注器械",
      primaryMusclesZh: candidate.exercise.primaryMusclesZh,
      secondaryMusclesZh: candidate.exercise.secondaryMusclesZh,
      riskTags: candidate.exercise.riskTags,
      goalTags: candidate.exercise.goalTags,
      matchingReasons: candidate.reasons.slice(0, 4),
      source: candidate.source,
    });
  }
  const modelVisibleExercises = toModelVisibleChatExercises(providedExercises);
  const candidateTrim = createCandidateTrimSummary({
    beforeCount:
      candidates.primaryCandidates.length +
      candidates.supplementaryCandidates.length +
      nameMatches.length,
    afterCount: modelVisibleExercises.length,
    maxVisibleCount: 20,
    reason: "聊天回复只需要动作选择所需白名单字段，完整动作对象保留在服务端。",
  });

  const exerciseContext = {
    intent: memoryAwareIntent,
    providedExercises,
    candidateStatus: candidates.candidateStatus,
    relevantCandidateCount: candidates.relevantCandidateCount,
    requiredRelevantCandidateCount: candidates.requiredRelevantCandidateCount,
    warnings: candidates.warnings,
    candidateTrim,
  };

  if (candidates.recommendationTrace.hybridSearch) {
    options.trace?.addStep({
      name: "动作 Hybrid Search 检索",
      type: "rag_query",
      input: {
        query: candidates.recommendationTrace.hybridSearch.query,
        filters: candidates.recommendationTrace.hybridSearch.filters,
      },
      output: {
        recalledCount: candidates.recommendationTrace.hybridSearch.recalledCount,
        filteredCount: candidates.recommendationTrace.hybridSearch.filteredCount,
        rerank: candidates.recommendationTrace.hybridSearch.rerank.slice(0, 20),
        finalExerciseIds: candidates.recommendationTrace.hybridSearch.finalExerciseIds.slice(0, 20),
        failureReasons: candidates.recommendationTrace.hybridSearch.failureReasons,
      },
      metadata: {
        candidateCount: candidates.recommendationTrace.hybridSearch.finalExerciseIds.length,
      },
    });
  }

  options.trace?.addStep({
    name: "动作库获取与候选筛选",
    type: "exercise_lookup",
    input: {
      intent: memoryAwareIntent,
      exerciseCount: exercises.length,
      requestedExerciseName: chatIntent.requestedExerciseName,
    },
    output: {
      context: exerciseContext,
      modelVisibleExercises,
      primaryCandidates: candidates.primaryCandidates.slice(0, 20),
      supplementaryCandidates: candidates.supplementaryCandidates.slice(0, 20),
      excluded: candidates.excluded.slice(0, 40),
      recommendationTrace: candidates.recommendationTrace,
    },
    metadata: {
      aiStage: "exercise_candidate_selection",
      aiStageStatus: "executed",
      candidateTrim,
      primaryCandidateCount: candidates.primaryCandidates.length,
      supplementaryCandidateCount: candidates.supplementaryCandidates.length,
      excludedCount: candidates.excluded.length,
    },
  });

  return exerciseContext;
}

export function resolveAssistantAction(
  chatIntent: ChatIntent,
  exerciseContext: ExerciseContext | null,
  referenceResolution?: Extract<ReferenceResolution, { status: "resolved" }>,
): AssistantAction | null {
  const canTriggerAction = canTriggerAssistantAction(chatIntent, exerciseContext);

  if (
    !canTriggerAction ||
    !exerciseContext ||
    exerciseContext.candidateStatus === "insufficient"
  ) {
    return null;
  }

  // 聊天模型只负责自然语言；真正触发计划/推荐由服务端结构化意图转成内部事件。
  switch (chatIntent.type) {
    case "exercise_recommendation":
      return {
        action: "exercise_recommendation",
        intent: exerciseContext.intent,
        referenceResolution,
      };
    case "routine":
      return {
        action: "workout_routine",
        intent: {
          ...exerciseContext.intent,
          intentType: "routine",
          weeklyFrequency: 1,
        },
        referenceResolution,
      };
    case "workout_plan":
      return {
        action: "workout_plan",
        intent: {
          ...exerciseContext.intent,
          intentType: "plan",
        },
        referenceResolution,
      };
    default:
      return null;
  }
}

// 服务端兜底触发边界：追问优先于推送；动作推荐只在没有显式追问时使用目标兜底。
export function canTriggerAssistantAction(
  chatIntent: ChatIntent,
  exerciseContext: ExerciseContext | null,
) {
  if (!exerciseContext || exerciseContext.candidateStatus === "insufficient") {
    return false;
  }

  if (chatIntent.canTriggerAction) {
    return true;
  }

  if (chatIntent.type === "exercise_recommendation") {
    if (hasPendingSuggestedReplies(chatIntent)) {
      return false;
    }

    return hasRecommendationTarget(chatIntent, exerciseContext.intent);
  }

  const blockingFields = getActionBlockingMissingFields(
    chatIntent.missingActionFields,
    exerciseContext.intent,
  );

  return blockingFields.length === 0 && isActionType(chatIntent.type);
}

function hasRecommendationTarget(chatIntent: ChatIntent, intent: WorkoutPlanIntent) {
  return intent.goal.trim().length > 0 || (chatIntent.requestedExerciseName ?? "").trim().length > 0;
}

function hasPendingSuggestedReplies(chatIntent: ChatIntent) {
  return !chatIntent.canTriggerAction && chatIntent.suggestedReplies.length > 0;
}

export function getActionBlockingMissingFields(
  missingActionFields: string[],
  intent: WorkoutPlanIntent,
) {
  return missingActionFields.filter(
    (field) => !isHealthRelatedMissingField(field) && !isMissingFieldSatisfiedByIntent(field, intent),
  );
}

function isHealthRelatedMissingField(field: string) {
  return /injury|injuries|pain|health|medical|body|restriction|limitation|knee|shoulder|back|wrist|ankle|伤|疼|痛|不适|健康|医疗|身体|膝|肩|腰|手腕|脚踝/i.test(
    field,
  );
}

function isMissingFieldSatisfiedByIntent(field: string, intent: WorkoutPlanIntent) {
  const normalizedField = field.trim().toLowerCase();

  if (normalizedField === "goal") {
    return intent.goal.trim().length > 0;
  }

  if (
    normalizedField === "experience" ||
    normalizedField === "trainingexperience" ||
    normalizedField === "fitnesslevel" ||
    normalizedField === "level"
  ) {
    // 经验未明确时使用保守新手默认值生成，避免把简单训练链路卡在二次确认上。
    return ["beginner", "intermediate", "advanced"].includes(intent.experience);
  }

  if (normalizedField === "sessionminutes" || normalizedField === "duration") {
    return intent.sessionMinutes > 0;
  }

  if (normalizedField === "equipmentorlocation" || normalizedField === "equipment" || normalizedField === "location") {
    return intent.equipment.length > 0 || intent.preferences.length > 0;
  }

  return false;
}

function isActionType(type: ChatIntent["type"]) {
  return type === "exercise_recommendation" || type === "routine" || type === "workout_plan";
}

export function resolveVisibleSuggestedReplies(
  chatIntent: ChatIntent,
  assistantAction: AssistantAction | null,
) {
  // 只有需要用户补信息时展示一键回复；已触发内部动作时避免按钮和生成态同时出现。
  if (assistantAction || chatIntent.canTriggerAction) {
    return [];
  }

  return chatIntent.suggestedReplies;
}

type AssistantSuggestionSourceInput = {
  source: AssistantSuggestionSource;
  sourceField: string;
  kind: AssistantSuggestionKind;
  blocking: boolean;
  values?: unknown;
  suggestions?: AssistantSuggestion[];
};

type AssistantSuggestionNormalizationDiagnostics = {
  rawSources: Array<{
    source: AssistantSuggestionSource;
    sourceField: string;
    rawCount: number;
  }>;
  filtered: Array<{
    source: AssistantSuggestionSource;
    sourceField: string;
    label?: string;
    message?: string;
    reason: string;
  }>;
  finalCount: number;
  blockingOnly: boolean;
};

export type AssistantSuggestionNormalizationResult = {
  assistantSuggestions: AssistantSuggestion[];
  diagnostics: AssistantSuggestionNormalizationDiagnostics;
};

// 建议归一化是服务端唯一出口，集中处理旧字段兼容、用户口吻、阻断优先级和 trace 诊断。
export function normalizeAssistantSuggestions(
  sources: AssistantSuggestionSourceInput[],
  limit = 3,
): AssistantSuggestionNormalizationResult {
  const accepted: AssistantSuggestion[] = [];
  const filtered: AssistantSuggestionNormalizationDiagnostics["filtered"] = [];
  const rawSources: AssistantSuggestionNormalizationDiagnostics["rawSources"] = [];

  for (const source of sources) {
    const rawItems = collectAssistantSuggestionRawItems(source);
    rawSources.push({
      source: source.source,
      sourceField: source.sourceField,
      rawCount: rawItems.length,
    });

    for (const rawItem of rawItems) {
      const candidate = coerceAssistantSuggestion(rawItem, source);

      if (!candidate) {
        filtered.push({
          source: source.source,
          sourceField: source.sourceField,
          reason: "invalid_structure",
        });
        continue;
      }

      const toneReason = getNonUserToneReason(candidate.message);
      if (toneReason) {
        filtered.push({
          source: source.source,
          sourceField: source.sourceField,
          label: candidate.label,
          message: candidate.message,
          reason: toneReason,
        });
        continue;
      }

      accepted.push(candidate);
    }
  }

  const hasBlocking = accepted.some((suggestion) => suggestion.blocking);
  const deduped = dedupeAssistantSuggestions(hasBlocking
    ? accepted.filter((suggestion) => suggestion.blocking)
    : accepted);
  const assistantSuggestions = deduped
    .sort(compareAssistantSuggestions)
    .slice(0, limit);

  return {
    assistantSuggestions,
    diagnostics: {
      rawSources,
      filtered,
      finalCount: assistantSuggestions.length,
      blockingOnly: hasBlocking,
    },
  };
}

export function resolveAssistantSuggestions(input: {
  chatIntent: ChatIntent;
  assistantAction: AssistantAction | null;
  artifactResult?: ChatArtifactResult | null;
}) {
  const visibleSuggestedReplies = resolveVisibleSuggestedReplies(input.chatIntent, input.assistantAction);
  const sources: AssistantSuggestionSourceInput[] = [];

  if (input.chatIntent.assistantSuggestions?.length) {
    sources.push({
      source: "intent",
      sourceField: "assistantSuggestions",
      kind: input.chatIntent.responseMode === "generate_with_suggestions" ? "adjustment" : "clarification",
      blocking: input.chatIntent.responseMode !== "generate_with_suggestions",
      suggestions: input.chatIntent.assistantSuggestions,
    });
  }

  if (visibleSuggestedReplies.length > 0) {
    sources.push({
      source: "intent",
      sourceField: "suggestedReplies",
      kind: "clarification",
      blocking: true,
      values: visibleSuggestedReplies,
    });
  }

  if (!input.assistantAction && input.chatIntent.clarificationReplies?.length) {
    sources.push({
      source: "intent",
      sourceField: "clarificationReplies",
      kind: "clarification",
      blocking: true,
      values: input.chatIntent.clarificationReplies,
    });
  }

  if (input.chatIntent.adjustmentReplies?.length) {
    sources.push({
      source: "intent",
      sourceField: "adjustmentReplies",
      kind: "adjustment",
      blocking: false,
      values: input.chatIntent.adjustmentReplies,
    });
  }

  if (input.artifactResult?.status === "success" && input.artifactResult.assistantSuggestions?.length) {
    sources.push({
      source: input.artifactResult.kind === "exercise_recommendation"
        ? "exercise_recommendation"
        : "workout_generation",
      sourceField: "artifact.assistantSuggestions",
      kind: input.artifactResult.kind === "exercise_recommendation" ? "next_action" : "adjustment",
      blocking: false,
      suggestions: input.artifactResult.assistantSuggestions,
    });
  }

  if (input.artifactResult?.status === "failed" && input.artifactResult.suggestedReplies.length > 0) {
    sources.push({
      source: "artifact_failure",
      sourceField: "artifact.suggestedReplies",
      kind: "retry",
      blocking: true,
      values: input.artifactResult.suggestedReplies,
    });
  }

  return normalizeAssistantSuggestions(sources);
}

function collectAssistantSuggestionRawItems(source: AssistantSuggestionSourceInput) {
  if (source.suggestions) {
    return source.suggestions;
  }

  return Array.isArray(source.values) ? source.values : [];
}

function coerceAssistantSuggestion(
  value: unknown,
  source: AssistantSuggestionSourceInput,
): AssistantSuggestion | null {
  if (typeof value === "string") {
    const message = value.trim();
    const parsed = assistantSuggestionSchema.safeParse({
      label: createSuggestionLabel(message),
      message,
      kind: source.kind,
      blocking: source.blocking,
      source: source.source,
    });

    return parsed.success ? parsed.data : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const message = typeof value.message === "string" ? value.message.trim() : "";
  const label = typeof value.label === "string" && value.label.trim().length > 0
    ? createSuggestionLabel(value.label.trim())
    : createSuggestionLabel(message);
  const parsed = assistantSuggestionSchema.safeParse({
    label,
    message,
    kind: value.kind ?? source.kind,
    blocking: value.blocking ?? source.blocking,
    source: value.source ?? source.source,
  });

  return parsed.success ? parsed.data : null;
}

function createSuggestionLabel(message: string) {
  return message.length > 40 ? `${message.slice(0, 38)}…` : message;
}

function getNonUserToneReason(message: string) {
  const text = message.trim();
  if (!text) {
    return "empty_message";
  }

  if (/[?？]/.test(text)) {
    return "question_tone";
  }

  const normalized = text.replace(/\s+/g, "");
  if (/^(请|请你|麻烦你|告诉我|告诉一下|需要你|建议你|你需要|你可以|你想|你要|你打算|你希望)/.test(normalized)) {
    return "assistant_instruction_tone";
  }

  if (/(你的|你目前的|用户的)(训练目标|时间|器械条件|场地|经验|限制)/.test(normalized)) {
    return "assistant_question_tone";
  }

  return undefined;
}

function dedupeAssistantSuggestions(suggestions: AssistantSuggestion[]) {
  const seen = new Set<string>();
  const result: AssistantSuggestion[] = [];

  for (const suggestion of suggestions) {
    const key = suggestion.message.trim().replace(/\s+/g, "").toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(suggestion);
  }

  return result;
}

function compareAssistantSuggestions(a: AssistantSuggestion, b: AssistantSuggestion) {
  const blockingDelta = Number(b.blocking) - Number(a.blocking);
  if (blockingDelta !== 0) {
    return blockingDelta;
  }

  return getSuggestionKindPriority(a.kind) - getSuggestionKindPriority(b.kind);
}

function getSuggestionKindPriority(kind: AssistantSuggestionKind) {
  switch (kind) {
    case "clarification":
      return 0;
    case "confirmation":
      return 1;
    case "retry":
      return 2;
    case "next_action":
      return 3;
    case "adjustment":
      return 4;
  }
}

function buildReferenceResolutionAssistantSuggestions(
  referenceResolution: Extract<ReferenceResolution, { status: "ambiguous" | "not_found" }>,
) {
  if (referenceResolution.status !== "ambiguous") {
    return [];
  }

  return normalizeAssistantSuggestions([
    {
      source: "reference_resolution",
      sourceField: "referenceResolution.candidates",
      kind: "confirmation",
      blocking: true,
      suggestions: referenceResolution.candidates.slice(0, 3).map((candidate) => ({
        label: candidate.title,
        message: `我说的是${candidate.title}`,
        kind: "confirmation",
        blocking: true,
        source: "reference_resolution",
      })),
    },
  ]).assistantSuggestions;
}

function buildWorkoutPatchAssistantSuggestions(result: WorkoutPatchResult) {
  const source: AssistantSuggestionSource =
    result.status === "confirmation_required" ? "patch_confirmation" : "artifact_failure";
  const kind: AssistantSuggestionKind =
    result.status === "confirmation_required" || result.status === "ambiguous"
      ? "confirmation"
      : "retry";

  return normalizeAssistantSuggestions([
    {
      source,
      sourceField: "workoutPatch.suggestedReplies",
      kind,
      blocking: result.status !== "applied",
      values: result.suggestedReplies,
    },
  ]).assistantSuggestions;
}

function summarizeAssistantAction(assistantAction: AssistantAction | null, artifactResult?: ChatArtifactResult | null) {
  if (!assistantAction) {
    return "";
  }

  return JSON.stringify({
    action: assistantAction.action,
    intent: assistantAction.intent,
    resolvedIntent: assistantAction.resolvedIntent,
    referenceResolution: assistantAction.referenceResolution,
    artifactResult: summarizeChatArtifactForPrompt(artifactResult ?? null),
  });
}

// 卡片事件必须在自然语言回复完成后再发，保证用户先看到对话，再看到卡片。
export function buildChatArtifactStreamEvents(artifactResult: ChatArtifactResult | null) {
  if (!artifactResult) {
    return [];
  }

  if (artifactResult.status === "failed") {
    return [
      {
        type: "artifact_failed",
        metadata: {
          artifactKind: artifactResult.kind,
          errorCode: artifactResult.message,
          guidanceMessage: artifactResult.guidanceMessage,
          recoverable: artifactResult.recoverable,
          suggestedReplies: artifactResult.suggestedReplies,
        },
      },
    ];
  }

  return [
    {
      type: "artifact_validated",
      metadata: {
        artifactKind: artifactResult.kind,
        payload: artifactResult.payload,
        intent: artifactResult.intent,
      },
    },
    {
      type: "artifact",
      metadata: {
        artifactKind: artifactResult.kind,
        payload: artifactResult.payload,
        intent: artifactResult.intent,
      },
    },
  ];
}

function summarizeChatArtifactForPrompt(artifactResult: ChatArtifactResult | null) {
  if (!artifactResult) {
    return { status: "not_requested" };
  }

  if (artifactResult.status === "failed") {
    return {
      status: "failed",
      kind: artifactResult.kind,
      message: artifactResult.message,
      recoverable: artifactResult.recoverable,
      guidanceMessage: artifactResult.guidanceMessage,
      suggestedReplies: artifactResult.suggestedReplies,
    };
  }

  return {
    status: "success",
    kind: artifactResult.kind,
    intent: artifactResult.intent,
    title: "title" in artifactResult.payload ? artifactResult.payload.title : undefined,
    itemCount:
      artifactResult.kind === "exercise_recommendation"
        ? artifactResult.payload.items.length
        : "sections" in artifactResult.payload
          ? artifactResult.payload.sections.reduce((total, section) => total + section.items.length, 0)
          : artifactResult.payload.days.filter((day) => !day.isRestDay).length,
  };
}

export function createResolvedChatIntent(input: {
  chatIntent: ChatIntent;
  exerciseContext: ExerciseContext | null;
  assistantAction: AssistantAction | null;
  referenceResolution: ReferenceResolution | null;
  preferredResolvedIntent?: ResolvedChatIntent;
}): ResolvedChatIntent {
  const workoutIntent = input.exerciseContext?.intent ?? input.chatIntent.workoutIntent;
  const blockingMissingFields = workoutIntent
    ? getActionBlockingMissingFields(input.chatIntent.missingActionFields, workoutIntent)
    : input.chatIntent.missingActionFields;
  const inferredActionKind = input.assistantAction?.action ?? inferActionKindFromIntentType(input.chatIntent.type);
  const shouldTrigger = Boolean(input.assistantAction) && blockingMissingFields.length === 0;
  const hasClarification =
    blockingMissingFields.length > 0 ||
    (!shouldTrigger && (input.chatIntent.clarificationReplies?.length || input.chatIntent.suggestedReplies.length));
  const responseMode = input.chatIntent.responseMode ??
    (shouldTrigger
      ? input.chatIntent.adjustmentReplies?.length
        ? "generate_with_suggestions"
        : "generate_directly"
      : hasClarification
        ? "ask_clarification"
        : "answer_only");
  const clarificationReplies = responseMode === "ask_clarification"
    ? input.chatIntent.clarificationReplies ?? input.chatIntent.suggestedReplies
    : [];
  const adjustmentReplies = responseMode === "generate_with_suggestions"
    ? input.chatIntent.adjustmentReplies ?? input.chatIntent.suggestedReplies
    : input.chatIntent.adjustmentReplies ?? [];
  const referenceRequirement = input.chatIntent.referenceRequirement ?? inferReferenceRequirement(inferredActionKind);

  return resolvedChatIntentSchema.parse({
    ...input.preferredResolvedIntent,
    type: input.chatIntent.type,
    action: {
      kind: shouldTrigger ? inferredActionKind : input.chatIntent.action?.kind ?? inferredActionKind,
      shouldTrigger,
      reason: input.chatIntent.action?.reason,
      blockingMissingFields,
    },
    responseMode,
    workoutIntent,
    missingActionFields: blockingMissingFields,
    clarificationReplies,
    adjustmentReplies,
    fieldSources: {
      ...inferFieldSources(workoutIntent),
      ...input.chatIntent.fieldSources,
      sourceArtifactId: input.referenceResolution?.status === "resolved" ? "artifact" : input.chatIntent.fieldSources?.sourceArtifactId,
    },
    referenceRequirement,
    referenceResolution: input.referenceResolution ?? undefined,
  });
}

export function deriveChatIntentFromResolvedIntent(base: ChatIntent, resolvedIntent: ResolvedChatIntent): ChatIntent {
  return chatIntentSchema.parse({
    ...base,
    type: resolvedIntent.type,
    needsExerciseContext: Boolean(resolvedIntent.workoutIntent) || resolvedIntent.action.shouldTrigger,
    workoutIntent: resolvedIntent.workoutIntent,
    canTriggerAction: resolvedIntent.action.shouldTrigger,
    missingActionFields: resolvedIntent.action.blockingMissingFields,
    suggestedReplies:
      resolvedIntent.responseMode === "ask_clarification"
        ? resolvedIntent.clarificationReplies
        : resolvedIntent.adjustmentReplies,
    action: resolvedIntent.action,
    responseMode: resolvedIntent.responseMode,
    fieldSources: resolvedIntent.fieldSources,
    referenceRequirement: resolvedIntent.referenceRequirement,
    clarificationReplies: resolvedIntent.clarificationReplies,
    adjustmentReplies: resolvedIntent.adjustmentReplies,
  });
}

export function validateResolvedIntentGate(intent: ResolvedChatIntent): { valid: true; violations: [] } | { valid: false; violations: string[] } {
  const violations: string[] = [];

  if (intent.responseMode === "ask_clarification" && intent.action.shouldTrigger) {
    violations.push("responseMode=ask_clarification conflicts with action.shouldTrigger=true");
  }

  if (intent.missingActionFields.length > 0 && intent.action.shouldTrigger) {
    violations.push("missingActionFields must be empty when action.shouldTrigger=true");
  }

  if (intent.action.shouldTrigger && intent.action.kind === "none") {
    violations.push("action.kind=none cannot trigger an artifact");
  }

  if (intent.workoutIntent && !isActionCompatibleWithWorkoutIntent(intent.action.kind, intent.type, intent.workoutIntent.intentType)) {
    violations.push("type/action.kind/workoutIntent.intentType are inconsistent");
  }

  if (
    intent.referenceRequirement.required &&
    intent.referenceResolution?.status !== "resolved"
  ) {
    violations.push(`referenceRequirement is required but referenceResolution is ${intent.referenceResolution?.status ?? "missing"}`);
  }

  if (intent.responseMode === "ask_clarification" && intent.clarificationReplies.length === 0 && intent.missingActionFields.length === 0) {
    violations.push("ask_clarification requires clarificationReplies or missingActionFields");
  }

  return violations.length === 0 ? { valid: true, violations: [] } : { valid: false, violations };
}

async function repairResolvedIntent(input: {
  apiKey: string;
  messages: ChatMessage[];
  conversationSummaryContext: ConversationSummaryContext;
  originalIntent: ResolvedChatIntent;
  violations: string[];
  trace: AiTraceLogger;
}): Promise<{ valid: true; intent: ResolvedChatIntent } | { valid: false; intent: ResolvedChatIntent | null; violations: string[] }> {
  const modelMessages: DeepSeekChatMessage[] = [
    {
      role: "system",
      content: [
        aiPromptConfig.resolvedIntentRepair.system,
        formatConversationSummaryContextForPrompt(input.conversationSummaryContext),
      ].join("\n\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        latestUserMessage: input.conversationSummaryContext.latestUserMessage,
        originalResolvedIntent: input.originalIntent,
        violations: input.violations,
      }),
    },
  ];

  input.trace.addStep({
    name: "Resolved intent repair 请求",
    type: "model_request",
    input: {
      model: "deepseek-v4-flash",
      messages: modelMessages,
      response_format: { type: "json_object" },
    },
    metadata: {
      aiStage: "chat_intent_resolution",
      aiStageStatus: "executed",
      violations: input.violations,
    },
  });

  const result = await requestDeepSeekJson(input.apiKey, modelMessages, input.trace);
  if (!result.ok) {
    input.trace.addStep({
      name: "Resolved intent repair 失败",
      type: "intent",
      status: "failed",
      error: result,
    });
    return { valid: false, intent: null, violations: input.violations };
  }

  const parsed = resolvedChatIntentSchema.safeParse(result.value);
  if (!parsed.success) {
    input.trace.addStep({
      name: "Resolved intent repair 校验失败",
      type: "intent",
      status: "failed",
      output: result.value,
      error: parsed.error.flatten(),
    });
    return { valid: false, intent: null, violations: input.violations };
  }

  const gate = validateResolvedIntentGate(parsed.data);
  input.trace.addStep({
    name: "Resolved intent repair 结果",
    type: "intent",
    status: gate.valid ? "success" : "failed",
    output: {
      repairedIntent: parsed.data,
      gate,
    },
  });

  return gate.valid ? { valid: true, intent: parsed.data } : { valid: false, intent: parsed.data, violations: gate.violations };
}

function createClarificationResolvedIntent(intent: ResolvedChatIntent, violations: string[]): ResolvedChatIntent {
  return resolvedChatIntentSchema.parse({
    ...intent,
    action: {
      kind: "none",
      shouldTrigger: false,
      reason: "resolved_intent_gate_failed",
      blockingMissingFields: intent.action.blockingMissingFields.length > 0
        ? intent.action.blockingMissingFields
        : ["resolvedIntentConflict"],
    },
    responseMode: "ask_clarification",
    missingActionFields: intent.missingActionFields.length > 0
      ? intent.missingActionFields
      : ["resolvedIntentConflict"],
    clarificationReplies: intent.clarificationReplies.length > 0
      ? intent.clarificationReplies
      : ["请重新说明你的训练目标、时间和器械条件"],
    adjustmentReplies: [],
    fieldSources: intent.fieldSources,
    referenceRequirement: intent.referenceRequirement,
    referenceResolution: intent.referenceResolution,
  });
}

function inferActionKindFromIntentType(type: ChatIntent["type"]): ResolvedActionKind {
  switch (type) {
    case "exercise_recommendation":
      return "exercise_recommendation";
    case "routine":
      return "workout_routine";
    case "workout_plan":
      return "workout_plan";
    case "exercise_replacement":
      return "exercise_replacement";
    case "exercise_explanation":
      return "exercise_explanation";
    default:
      return "none";
  }
}

function inferReferenceRequirement(actionKind: ResolvedActionKind) {
  if (actionKind === "workout_patch" || actionKind === "exercise_replacement" || actionKind === "exercise_explanation") {
    return {
      required: true,
      reason: "该动作需要先解析历史训练 artifact。",
      allowedArtifactKinds: ["exercise_recommendation", "routine", "plan"],
    };
  }

  return {
    required: false,
    allowedArtifactKinds: [],
  };
}

function inferFieldSources(intent: WorkoutPlanIntent | undefined): ResolvedFieldSources {
  if (!intent) {
    return {};
  }

  const sources: ResolvedFieldSources = {
    goal: intent.goal ? "llm_inferred" : undefined,
    experience: "default",
    sessionMinutes: intent.sessionMinutes > 0 ? "llm_inferred" : undefined,
    weeklyFrequency: intent.weeklyFrequency > 0 ? "llm_inferred" : undefined,
    equipment: intent.equipment.length > 0 ? "llm_inferred" : undefined,
    injuryLimitations: intent.injuryLimitations.length > 0 ? "llm_inferred" : undefined,
    preferences: intent.preferences.length > 0 ? "llm_inferred" : undefined,
    avoidances: intent.avoidances.length > 0 ? "llm_inferred" : undefined,
  };

  if (intent.calendarHorizonDays) {
    sources.calendarHorizonDays = "llm_inferred";
  }

  return sources;
}

function isActionCompatibleWithWorkoutIntent(
  actionKind: ResolvedActionKind,
  type: ChatIntent["type"],
  intentType: WorkoutPlanIntent["intentType"],
) {
  if (actionKind === "workout_plan") {
    return type === "workout_plan" && intentType === "plan";
  }

  if (actionKind === "workout_routine") {
    return type === "routine" && intentType === "routine";
  }

  if (actionKind === "exercise_recommendation") {
    return type === "exercise_recommendation";
  }

  return true;
}

async function generateChatArtifact(input: {
  apiKey: string;
  latestUserMessage: string;
  conversationSummary: string;
  assistantAction: AssistantAction;
  exerciseContext: ExerciseContext | null;
  trace: AiTraceLogger;
}): Promise<ChatArtifactResult> {
  input.trace.addStep({
    name: "服务端 artifact 生成开始",
    type: "tool_call",
    input: {
      action: input.assistantAction.action,
      intent: input.assistantAction.intent,
      resolvedIntent: input.assistantAction.resolvedIntent,
    },
    metadata: {
      actionKind: input.assistantAction.action,
    },
  });

  if (input.assistantAction.action === "exercise_recommendation") {
    if (!input.exerciseContext) {
      return {
        status: "failed",
        kind: "exercise_recommendation",
        message: "缺少动作候选上下文，无法生成动作推荐。",
        recoverable: true,
        suggestedReplies: ["我补充一下训练目标和器械条件"],
      };
    }

    const candidates = toExerciseRecommendationCandidatesFromContext(input.exerciseContext);
    const tokenBudgetDecision = createExerciseRecommendationBudgetDecision({
      latestUserMessage: input.latestUserMessage,
      conversationSummary: input.conversationSummary,
      candidateTrim: input.exerciseContext.candidateTrim!,
    });
    const recommendation = await generateAiExerciseRecommendations({
      apiKey: input.apiKey,
      intent: input.assistantAction.intent,
      latestUserMessage: input.latestUserMessage,
      conversationSummary: input.conversationSummary,
      candidates,
      safetyNotes: input.exerciseContext.warnings,
      excludeExerciseIds: [],
      tokenBudgetDecision,
      trace: input.trace,
    });

    if (!recommendation.ok) {
      return {
        status: "failed",
        kind: "exercise_recommendation",
        message: recommendation.message,
        recoverable: true,
        detail: recommendation.detail,
        suggestedReplies: ["放宽器械限制再推荐", "换一个训练目标推荐"],
      };
    }

    return {
      status: "success",
      kind: "exercise_recommendation",
      payload: recommendation.card,
      intent: input.assistantAction.intent,
      assistantSuggestions: recommendation.assistantSuggestions,
    };
  }

  if (input.assistantAction.action === "workout_plan" || input.assistantAction.action === "workout_routine") {
    const plan = await generateAiWorkoutPlanDraft({
      latestUserMessage: input.latestUserMessage,
      conversationSummary: input.conversationSummary,
      intent: input.assistantAction.intent,
      fieldSources: input.assistantAction.resolvedIntent?.fieldSources,
      referenceResolution: input.assistantAction.referenceResolution,
    }, { trace: input.trace });

    if (!plan.ok) {
      return {
        status: "failed",
        kind: input.assistantAction.action === "workout_plan" ? "plan" : "routine",
        message: plan.message,
        recoverable: Boolean(plan.recoverable),
        guidanceMessage: plan.guidanceMessage,
        suggestedReplies: plan.suggestedReplies ?? [],
        detail: plan.detail,
      };
    }

    return {
      status: "success",
      kind: plan.kind,
      payload: plan.draft,
      intent: plan.intent,
      candidates: plan.candidates,
    };
  }

  return {
    status: "failed",
    kind: "routine",
    message: `当前动作 ${input.assistantAction.action} 尚未接入 artifact 生成器。`,
    recoverable: true,
    suggestedReplies: ["重新说明要调整哪套训练"],
  };
}

// 动作推荐 artifact 复用服务端完整 Exercise，避免把裁剪给模型的字段误当成展示事实源。
export function toExerciseRecommendationCandidatesFromContext(exerciseContext: ExerciseContext): ExerciseCandidate[] {
  return exerciseContext.providedExercises
    .filter((candidate) => candidate.source !== "name_match")
    .map((candidate) => {
      const source: "primary" | "supplementary" =
        candidate.source === "supplementary" ? "supplementary" : "primary";

      return {
        exercise: candidate.exercise,
        score: 1,
        reasons: candidate.matchingReasons ?? [],
        source,
      };
    });
}

// 聊天回复 prompt 只暴露动作选择必要字段，完整动作对象继续留在服务端校验和下游生成链路。
function toModelVisibleChatExercises(exercises: ExerciseContext["providedExercises"]) {
  return exercises.map((exercise) => ({
    exerciseId: exercise.exerciseId,
    nameZh: exercise.nameZh,
    targetMusclesZh: exercise.primaryMusclesZh,
    equipmentOrLocation: exercise.equipmentZh,
    level: exercise.level,
    categoryZh: exercise.categoryZh,
    matchingReasons: exercise.matchingReasons ?? [],
    candidateSource: exercise.source,
  }));
}

function traceTokenBudgetDecision(trace: AiTraceLogger, decision: AiTokenBudgetDecision) {
  trace.addStep({
    name: "Token 预算决策",
    type: "token_budget",
    output: decision,
    metadata: {
      aiStageStatus: "executed",
      route: decision.route,
      intentType: decision.intentType,
      skippedStages: decision.stages
        .filter((stage) => stage.status === "skipped")
        .map((stage) => ({ stage: stage.stage, reason: stage.skipReason })),
      promptModules: [...new Set(decision.stages.flatMap((stage) => stage.promptModules))],
      candidateTrim: decision.candidateTrim,
    },
  });
}

// 确定性早返回路径显式记录工具循环跳过原因，便于 trace 区分“未进入”和“进入后未选工具”。
function traceReadonlyToolLoopSkipped(
  trace: AiTraceLogger,
  reason: string,
  metadata: Record<string, unknown>,
) {
  trace.addStep({
    name: "只读 Tool Loop 跳过",
    type: "tool_decision",
    output: {
      available: false,
      stopReason: "deterministic_skip",
      reason,
      decisionCallCount: 0,
      toolExecutionCount: 0,
    },
    metadata,
  });
}

function buildSystemPrompt(
  chatIntent: ChatIntent,
  exerciseContext: ExerciseContext | null,
  conversationSummaryContext: ConversationSummaryContext,
  assistantAction: AssistantAction | null,
  resolvedIntent: ResolvedChatIntent,
  artifactResult: ChatArtifactResult | null,
  recentArtifactSummaries: RecentArtifactSummary[],
  referenceResolution: ReferenceResolution | null = null,
  memoryState: ConversationMemoryState | null = null,
  tokenBudgetDecision?: AiTokenBudgetDecision,
  readonlyToolContextBundle: ReadonlyToolContextBundle | null = null,
) {
  const contextPrompt = formatConversationSummaryContextForPrompt(conversationSummaryContext);
  const artifactPrompt = formatRecentArtifactSummariesForPrompt(recentArtifactSummaries);
  const referencePrompt = formatReferenceResolutionForPrompt(referenceResolution);
  const memoryPrompt = formatMemoryStateForPrompt(memoryState);
  const readonlyToolPrompt = formatReadonlyToolContextBundleForPrompt(readonlyToolContextBundle);
  const promptModules = getStageDecision(tokenBudgetDecision, "chat_final_response")?.promptModules;
  const basePrompt = promptModules?.length
    ? buildPromptFromModules(promptModules)
    : aiPromptConfig.chatCompletion.system;

  if (!exerciseContext) {
    return [
      basePrompt,
      contextPrompt,
      artifactPrompt,
      referencePrompt,
      memoryPrompt,
      readonlyToolPrompt,
      "serverResolvedIntent:",
      JSON.stringify(resolvedIntent, null, 2),
      "serverArtifactResult:",
      JSON.stringify(summarizeChatArtifactForPrompt(artifactResult), null, 2),
    ].filter(Boolean).join("\n\n");
  }

  return [
    basePrompt,
    contextPrompt,
    "",
    artifactPrompt,
    "",
    referencePrompt,
    "",
    memoryPrompt,
    "",
    readonlyToolPrompt,
    "",
    "serverParsedIntent:",
    JSON.stringify(
      {
        type: chatIntent.type,
        needsExerciseContext: chatIntent.needsExerciseContext,
        requestedExerciseName: chatIntent.requestedExerciseName,
        canTriggerAction: chatIntent.canTriggerAction,
        missingActionFields: chatIntent.missingActionFields,
      },
      null,
      2,
    ),
    "",
    "serverAssistantAction:",
    JSON.stringify(
      {
        triggered: Boolean(assistantAction),
        action: assistantAction?.action ?? null,
        blockingMissingFields: assistantAction
          ? []
          : getActionBlockingMissingFields(chatIntent.missingActionFields, exerciseContext.intent),
      },
      null,
      2,
    ),
    "",
    "serverResolvedIntent:",
    JSON.stringify(resolvedIntent, null, 2),
    "",
    "serverArtifactResult:",
    JSON.stringify(summarizeChatArtifactForPrompt(artifactResult), null, 2),
    "",
    "serverWorkoutIntent:",
    JSON.stringify(exerciseContext.intent, null, 2),
    "",
    "providedExercises:",
    JSON.stringify(toModelVisibleChatExercises(exerciseContext.providedExercises), null, 2),
    "",
    "candidateTrim:",
    JSON.stringify(exerciseContext.candidateTrim, null, 2),
    "",
    "candidateState:",
    JSON.stringify(
      {
        status: exerciseContext.candidateStatus,
        relevantCandidateCount: exerciseContext.relevantCandidateCount,
        requiredRelevantCandidateCount: exerciseContext.requiredRelevantCandidateCount,
        warnings: exerciseContext.warnings,
      },
      null,
      2,
    ),
  ].join("\n");
}

function shouldInspectUserFeedback(message: string) {
  return /不喜欢|讨厌|不想做|别安排|不要安排|太难|太轻松|做不了|吃力|今天不想|今天不要|这次不想|以后都不要|再也不要/.test(
    message,
  );
}

async function requestDeepSeekJson(
  apiKey: string,
  messages: DeepSeekChatMessage[],
  trace?: AiTraceLogger,
): Promise<
  | { ok: true; value: unknown }
  | {
      ok: false;
      code: "ai_request_failed" | "empty_content" | "invalid_json";
      message: string;
      detail?: unknown;
    }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTENT_REQUEST_TIMEOUT_MS);

  try {
    const response = await serverRequest("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      responseType: "raw",
      throwOnError: false,
      signal: controller.signal,
      body: {
        model: "deepseek-v4-flash",
        messages,
        stream: false,
        response_format: {
          type: "json_object",
        },
        thinking: {
          type: "disabled",
        },
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        code: "ai_request_failed",
        message: "DeepSeek intent request failed.",
        detail: await response.text(),
      };
    }

    const rawResponseText = await response.text();
    const body = JSON.parse(rawResponseText) as DeepSeekChatResponse;
    const content = body.choices?.[0]?.message?.content?.trim() ?? "";
    trace?.addStep({
      name: "第一次大模型回复：意图判断大模型回复",
      type: "model_response",
      output: {
        content,
        rawResponse: rawResponseText,
      },
      metadata: {
        status: response.status,
        tokenUsage: body.usage,
        emptyContent: !content,
      },
    });

    if (!content) {
      return {
        ok: false,
        code: "empty_content",
        message: "DeepSeek intent request returned empty content.",
      };
    }

    const parsed = parseJsonObject(content);

    if (!parsed.ok) {
      return parsed;
    }

    return {
      ok: true,
      value: parsed.value,
    };
  } catch (error) {
    return {
      ok: false,
      code: "ai_request_failed",
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "DeepSeek intent request timed out."
          : "DeepSeek intent request failed.",
      detail: error instanceof Error ? error.message : error,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseJsonObject(content: string):
  | { ok: true; value: unknown }
  | { ok: false; code: "invalid_json"; message: string; detail?: unknown } {
  const normalized = content.trim();
  const jsonText = normalized.startsWith("```")
    ? normalized.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : normalized;

  try {
    return {
      ok: true,
      value: JSON.parse(jsonText),
    };
  } catch (error) {
    return {
      ok: false,
      code: "invalid_json",
      message: "AI returned invalid JSON.",
      detail: error instanceof Error ? error.message : error,
    };
  }
}

function resolveContextualWorkoutIntent(input: {
  chatIntent: ChatIntent;
  fallbackIntent: ChatIntent;
  conversationContext: FitnessConversationContext;
  recentArtifactSummaries?: RecentArtifactSummary[];
}) {
  const baseIntent =
    input.conversationContext.currentIntent ??
    input.chatIntent.workoutIntent ??
    buildWorkoutIntentFromRecentArtifact(input.recentArtifactSummaries?.[0]) ??
    input.fallbackIntent.workoutIntent;

  return mergeConversationFactsIntoWorkoutIntent(baseIntent, input.conversationContext);
}

function mergeConversationFactsIntoWorkoutIntent(
  intent: WorkoutPlanIntent | undefined,
  conversationContext: FitnessConversationContext,
) {
  if (!intent) {
    return undefined;
  }

  const knownFacts = conversationContext.knownFacts;

  // 历史结构化事实只补全当前意图；当前消息仍会在后续覆盖对应字段。
  return workoutPlanIntentSchema.parse({
    ...intent,
    goal: knownFacts.goal ?? intent.goal,
    experience: knownFacts.experience ?? intent.experience,
    sessionMinutes: knownFacts.sessionMinutes ?? intent.sessionMinutes,
    weeklyFrequency: knownFacts.weeklyFrequency ?? intent.weeklyFrequency,
    calendarHorizonDays: knownFacts.calendarHorizonDays ?? intent.calendarHorizonDays,
    equipment: knownFacts.equipment.length > 0 ? knownFacts.equipment : intent.equipment,
    preferences: knownFacts.preferences.length > 0 ? knownFacts.preferences : intent.preferences,
    avoidances: knownFacts.avoidances.length > 0 ? knownFacts.avoidances : intent.avoidances,
  });
}

function buildWorkoutIntentFromRecentArtifact(artifact?: RecentArtifactSummary): WorkoutPlanIntent | undefined {
  if (!artifact) {
    return undefined;
  }

  return workoutPlanIntentSchema.parse({
    intentType: artifact.kind === "plan" ? "plan" : "routine",
    goal: artifact.goals[0] ?? artifact.title,
    experience: "beginner",
    sessionMinutes: artifact.sessionMinutes ?? 30,
    weeklyFrequency: artifact.weeklyFrequency ?? artifact.trainingDayCount ?? (artifact.kind === "plan" ? 3 : 1),
    equipment: artifact.equipment,
    injuryLimitations: [],
    preferences: [],
    avoidances: [],
  });
}

function applyCurrentMessageOverrides(
  baseIntent: WorkoutPlanIntent | undefined,
  latestUserMessage: string,
  intentType: WorkoutPlanIntent["intentType"],
): WorkoutPlanIntent {
  const fallback = workoutPlanIntentSchema.parse({
    intentType,
    goal: extractTargetGoal(latestUserMessage) ?? "综合体能提升",
    experience: "beginner",
    sessionMinutes: 30,
    weeklyFrequency: intentType === "plan" ? 3 : 1,
    equipment: [],
    injuryLimitations: [],
    preferences: [],
    avoidances: [],
  });
  const sessionMinutes = inferSessionMinutesFromText(latestUserMessage);
  const weeklyFrequency = inferWeeklyFrequencyFromText(
    latestUserMessage,
    baseIntent?.weeklyFrequency ?? fallback.weeklyFrequency,
  );
  const calendarHorizonDays = inferCalendarHorizonDaysFromText(latestUserMessage) ?? baseIntent?.calendarHorizonDays;
  const currentEquipment = inferEquipmentFromText(latestUserMessage);
  const noEquipment = hasNoEquipmentText(latestUserMessage);
  const currentPreferences = inferPreferencesFromText(latestUserMessage);
  const currentAvoidances = inferAvoidancesFromText(latestUserMessage);

  return workoutPlanIntentSchema.parse({
    ...(baseIntent ?? fallback),
    intentType,
    goal: extractTargetGoal(latestUserMessage) ?? baseIntent?.goal ?? fallback.goal,
    sessionMinutes: sessionMinutes ?? baseIntent?.sessionMinutes ?? fallback.sessionMinutes,
    weeklyFrequency,
    calendarHorizonDays,
    equipment: noEquipment
      ? ["自重"]
      : currentEquipment.length > 0
        ? currentEquipment
        : baseIntent?.equipment ?? fallback.equipment,
    preferences: uniqueStrings([
      ...(noEquipment ? ["无器械"] : []),
      ...currentPreferences,
      ...(baseIntent?.preferences ?? fallback.preferences),
    ]),
    avoidances: uniqueStrings([...currentAvoidances, ...(baseIntent?.avoidances ?? fallback.avoidances)]),
  });
}

function isPureTargetRecommendationMessage(message: string) {
  const normalized = message.replace(/\s+/g, "");

  return (
    hasTrainingTarget(normalized) &&
    !hasDurationText(normalized) &&
    !isLongTermPlanMessage(normalized) &&
    !/一套|安排|编排|流程|组数|次数|休息|训练计划|计划表|做成|变成/.test(normalized)
  );
}

// 首轮已给齐目标、时长和场地/器械时，服务端直接收敛为本次训练编排。
function isCompleteSingleSessionRoutineMessage(message: string) {
  const normalized = message.replace(/\s+/g, "");
  const isActionRecommendationOnly =
    /推荐|有哪些|动作示例/.test(normalized) &&
    !/一套|安排|编排|流程|训练/.test(normalized);

  return (
    hasTrainingTarget(normalized) &&
    hasDurationText(normalized) &&
    hasConditionFact(normalized) &&
    !isLongTermPlanMessage(normalized) &&
    !isActionRecommendationOnly
  );
}

function isRecommendationRefinementMessage(message: string) {
  const normalized = message.replace(/\s+/g, "");

  return (
    /推荐|动作|几个|换一批|再来一批|换几个|换别的/.test(normalized) &&
    !hasDurationText(normalized) &&
    !isLongTermPlanMessage(normalized) &&
    !/一套|安排|编排|流程|组数|次数|休息|训练计划|计划表|做成|变成/.test(normalized)
  );
}

function hasRecentExerciseRecommendationContext(
  recentArtifactSummaries: RecentArtifactSummary[] | undefined,
  conversationSummary: string,
) {
  return Boolean(
    recentArtifactSummaries?.some((artifact) => artifact.kind === "exercise_recommendation") ||
      /动作推荐|推荐动作|推荐了.*动作|最近.*推荐/.test(conversationSummary),
  );
}

function isStandaloneConditionMessage(message: string) {
  const normalized = message.replace(/\s+/g, "");

  return (
    hasConditionFact(normalized) &&
    !hasTrainingTarget(normalized) &&
    !hasDurationText(normalized) &&
    !isLongTermPlanMessage(normalized) &&
    !/推荐|安排|编排|来一套|做成|变成|训练流程/.test(normalized)
  );
}

function hasDurableConditionFacts(conversationContext: FitnessConversationContext) {
  const knownFacts = conversationContext.knownFacts;

  return Boolean(
    knownFacts.sessionMinutes ||
    knownFacts.weeklyFrequency ||
    knownFacts.calendarHorizonDays ||
    knownFacts.equipment.length > 0 ||
    knownFacts.preferences.length > 0 ||
    knownFacts.avoidances.length > 0,
  );
}

function hasPriorPlanCadenceContext(conversationContext: FitnessConversationContext) {
  if (conversationContext.currentIntent?.intentType === "routine") {
    return false;
  }

  return Boolean(
    (conversationContext.knownFacts.weeklyFrequency && conversationContext.knownFacts.weeklyFrequency > 1) ||
    conversationContext.knownFacts.calendarHorizonDays,
  );
}

function isPlanCompletionMessage(message: string) {
  const normalized = message.replace(/\s+/g, "");

  return hasTrainingTarget(normalized) || hasConditionFact(normalized);
}

function isContextualWorkoutAdjustment(message: string) {
  const normalized = message.replace(/\s+/g, "");

  return (
    hasDurationText(normalized) ||
    hasNoEquipmentText(normalized) ||
    hasConditionFact(normalized) ||
    /改成|换成|调整|降低|难|简单|轻松|太累|太强|太弱|做成|变成|每周|一周|未来\d{1,2}天/.test(normalized)
  );
}

function isLongTermPlanMessage(message: string) {
  return /每周|一周|长期|周期|计划表|周计划|月计划|未来\s*\d{1,2}\s*天|[一二两三四五六七八九十\d]{1,2}\s*天训练计划|[一二两三四五六七八九十\d]{1,2}\s*天计划/.test(
    message,
  );
}

function isUnderSpecifiedLongTermPlanRequest(
  message: string,
  conversationContext: FitnessConversationContext,
) {
  const normalized = message.replace(/\s+/g, "");

  if (!isLongTermPlanMessage(normalized)) {
    return false;
  }

  return (
    !hasTrainingTarget(normalized) &&
    !hasDurationText(normalized) &&
    !hasExplicitWeeklyFrequencyText(normalized) &&
    !hasConcretePlanHorizonText(normalized) &&
    !hasConditionFact(normalized) &&
    !conversationContext.currentIntent &&
    !conversationContext.knownFacts.goal &&
    !hasDurableConditionFacts(conversationContext)
  );
}

function canTriggerLongTermPlanFromContext(
  message: string,
  intent: WorkoutPlanIntent,
  hasPriorTrainingContext: boolean,
  conversationContext: FitnessConversationContext,
) {
  if (hasConcretePlanHorizonText(message)) {
    return true;
  }

  if (
    hasPriorTrainingContext &&
    conversationContext.currentIntent?.intentType === "plan" &&
    (hasExplicitWeeklyFrequencyText(message) || hasDurationText(message))
  ) {
    return true;
  }

  return hasSpecificPlanGoal(intent.goal) && (hasExplicitWeeklyFrequencyText(message) || intent.weeklyFrequency > 0);
}

function inferContextualIntentType(
  message: string,
  chatIntent: ChatIntent,
  contextualIntent: WorkoutPlanIntent | undefined,
  conversationContext: FitnessConversationContext,
): WorkoutPlanIntent["intentType"] {
  if (
    isLongTermPlanMessage(message) ||
    chatIntent.type === "workout_plan" ||
    contextualIntent?.intentType === "plan" ||
    (conversationContext.currentIntent?.intentType !== "routine" &&
      conversationContext.knownFacts.weeklyFrequency &&
      conversationContext.knownFacts.weeklyFrequency > 1) ||
    conversationContext.knownFacts.calendarHorizonDays
  ) {
    return "plan";
  }

  return "routine";
}

function isPlanDefaultableMissingField(field: string, intent: WorkoutPlanIntent) {
  return isHealthRelatedMissingField(field) || isMissingFieldSatisfiedByIntent(field, intent) || /equipment|location|experience/i.test(field);
}

function hasTrainingTarget(message: string) {
  return /练(胸|背|腿|肩|臀|核心|腹|手臂)|胸部|背部|腿部|肩部|臀部|核心|腹肌|减脂|增肌|塑形|力量|心肺|体能/.test(
    message,
  );
}

function hasSpecificPlanGoal(goal: string) {
  return hasTrainingTarget(goal) && !/训练计划|每周计划|周计划|计划表/.test(goal.replace(/\s+/g, ""));
}

function extractTargetGoal(message: string) {
  const normalized = message.replace(/\s+/g, "");
  const target = normalized.match(/练(胸|背|腿|肩|臀|核心|腹|手臂)/)?.[1];

  if (target) {
    return `练${target}`;
  }

  if (hasTrainingTarget(normalized)) {
    return normalized.slice(0, 80);
  }

  return undefined;
}

function hasConditionFact(message: string) {
  return /哑铃|杠铃|壶铃|弹力带|瑜伽垫|跑步机|龙门架|绳索|固定器械|健身房|在家|家里|居家|自重|徒手|无器械|不用器械|没有器械|新手|初学|进阶|高级/.test(
    message,
  );
}

function inferSessionMinutesFromText(text: string) {
  const match = text.match(/(\d{1,3})\s*(?:分钟|min)/i);
  const minutes = match ? Number(match[1]) : undefined;

  return minutes && minutes >= 1 && minutes <= 240 ? minutes : undefined;
}

function hasDurationText(text: string) {
  return inferSessionMinutesFromText(text) !== undefined;
}

function hasExplicitWeeklyFrequencyText(text: string) {
  return /(?:一周|每周)[一二两三四五六七\d]+(?:练|次|天)/.test(text.replace(/\s+/g, ""));
}

function hasConcretePlanHorizonText(text: string) {
  const normalized = text.replace(/\s+/g, "");

  return /未来\d{1,2}天|[一二两三四五六七八九十\d]{1,2}天训练计划|[一二两三四五六七八九十\d]{1,2}天计划/.test(
    normalized,
  );
}

function inferCalendarHorizonDaysFromText(text: string) {
  const match = text.match(/未来\s*(\d{1,2})\s*天/);
  const days = match ? Number(match[1]) : undefined;

  return days && days >= 1 && days <= 90 ? days : undefined;
}

function inferEquipmentFromText(text: string) {
  const equipment: string[] = [];

  if (/哑铃/.test(text)) equipment.push("哑铃");
  if (/杠铃/.test(text)) equipment.push("杠铃");
  if (/壶铃/.test(text)) equipment.push("壶铃");
  if (/弹力带/.test(text)) equipment.push("弹力带");
  if (/瑜伽垫/.test(text)) equipment.push("瑜伽垫");
  if (/跑步机/.test(text)) equipment.push("跑步机");
  if (/龙门架|绳索/.test(text)) equipment.push("龙门架");
  if (/固定器械|器械区/.test(text)) equipment.push("固定器械");
  if (hasNoEquipmentText(text) || /自重|徒手/.test(text)) equipment.push("自重");

  return uniqueStrings(equipment);
}

function hasNoEquipmentText(text: string) {
  return /无器械|不用器械|没有器械|不使用器械|徒手|自重/.test(text);
}

function inferPreferencesFromText(text: string) {
  const preferences: string[] = [];

  if (/居家|家里|在家/.test(text)) preferences.push("居家训练");
  if (/健身房/.test(text)) preferences.push("健身房训练");
  if (/降低|简单|轻松|太难|太累|低强度/.test(text)) preferences.push("降低难度");
  if (/高强度|冲刺|燃脂/.test(text)) preferences.push("高强度");

  return preferences;
}

function inferAvoidancesFromText(text: string) {
  return /不要|避免|不想|别|不用器械|没有器械/.test(text) ? [text.trim().slice(0, 120)] : [];
}

function hasExplicitReferenceMarker(text: string) {
  return /这个|这套|这批|这些|那个|那套|刚才|刚刚|上一个|上一套|前面|前一个|前一套|之前|上次|它|该/.test(
    text,
  );
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function createFallbackChatIntent(
  messages: ChatMessage[],
  conversationContext: FitnessConversationContext,
  conversationSummary = conversationContext.summary,
): ChatIntent {
  const latestUserMessage = getLatestUserMessage(messages);
  const isRecommendationRefresh = /换一批|再换|换几个|换别的|再来一批|下一批|重新推荐|不要这些|别的动作/.test(
    latestUserMessage,
  );
  const isRecommendation =
    isRecommendationRefresh ||
    (/推荐|有哪些|动作/.test(latestUserMessage) && !/组|套|流程|安排|计划/.test(latestUserMessage));
  const isLongTermPlan = /三周|四周|几周|一周|每周|周频率|长期|周期|计划/.test(latestUserMessage);
  const isRoutine = /今天|这次|现在|来一套|动作组|流程|安排|练|分钟/.test(latestUserMessage);
  const type = isRecommendation
    ? "exercise_recommendation"
    : isLongTermPlan
      ? "workout_plan"
      : isRoutine
      ? "routine"
    : "general_fitness_advice";
  const workoutIntent = createFallbackWorkoutIntent(messages, type, conversationContext);
  const resolvedWorkoutIntent =
    isRecommendationRefresh && conversationContext.currentIntent
      ? conversationContext.currentIntent
      : isLongTermPlan
        ? workoutIntent
        : conversationContext.currentIntent ?? workoutIntent;

  return {
    type,
    needsExerciseContext: /动作|训练|计划|编排|替换|推荐|练|胸|背|腿|肩|核心|减脂|增肌/.test(
      `${latestUserMessage} ${conversationSummary}`,
    ),
    workoutIntent: resolvedWorkoutIntent,
    canTriggerAction: false,
    missingActionFields: [],
    suggestedReplies: [],
  };
}

function createFallbackWorkoutIntent(
  messages: ChatMessage[],
  type: ChatIntent["type"],
  conversationContext?: FitnessConversationContext,
): WorkoutPlanIntent {
  const latestUserMessage = getLatestUserMessage(messages);
  const knownFacts = conversationContext?.knownFacts;
  const intentType = type === "routine" || type === "exercise_recommendation" ? "routine" : "plan";

  return workoutPlanIntentSchema.parse({
    intentType,
    goal: (knownFacts?.goal ?? latestUserMessage.slice(0, 80)) || "综合体能提升",
    experience: knownFacts?.experience ?? "beginner",
    sessionMinutes: knownFacts?.sessionMinutes ?? 30,
    weeklyFrequency: inferWeeklyFrequencyFromText(
      latestUserMessage,
      knownFacts?.weeklyFrequency ?? (intentType === "routine" ? 1 : 3),
    ),
    calendarHorizonDays: knownFacts?.calendarHorizonDays,
    equipment: knownFacts?.equipment?.length ? knownFacts.equipment : [],
    injuryLimitations: [],
    preferences: knownFacts?.preferences?.length
      ? knownFacts.preferences
      : extractByPattern(latestUserMessage, /(居家|家里|徒手|自重|哑铃|杠铃|弹力带|低强度|高强度)/),
    avoidances: knownFacts?.avoidances?.length ? knownFacts.avoidances : [],
  });
}

function findExerciseNameMatches(exercises: Awaited<ReturnType<typeof listAllExercises>>, keyword?: string) {
  const normalizedKeyword = keyword?.trim().toLowerCase();

  if (!normalizedKeyword) {
    return [];
  }

  return exercises
    .filter((exercise) => {
      const names = [exercise.id, exercise.nameZh, exercise.nameEn]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return names.includes(normalizedKeyword) || normalizedKeyword.includes(exercise.nameZh);
    })
    .slice(0, 5);
}

function getLatestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content.trim() ?? "";
}

function extractByPattern(text: string, pattern: RegExp) {
  return pattern.test(text) ? [text.slice(0, 80)] : [];
}

function inferWeeklyFrequencyFromText(text: string, fallback: number) {
  const normalized = text.replace(/\s+/g, "");
  const match = normalized.match(/(?:一周|每周)([一二两三四五六七\d]+)(?:练|次|天)/);

  return match ? parseSmallChineseNumber(match[1]) : fallback;
}

function parseSmallChineseNumber(value: string) {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const map: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
  };

  return map[value] ?? 1;
}
