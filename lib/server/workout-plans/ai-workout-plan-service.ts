import { z } from "zod";

import { buildPromptFromModules } from "@/lib/server/ai/prompt-config";
import {
  createCandidateTrimSummary,
  createWorkoutPlanBudgetDecision,
  getStageDecision,
  type AiPromptModuleId,
  type AiTokenBudgetDecision,
} from "@/lib/server/ai/token-budget";
import { getActiveArtifactPayloadForCurrentUser } from "@/lib/server/conversation-artifacts/artifact-service";
import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import type { Exercise } from "@/lib/shared/exercises/types";
import { referenceResolutionSchema } from "@/lib/shared/reference-resolver/schema";
import { resolvedFieldSourcesSchema } from "@/lib/shared/chat/resolved-intent";
import {
  buildConversationSummaryContext,
  formatConversationSummaryContextForPrompt,
  type ConversationSummaryContext,
} from "@/lib/shared/chat/fitness-conversation-context";
import { serverRequest } from "@/lib/server/http/server-request";

import {
  workoutPlanDraftSchema,
  workoutPlanIntentSchema,
  workoutRoutineDraftSchema,
  type WorkoutPlanDraft,
  type WorkoutPlanIntent,
  type WorkoutRoutineDraft,
} from "@/lib/shared/workout-plans/draft-schema";
import {
  getCandidateExerciseIds,
  selectExerciseCandidates,
  type ExerciseCandidate,
  type ExerciseCandidateResult,
} from "./exercise-candidate-service";
import {
  validateWorkoutPlanDraft,
  validateWorkoutRoutineDraft,
  type WorkoutPlanValidationResult,
} from "./workout-plan-validation-service";
import {
  buildPlanStrategyFromChatIntent,
  expandDomainPlan,
} from "./domain-plan-engine";
import {
  classifyWorkoutPlanValidationFailure,
  type WorkoutPlanValidationRecovery,
} from "./workout-plan-validation-recovery-service";

export const aiWorkoutPlanChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

export const aiWorkoutPlanRequestSchema = z.object({
  latestUserMessage: z.string().trim().min(1).max(4000),
  conversationSummary: z.string().trim().max(2000).default(""),
  messages: z.array(aiWorkoutPlanChatMessageSchema).min(1).max(200).optional(),
  intent: workoutPlanIntentSchema.optional(),
  fieldSources: resolvedFieldSourcesSchema.optional(),
  referenceResolution: referenceResolutionSchema.optional(),
  parentTraceId: z.string().trim().min(1).max(120).optional(),
});

export type AiWorkoutPlanChatMessage = z.infer<typeof aiWorkoutPlanChatMessageSchema>;
export type AiWorkoutPlanRequest = z.infer<typeof aiWorkoutPlanRequestSchema>;

export type AiWorkoutPlanFailureCode =
  | "missing_api_key"
  | "intent_extraction_failed"
  | "candidate_actions_insufficient"
  | "ai_request_failed"
  | "invalid_json"
  | "invalid_ai_output"
  | "plan_validation_failed";

export type AiWorkoutPlanFailure = {
  ok: false;
  code: AiWorkoutPlanFailureCode;
  message: string;
  detail?: unknown;
  recoverable?: boolean;
  guidanceMessage?: string;
  suggestedReplies?: string[];
  intent?: WorkoutPlanIntent;
  candidates?: ExerciseCandidateResult;
  validation?: WorkoutPlanValidationResult;
};

export type AiWorkoutPlanSuccess =
  | {
  ok: true;
  kind: "plan";
  intent: WorkoutPlanIntent;
  draft: WorkoutPlanDraft;
  candidates: ExerciseCandidateResult;
  validation: WorkoutPlanValidationResult;
}
  | {
  ok: true;
  kind: "routine";
  intent: WorkoutPlanIntent;
  draft: WorkoutRoutineDraft;
  candidates: ExerciseCandidateResult;
  validation: WorkoutPlanValidationResult;
};

export type AiWorkoutPlanResult = AiWorkoutPlanSuccess | AiWorkoutPlanFailure;

type AiWorkoutPlanGenerationOptions = {
  trace?: AiTraceLogger;
};

type WorkoutDraftGenerationResult =
  | { ok: true; draft: WorkoutPlanDraft | WorkoutRoutineDraft }
  | {
      ok: false;
      code: "ai_request_failed" | "invalid_json" | "invalid_ai_output";
      message: string;
      detail?: unknown;
    };

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: DeepSeekTokenUsage;
};

type DeepSeekTokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type DeepSeekChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const model = "deepseek-v4-flash";
const maxModelCandidates = 16;
const deepSeekRequestTimeoutMs = 45_000;

export async function generateAiWorkoutPlanDraft(
  rawRequest: AiWorkoutPlanRequest,
  options: AiWorkoutPlanGenerationOptions = {},
): Promise<AiWorkoutPlanResult> {
  const request = aiWorkoutPlanRequestSchema.parse(rawRequest);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const trace = options.trace;
  const conversationSummaryContext = buildConversationSummaryContext({
    summary: request.conversationSummary,
    latestUserMessage: request.latestUserMessage,
  });
  let tokenBudgetDecision = createWorkoutPlanBudgetDecision({
    latestUserMessage: conversationSummaryContext.latestUserMessage,
    conversationSummary: conversationSummaryContext.summary,
    intentType: request.intent?.intentType,
    hasClientIntent: Boolean(request.intent),
  });

  if (!apiKey) {
    return {
      ok: false,
      code: "missing_api_key",
      message: "Missing DEEPSEEK_API_KEY environment variable.",
    };
  }

  traceWorkoutPlanTokenBudget(trace, tokenBudgetDecision);

  const intentResult = request.intent
    ? { ok: true as const, intent: request.intent }
    : await extractWorkoutPlanIntent(conversationSummaryContext, apiKey, trace, tokenBudgetDecision);

  if (!intentResult.ok) {
    trace?.addStep({
      name: "训练计划意图解析失败",
      type: "intent",
      status: "failed",
      error: intentResult,
    });
    logAiWorkoutPlanFailure("intent_extraction", intentResult);
    return intentResult;
  }

  trace?.addStep({
    name: request.intent ? "使用客户端传入意图" : "训练计划意图解析结果",
    type: "intent",
    output: intentResult.intent,
  });

  const exercises = await listAllExercises();
  const candidates = selectExerciseCandidates(intentResult.intent, exercises, {
    hybridQuery: request.latestUserMessage,
  });
  const candidateTrim = createCandidateTrimSummary({
    beforeCount: candidates.primaryCandidates.length + candidates.supplementaryCandidates.length,
    afterCount: Math.min(maxModelCandidates, candidates.primaryCandidates.length) +
      Math.min(maxModelCandidates, candidates.supplementaryCandidates.length),
    maxVisibleCount: maxModelCandidates,
    reason: "训练计划生成按候选池裁剪为模型可见 Top N，并只保留编排必要字段。",
  });
  tokenBudgetDecision = createWorkoutPlanBudgetDecision({
    latestUserMessage: conversationSummaryContext.latestUserMessage,
    conversationSummary: conversationSummaryContext.summary,
    intentType: intentResult.intent.intentType,
    hasClientIntent: Boolean(request.intent),
    candidateTrim,
  });
  traceWorkoutPlanTokenBudget(trace, tokenBudgetDecision);
  if (candidates.recommendationTrace.hybridSearch) {
    trace?.addStep({
      name: "训练计划动作 Hybrid Search 检索",
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
  trace?.addStep({
    name: "动作库获取与计划候选筛选",
    type: "candidate_selection",
    input: {
      intent: intentResult.intent,
      exerciseCount: exercises.length,
    },
    output: {
      candidateStatus: candidates.candidateStatus,
      relevantCandidateCount: candidates.relevantCandidateCount,
      requiredRelevantCandidateCount: candidates.requiredRelevantCandidateCount,
      isEnoughCandidates: candidates.isEnoughCandidates,
      warnings: candidates.warnings,
      primaryCandidates: candidates.primaryCandidates.slice(0, 40),
      supplementaryCandidates: candidates.supplementaryCandidates.slice(0, 40),
      candidatePools: {
        warmup: candidates.candidatePools.warmup.slice(0, 20),
        training: candidates.candidatePools.training.slice(0, 20),
        stretch: candidates.candidatePools.stretch.slice(0, 20),
      },
      shortages: candidates.shortages,
      excluded: candidates.excluded.slice(0, 80),
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

  const domainPlanResult = await maybeGenerateDomainPlanFromReference({
    request,
    intent: intentResult.intent,
    candidates,
    exercises,
    trace,
  });

  if (domainPlanResult) {
    return domainPlanResult;
  }

  if (!candidates.isEnoughCandidates) {
    const failure = {
      ok: false,
      code: "candidate_actions_insufficient",
      message: "候选动作不足，无法生成可靠的训练计划草稿。",
      intent: intentResult.intent,
      candidates,
    } satisfies AiWorkoutPlanFailure;

    logAiWorkoutPlanFailure("candidate_selection", failure);
    return failure;
  }

  const draftResult = await generateWorkoutPlanDraft(
    conversationSummaryContext,
    intentResult.intent,
    candidates,
    apiKey,
    trace,
    tokenBudgetDecision,
  );

  if (!draftResult.ok) {
    const failure = {
      ...draftResult,
      intent: intentResult.intent,
      candidates,
    } satisfies AiWorkoutPlanFailure;

    logAiWorkoutPlanFailure("draft_generation", failure);
    return failure;
  }

  const candidateExerciseIds = getCandidateExerciseIds(candidates);
  const validation = validateGeneratedWorkoutDraft(draftResult.draft, intentResult.intent, {
    exercises,
    candidateExerciseIds,
  });
  trace?.addStep({
    name: intentResult.intent.intentType === "routine" ? "单次训练编排草稿校验" : "训练计划草稿校验",
    type: "validation",
    status: validation.valid ? "success" : "failed",
    input: {
      draft: draftResult.draft,
      intent: intentResult.intent,
      candidateExerciseIds,
    },
    output: validation,
    metadata: {
      kind: intentResult.intent.intentType,
      candidateCount: candidateExerciseIds.length,
      ...summarizeWorkoutValidationForTrace(validation),
      planCycle:
        intentResult.intent.intentType === "plan"
          ? summarizePlanCycle(draftResult.draft as WorkoutPlanDraft)
          : undefined,
    },
  });

  if (!validation.valid) {
    const initialRecovery = classifyWorkoutPlanValidationFailure(validation, {
      targetSessionMinutes: intentResult.intent.sessionMinutes,
    });

    trace?.addStep({
      name: "训练草稿首次校验失败分类",
      type: "validation",
      status: "failed",
      input: validation,
      output: initialRecovery,
    });

    const repairBudgetDecision = createWorkoutPlanBudgetDecision({
      latestUserMessage: conversationSummaryContext.latestUserMessage,
      conversationSummary: conversationSummaryContext.summary,
      intentType: intentResult.intent.intentType,
      hasClientIntent: Boolean(request.intent),
      candidateTrim,
      needsRepair: true,
    });
    traceWorkoutPlanTokenBudget(trace, repairBudgetDecision);

    const repairResult = await repairWorkoutPlanDraft(
      conversationSummaryContext,
      intentResult.intent,
      candidates,
      draftResult.draft,
      validation,
      apiKey,
      trace,
      repairBudgetDecision,
    );

    if (repairResult.ok) {
      const repairedValidation = validateGeneratedWorkoutDraft(repairResult.draft, intentResult.intent, {
        exercises,
        candidateExerciseIds,
      });

      trace?.addStep({
        name: intentResult.intent.intentType === "routine" ? "修复后单次训练编排校验" : "修复后训练计划校验",
        type: "validation",
        status: repairedValidation.valid ? "success" : "failed",
        input: {
          draft: repairResult.draft,
          intent: intentResult.intent,
          candidateExerciseIds,
        },
        output: repairedValidation,
        metadata: {
          kind: intentResult.intent.intentType,
          candidateCount: candidateExerciseIds.length,
          ...summarizeWorkoutValidationForTrace(repairedValidation),
          planCycle:
            intentResult.intent.intentType === "plan"
              ? summarizePlanCycle(repairResult.draft as WorkoutPlanDraft)
              : undefined,
        },
      });

      if (repairedValidation.valid) {
        return createWorkoutPlanSuccess(intentResult.intent, repairResult.draft, candidates, repairedValidation);
      }

      const repairedRecovery = classifyWorkoutPlanValidationFailure(repairedValidation, {
        targetSessionMinutes: intentResult.intent.sessionMinutes,
      });
      const failure = createPlanValidationFailure(
        intentResult.intent,
        candidates,
        repairedValidation,
        repairedRecovery,
      );

      trace?.addStep({
        name: "训练草稿自动修复失败响应",
        type: "final_response",
        status: "failed",
        output: failure,
      });
      logAiWorkoutPlanFailure("plan_validation_repair", failure);
      return failure;
    }

    const failure = createPlanValidationFailure(
      intentResult.intent,
      candidates,
      validation,
      initialRecovery,
      repairResult,
    );

    trace?.addStep({
      name: "训练草稿自动修复请求失败响应",
      type: "final_response",
      status: "failed",
      output: failure,
    });
    logAiWorkoutPlanFailure("plan_validation_repair_request", failure);
    return failure;
  }

  const success = createWorkoutPlanSuccess(intentResult.intent, draftResult.draft, candidates, validation);

  console.info("[ai-workout-plan] completed", {
    title: success.draft.title,
    kind: success.kind,
    weeklyFrequency: success.intent.weeklyFrequency,
    cycleLengthDays: success.kind === "plan" ? success.draft.cycleLengthDays : undefined,
    trainingDayCount: success.kind === "plan" ? success.draft.trainingDayCount : undefined,
    restDayCount: success.kind === "plan" ? success.draft.restDayCount : undefined,
    candidateCount:
      success.candidates.primaryCandidates.length +
      success.candidates.supplementaryCandidates.length,
    warningCount: success.validation.warnings.length,
  });

  return success;
}

async function maybeGenerateDomainPlanFromReference(input: {
  request: AiWorkoutPlanRequest;
  intent: WorkoutPlanIntent;
  candidates: ExerciseCandidateResult;
  exercises: Exercise[];
  trace?: AiTraceLogger;
}): Promise<AiWorkoutPlanResult | null> {
  if (
    input.intent.intentType !== "plan" ||
    input.request.referenceResolution?.status !== "resolved" ||
    !["routine", "plan"].includes(input.request.referenceResolution.artifactKind)
  ) {
    return null;
  }

  const strategy = buildPlanStrategyFromChatIntent({
    intent: input.intent,
    latestUserMessage: input.request.latestUserMessage,
    referenceResolution: input.request.referenceResolution,
    fieldSources: input.request.fieldSources,
  });

  input.trace?.addStep({
    name: "PlanStrategy 生成结果",
    type: "intent",
    output: strategy,
    metadata: {
      sourceArtifactId: strategy.sourceArtifactId,
      strategy: strategy.strategy,
    },
  });

  const artifactPayloadResult = await getActiveArtifactPayloadForCurrentUser({
    artifactId: input.request.referenceResolution.artifactId,
  });

  if (!artifactPayloadResult.ok) {
    const failure = {
      ok: false,
      code: "plan_validation_failed",
      message: "无法读取被引用的训练内容，不能生成长期计划预览。",
      recoverable: true,
      guidanceMessage: "我没法安全读取你刚才引用的训练内容。请重新点明要复用的训练名称，或重新生成一套计划。",
      suggestedReplies: ["重新生成一套计划", "我说一下要复用哪套训练"],
      intent: input.intent,
      candidates: input.candidates,
      detail: artifactPayloadResult,
    } satisfies AiWorkoutPlanFailure;

    input.trace?.addStep({
      name: "PlanStrategy 引用 artifact 读取失败",
      type: "tool_call",
      status: "failed",
      input: input.request.referenceResolution,
      output: artifactPayloadResult,
      metadata: {
        requestedArtifactId: input.request.referenceResolution.artifactId,
      },
    });

    return failure;
  }

  input.trace?.addStep({
    name: "PlanStrategy 引用 artifact 读取结果",
    type: "tool_call",
    status: "success",
    input: input.request.referenceResolution,
    output: {
      ok: true,
      requestedArtifactId: artifactPayloadResult.requestedArtifactId,
      activeArtifactId: artifactPayloadResult.artifactId,
      artifactKind: artifactPayloadResult.kind,
      revisionResolution: artifactPayloadResult.revisionResolution,
    },
    metadata: {
      requestedArtifactId: artifactPayloadResult.requestedArtifactId,
      activeArtifactId: artifactPayloadResult.artifactId,
      revisionResolutionStatus: artifactPayloadResult.revisionResolution.status,
    },
  });

  const expanded = expandDomainPlan({
    strategy,
    sourceArtifact: {
      artifactId: artifactPayloadResult.artifactId,
      kind: artifactPayloadResult.kind as "routine" | "plan",
      payload: artifactPayloadResult.payload,
    },
  });

  input.trace?.addStep({
    name: "DomainPlanEngine 展开结果",
    type: "tool_call",
    status: expanded.ok ? "success" : "failed",
    input: {
      strategy,
      referenceResolution: input.request.referenceResolution,
      sourceKind: artifactPayloadResult.kind,
    },
    output: expanded,
  });

  if (!expanded.ok) {
    return {
      ok: false,
      code: "plan_validation_failed",
      message: expanded.message,
      recoverable: true,
      guidanceMessage: "这次引用的训练内容还不能展开成长期计划。请换一个 routine 或补充你想按什么结构安排。",
      suggestedReplies: ["按这套重新生成一周三练", "换成另一套训练"],
      intent: input.intent,
      candidates: input.candidates,
      detail: expanded,
    } satisfies AiWorkoutPlanFailure;
  }

  const candidateExerciseIds = [
    ...new Set([
      ...getCandidateExerciseIds(input.candidates),
      ...expanded.sourceExerciseIds,
    ]),
  ];
  const validationIntent = {
    ...input.intent,
    calendarHorizonDays: strategy.horizonDays,
    weeklyFrequency: strategy.weeklyFrequency,
    sessionMinutes: strategy.sessionMinutes,
  };
  const validation = validateWorkoutPlanDraft(expanded.draft, validationIntent, {
    exercises: input.exercises,
    candidateExerciseIds,
  });

  input.trace?.addStep({
    name: "DomainPlanEngine 输出校验",
    type: "validation",
    status: validation.valid ? "success" : "failed",
    input: {
      draft: expanded.draft,
      intent: validationIntent,
      candidateExerciseIds,
    },
    output: validation,
    metadata: {
      sourceExerciseCount: expanded.sourceExerciseIds.length,
      schedulePreviewCount: expanded.draft.schedulePreview?.length ?? 0,
      ...summarizeWorkoutValidationForTrace(validation),
    },
  });

  if (!validation.valid) {
    const recovery = classifyWorkoutPlanValidationFailure(validation, {
      targetSessionMinutes: strategy.sessionMinutes,
    });

    return createPlanValidationFailure(
      validationIntent,
      input.candidates,
      validation,
      recovery,
      expanded,
    );
  }

  return {
    ok: true,
    kind: "plan",
    intent: validationIntent,
    draft: expanded.draft,
    candidates: input.candidates,
    validation,
  };
}

function summarizePlanCycle(draft: WorkoutPlanDraft) {
  return {
    cycleLengthDays: draft.cycleLengthDays,
    trainingDayCount: draft.trainingDayCount,
    restDayCount: draft.restDayCount,
    weeklyFrequency: draft.weeklyFrequency,
    calendarHorizonDays: draft.calendarHorizonDays,
    missingSectionDays: draft.days
      .filter((day) => !day.isRestDay && day.sections.length < 3)
      .map((day) => day.cycleDayIndex),
  };
}

// Trace metadata 单独标出 hard fail 与 section warning，避免排查时把语义分歧误认为终止型失败。
function summarizeWorkoutValidationForTrace(validation: WorkoutPlanValidationResult) {
  const sectionSemanticWarnings = validation.warnings
    .filter((issue) => issue.code === "section_exercise_mismatch")
    .map((issue) => ({
      exerciseId: issue.exerciseId,
      aiSection: issue.section,
      metadataSections: issue.metadataSections,
      dayIndex: issue.dayIndex,
    }));

  return {
    deterministicHardFailCodes: [...new Set(validation.errors.map((issue) => issue.code))],
    sectionSemanticWarnings,
    sectionSemanticWarningCount: sectionSemanticWarnings.length,
  };
}

function traceWorkoutPlanTokenBudget(trace: AiTraceLogger | undefined, decision: AiTokenBudgetDecision) {
  trace?.addStep({
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

function resolveWorkoutPlanBudgetStage(taskName: string, decision?: AiTokenBudgetDecision) {
  const stageName =
    taskName === "intent_extraction"
      ? "workout_plan_intent_extraction"
      : taskName === "draft_repair"
        ? "workout_plan_draft_repair"
        : "workout_plan_draft_generation";

  return getStageDecision(decision, stageName);
}

function validateGeneratedWorkoutDraft(
  draft: WorkoutPlanDraft | WorkoutRoutineDraft,
  intent: WorkoutPlanIntent,
  options: {
    exercises: Exercise[];
    candidateExerciseIds: string[];
  },
) {
  return intent.intentType === "routine"
    ? validateWorkoutRoutineDraft(draft as WorkoutRoutineDraft, intent, options)
    : validateWorkoutPlanDraft(draft as WorkoutPlanDraft, intent, options);
}

function createWorkoutPlanSuccess(
  intent: WorkoutPlanIntent,
  draft: WorkoutPlanDraft | WorkoutRoutineDraft,
  candidates: ExerciseCandidateResult,
  validation: WorkoutPlanValidationResult,
): AiWorkoutPlanSuccess {
  return intent.intentType === "routine"
    ? ({
        ok: true,
        kind: "routine",
        intent,
        draft: draft as WorkoutRoutineDraft,
        candidates,
        validation,
      } satisfies AiWorkoutPlanSuccess)
    : ({
        ok: true,
        kind: "plan",
        intent,
        draft: draft as WorkoutPlanDraft,
        candidates,
        validation,
      } satisfies AiWorkoutPlanSuccess);
}

function createPlanValidationFailure(
  intent: WorkoutPlanIntent,
  candidates: ExerciseCandidateResult,
  validation: WorkoutPlanValidationResult,
  recovery: WorkoutPlanValidationRecovery,
  detail?: unknown,
): AiWorkoutPlanFailure {
  return {
    ok: false,
    code: "plan_validation_failed",
    message:
      intent.intentType === "routine"
        ? "AI 生成的单次训练编排没有通过服务端校验。"
        : "AI 生成的训练计划没有通过服务端校验。",
    detail,
    recoverable: recovery.recoverable,
    guidanceMessage: recovery.guidanceMessage,
    suggestedReplies: recovery.suggestedReplies,
    intent,
    candidates,
    validation,
  };
}

async function extractWorkoutPlanIntent(
  conversationSummaryContext: ConversationSummaryContext,
  apiKey: string,
  trace?: AiTraceLogger,
  tokenBudgetDecision?: AiTokenBudgetDecision,
): Promise<
  | { ok: true; intent: WorkoutPlanIntent }
  | {
      ok: false;
      code: "intent_extraction_failed" | "ai_request_failed" | "invalid_json";
      message: string;
      detail?: unknown;
    }
> {
  const modelMessages: DeepSeekChatMessage[] = [
    {
      role: "system",
      content: [
        buildPromptFromModules(["base_safety", "conversation_summary_context", "workout_plan_intent_extraction"]),
        formatConversationSummaryContextForPrompt(conversationSummaryContext),
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    {
      role: "user",
      content: conversationSummaryContext.latestUserMessage,
    },
  ];

  const content = await requestDeepSeekJson("intent_extraction", apiKey, modelMessages, trace, tokenBudgetDecision);

  if (!content.ok) {
    return content;
  }

  const parsedJson = parseJsonObject(content.content);

  if (!parsedJson.ok) {
    return parsedJson;
  }

  const parsedIntent = workoutPlanIntentSchema.safeParse(parsedJson.value);

  if (!parsedIntent.success) {
    return {
      ok: false,
      code: "intent_extraction_failed",
      message: "AI 抽取的用户计划意图未通过校验。",
      detail: parsedIntent.error.flatten(),
    };
  }

  return {
    ok: true,
    intent: parsedIntent.data,
  };
}

async function generateWorkoutPlanDraft(
  conversationSummaryContext: ConversationSummaryContext,
  intent: WorkoutPlanIntent,
  candidates: ExerciseCandidateResult,
  apiKey: string,
  trace?: AiTraceLogger,
  tokenBudgetDecision?: AiTokenBudgetDecision,
): Promise<WorkoutDraftGenerationResult> {
  const exercisePayload = buildExercisePromptPayload(candidates);
  const promptModules: AiPromptModuleId[] = [
    "base_safety",
    "conversation_summary_context",
    "workout_plan_draft_base",
    intent.intentType === "routine" ? "workout_plan_draft_routine" : "workout_plan_draft_plan",
    "workout_plan_draft_schema",
    "exercise_candidate_constraints",
  ];
  const modelMessages: DeepSeekChatMessage[] = [
    {
      role: "system",
      content: buildPromptFromModules(promptModules),
    },
    {
      role: "user",
      content: JSON.stringify({
        intent,
        conversationSummary: conversationSummaryContext.summary,
        latestUserMessage: conversationSummaryContext.latestUserMessage,
        primaryExercises: exercisePayload.primaryExercises,
        supplementaryExercises: exercisePayload.supplementaryExercises,
        warmupExercises: exercisePayload.warmupExercises,
        trainingExercises: exercisePayload.trainingExercises,
        stretchExercises: exercisePayload.stretchExercises,
      }),
    },
  ];

  const content = await requestDeepSeekJson("draft_generation", apiKey, modelMessages, trace, tokenBudgetDecision);

  if (!content.ok) {
    return content;
  }

  const parsedJson = parseJsonObject(content.content);

  if (!parsedJson.ok) {
    return parsedJson;
  }

  const parsedDraft =
    intent.intentType === "routine"
      ? workoutRoutineDraftSchema.safeParse(parsedJson.value)
      : workoutPlanDraftSchema.safeParse(parsedJson.value);

  if (!parsedDraft.success) {
    trace?.addStep({
      name: intent.intentType === "routine" ? "单次训练编排结构校验失败" : "训练计划草稿结构校验失败",
      type: "validation",
      status: "failed",
      input: parsedJson.value,
      error: parsedDraft.error.flatten(),
    });
    console.error("[ai-workout-plan-service] draft zod validation failed! Details:", JSON.stringify(parsedDraft.error.format(), null, 2));
    return {
      ok: false,
      code: "invalid_ai_output",
      message:
        intent.intentType === "routine"
          ? "AI 生成的单次训练编排未通过结构校验。"
          : "AI 生成的训练计划草稿未通过结构校验。",
      detail: parsedDraft.error.flatten(),
    };
  }

  return {
    ok: true,
    draft: parsedDraft.data,
  };
}

async function repairWorkoutPlanDraft(
  conversationSummaryContext: ConversationSummaryContext,
  intent: WorkoutPlanIntent,
  candidates: ExerciseCandidateResult,
  originalDraft: WorkoutPlanDraft | WorkoutRoutineDraft,
  validation: WorkoutPlanValidationResult,
  apiKey: string,
  trace?: AiTraceLogger,
  tokenBudgetDecision?: AiTokenBudgetDecision,
): Promise<WorkoutDraftGenerationResult> {
  const exercisePayload = buildExercisePromptPayload(candidates);
  const recovery = classifyWorkoutPlanValidationFailure(validation, {
    targetSessionMinutes: intent.sessionMinutes,
  });
  const modelMessages: DeepSeekChatMessage[] = [
    {
      role: "system",
      content: [
        buildPromptFromModules([
          "base_safety",
          "conversation_summary_context",
          "workout_plan_draft_base",
          intent.intentType === "routine" ? "workout_plan_draft_routine" : "workout_plan_draft_plan",
          "workout_plan_draft_schema",
          "exercise_candidate_constraints",
          "workout_plan_draft_repair",
        ]),
        "你正在修复一个未通过服务端校验的训练草稿。",
        "你必须只返回修复后的 JSON 对象，不要输出 Markdown，不要解释。",
        "必须保留原始 kind，并继续只使用候选动作中的 exerciseId。",
        "如果错误包含 session_too_long，必须把训练压缩到用户目标时长附近，优先减少动作数量、组数、循环轮数或休息配置。",
        "如果错误包含 session_too_short，必须把训练补足到用户目标时长附近，优先增加主训练循环轮数、主训练动作组数、合理次数、合适训练动作或合理休息配置；禁止只修改 estimatedSessionMinutes。",
        "如果错误包含 day_estimate_mismatch，必须先根据 validation.dayEstimates 判断实际估算和声明时长的方向，再通过动作参数、循环轮数或休息配置修复真实估算。",
        "修复后仍必须满足三段式 routine 或长期 plan 的结构要求。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        intent,
        conversationSummary: conversationSummaryContext.summary,
        latestUserMessage: conversationSummaryContext.latestUserMessage,
        recovery,
        validation,
        originalDraft,
        primaryExercises: exercisePayload.primaryExercises,
        supplementaryExercises: exercisePayload.supplementaryExercises,
        warmupExercises: exercisePayload.warmupExercises,
        trainingExercises: exercisePayload.trainingExercises,
        stretchExercises: exercisePayload.stretchExercises,
      }),
    },
  ];

  trace?.addStep({
    name: "训练草稿自动修复请求",
    type: "model_request",
    input: {
      intent,
      recovery,
      validation,
      originalDraft,
      primaryExercises: exercisePayload.primaryExercises,
      supplementaryExercises: exercisePayload.supplementaryExercises,
    },
  });

  const content = await requestDeepSeekJson("draft_repair", apiKey, modelMessages, trace, tokenBudgetDecision);

  if (!content.ok) {
    return content;
  }

  const parsedJson = parseJsonObject(content.content);

  if (!parsedJson.ok) {
    return parsedJson;
  }

  const parsedDraft =
    intent.intentType === "routine"
      ? workoutRoutineDraftSchema.safeParse(parsedJson.value)
      : workoutPlanDraftSchema.safeParse(parsedJson.value);

  if (!parsedDraft.success) {
    trace?.addStep({
      name: intent.intentType === "routine" ? "修复后单次训练编排结构校验失败" : "修复后训练计划草稿结构校验失败",
      type: "validation",
      status: "failed",
      input: parsedJson.value,
      error: parsedDraft.error.flatten(),
    });

    return {
      ok: false,
      code: "invalid_ai_output",
      message:
        intent.intentType === "routine"
          ? "AI 修复后的单次训练编排未通过结构校验。"
          : "AI 修复后的训练计划草稿未通过结构校验。",
      detail: parsedDraft.error.flatten(),
    };
  }

  trace?.addStep({
    name: "训练草稿自动修复输出",
    type: "model_response",
    output: parsedDraft.data,
  });

  return {
    ok: true,
    draft: parsedDraft.data,
  };
}

// 训练草稿模型只需要候选动作的编排语义，图片、英文名和完整动作对象留在服务端校验与展示链路。
function buildExercisePromptPayload(candidates: ExerciseCandidateResult) {
  return {
    primaryExercises: candidates.primaryCandidates.slice(0, maxModelCandidates).map(toModelExerciseSummary),
    supplementaryExercises: candidates.supplementaryCandidates.slice(0, maxModelCandidates).map(toModelExerciseSummary),
    warmupExercises: candidates.candidatePools.warmup.slice(0, maxModelCandidates).map(toModelExerciseSummary),
    trainingExercises: candidates.candidatePools.training.slice(0, maxModelCandidates).map(toModelExerciseSummary),
    stretchExercises: candidates.candidatePools.stretch.slice(0, maxModelCandidates).map(toModelExerciseSummary),
  };
}

// 模型候选摘要只保留动作编排字段，避免把 UI 展示字段或健康风险标签混进 prompt。
function toModelExerciseSummary({ exercise, source, reasons }: ExerciseCandidate) {
  return {
    exerciseId: exercise.id,
    nameZh: exercise.nameZh,
    targetMusclesZh: exercise.primaryMusclesZh,
    equipmentOrLocation: exercise.equipmentZh,
    level: exercise.level,
    categoryZh: exercise.categoryZh,
    matchingReasons: reasons.slice(0, 4),
    candidateSource: source,
  };
}

async function requestDeepSeekJson(
  taskName: string,
  apiKey: string,
  messages: DeepSeekChatMessage[],
  trace?: AiTraceLogger,
  tokenBudgetDecision?: AiTokenBudgetDecision,
): Promise<
  | { ok: true; content: string }
  | { ok: false; code: "ai_request_failed"; message: string; detail?: unknown }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deepSeekRequestTimeoutMs);
  const budgetStage = resolveWorkoutPlanBudgetStage(taskName, tokenBudgetDecision);

  try {
    trace?.addStep({
      name: `${taskName} 大模型请求`,
      type: "model_request",
      input: {
        model,
        messages,
        stream: false,
        thinking: {
          type: "disabled",
        },
      },
      metadata: {
        aiStage: budgetStage?.stage,
        aiStageStatus: "executed",
        promptModules: budgetStage?.promptModules ?? [],
        tokenBudgetDecision,
        candidateTrim: budgetStage?.candidateTrim,
        task: taskName,
        timeoutMs: deepSeekRequestTimeoutMs,
      },
    });

    const response = await serverRequest("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      responseType: "raw",
      throwOnError: false,
      signal: controller.signal,
      body: {
        model,
        messages,
        stream: false,
        thinking: {
          type: "disabled",
        },
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      const failure = {
        ok: false,
        code: "ai_request_failed",
        message: "DeepSeek API request failed.",
        detail,
      } as const;

      trace?.addStep({
        name: `${taskName} 大模型响应失败`,
        type: "error",
        status: "failed",
        output: failure,
      });
      logAiWorkoutPlanFailure(taskName, failure);
      return failure;
    }

    const data = (await response.json()) as DeepSeekChatResponse;
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      const failure = {
        ok: false,
        code: "ai_request_failed",
        message: "DeepSeek API returned an empty response.",
      } as const;

      trace?.addStep({
        name: `${taskName} 大模型响应为空`,
        type: "error",
        status: "failed",
        output: failure,
      });
      logAiWorkoutPlanFailure(taskName, failure);
      return failure;
    }

    trace?.addStep({
      name: `${taskName} 大模型输出`,
      type: "model_response",
      output: {
        content,
      },
      metadata: {
        task: taskName,
        status: response.status,
        tokenUsage: data.usage,
      },
    });

    return {
      ok: true,
      content,
    };
  } catch (error) {
    const isAbortError = error instanceof DOMException && error.name === "AbortError";
    const failure = {
      ok: false,
      code: "ai_request_failed",
      message: isAbortError ? "DeepSeek API request timed out." : "DeepSeek API request failed.",
      detail: error instanceof Error ? error.message : error,
    } as const;

    trace?.addStep({
      name: `${taskName} 大模型请求异常`,
      type: "error",
      status: "failed",
      error: failure,
    });
    logAiWorkoutPlanFailure(taskName, failure);
    return failure;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonObject(
  content: string,
):
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
      message: "AI 返回了非法 JSON。",
      detail: error instanceof Error ? error.message : error,
    };
  }
}

function logAiWorkoutPlanFailure(
  stage: string,
  failure: {
    code: string;
    message: string;
    detail?: unknown;
  },
) {
  console.warn("[ai-workout-plan] failed", {
    stage,
    code: failure.code,
    message: failure.message,
    detail: failure.detail,
  });
}
