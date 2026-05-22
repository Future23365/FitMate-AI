import { z } from "zod";

import { aiPromptConfig } from "@/app/api/ai-prompt-config";
import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import type { Exercise } from "@/lib/shared/exercises/types";
import { serverRequest } from "@/lib/server/http/server-request";

import {
  workoutPlanDraftSchema,
  workoutPlanIntentSchema,
  type WorkoutPlanDraft,
  type WorkoutPlanIntent,
} from "@/lib/shared/workout-plans/draft-schema";
import {
  getCandidateExerciseIds,
  selectExerciseCandidates,
  type ExerciseCandidateResult,
} from "./exercise-candidate-service";
import {
  validateWorkoutPlanDraft,
  type WorkoutPlanValidationResult,
} from "./workout-plan-validation-service";

export const aiWorkoutPlanChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

export const aiWorkoutPlanRequestSchema = z.object({
  messages: z.array(aiWorkoutPlanChatMessageSchema).min(1).max(30),
  intent: workoutPlanIntentSchema.optional(),
});

export type AiWorkoutPlanChatMessage = z.infer<typeof aiWorkoutPlanChatMessageSchema>;
export type AiWorkoutPlanRequest = z.infer<typeof aiWorkoutPlanRequestSchema>;

export type AiWorkoutPlanFailureCode =
  | "missing_api_key"
  | "high_risk_health_condition"
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
  intent?: WorkoutPlanIntent;
  candidates?: ExerciseCandidateResult;
  validation?: WorkoutPlanValidationResult;
};

export type AiWorkoutPlanSuccess = {
  ok: true;
  intent: WorkoutPlanIntent;
  draft: WorkoutPlanDraft;
  candidates: ExerciseCandidateResult;
  validation: WorkoutPlanValidationResult;
};

export type AiWorkoutPlanResult = AiWorkoutPlanSuccess | AiWorkoutPlanFailure;

type AiWorkoutPlanGenerationOptions = {
  trace?: AiTraceLogger;
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
const maxModelCandidates = 40;
const logPreviewLength = 4000;
const deepSeekRequestTimeoutMs = 45_000;

export async function generateAiWorkoutPlanDraft(
  rawRequest: AiWorkoutPlanRequest,
  options: AiWorkoutPlanGenerationOptions = {},
): Promise<AiWorkoutPlanResult> {
  const request = aiWorkoutPlanRequestSchema.parse(rawRequest);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const trace = options.trace;

  if (!apiKey) {
    return {
      ok: false,
      code: "missing_api_key",
      message: "Missing DEEPSEEK_API_KEY environment variable.",
    };
  }

  // 高风险健康情况由 AI 聊天层 system prompt 自行判断，不在此处硬拦截


  const intentResult = request.intent
    ? { ok: true as const, intent: request.intent }
    : await extractWorkoutPlanIntent(request.messages, apiKey, trace);

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
  const candidates = selectExerciseCandidates(intentResult.intent, exercises);
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
      excluded: candidates.excluded.slice(0, 80),
    },
    metadata: {
      primaryCandidateCount: candidates.primaryCandidates.length,
      supplementaryCandidateCount: candidates.supplementaryCandidates.length,
      excludedCount: candidates.excluded.length,
    },
  });

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
    request.messages,
    intentResult.intent,
    candidates,
    apiKey,
    trace,
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

  const validation = validateWorkoutPlanDraft(
    draftResult.draft,
    intentResult.intent,
    {
      exercises,
      candidateExerciseIds: getCandidateExerciseIds(candidates),
    },
  );
  trace?.addStep({
    name: "训练计划草稿校验",
    type: "validation",
    status: validation.valid ? "success" : "failed",
    input: {
      draft: draftResult.draft,
      intent: intentResult.intent,
      candidateExerciseIds: getCandidateExerciseIds(candidates),
    },
    output: validation,
  });

  if (!validation.valid) {
    const failure = {
      ok: false,
      code: "plan_validation_failed",
      message: "AI 生成的训练计划没有通过服务端校验。",
      intent: intentResult.intent,
      candidates,
      validation,
    } satisfies AiWorkoutPlanFailure;

    logAiWorkoutPlanFailure("plan_validation", failure);
    return failure;
  }

  const success = {
    ok: true,
    intent: intentResult.intent,
    draft: draftResult.draft,
    candidates,
    validation,
  } satisfies AiWorkoutPlanSuccess;

  console.info("[ai-workout-plan] completed", {
    title: success.draft.title,
    weeklyFrequency: success.draft.weeklyFrequency,
    candidateCount:
      success.candidates.primaryCandidates.length +
      success.candidates.supplementaryCandidates.length,
    warningCount: success.validation.warnings.length,
  });

  return success;
}

async function extractWorkoutPlanIntent(
  messages: AiWorkoutPlanChatMessage[],
  apiKey: string,
  trace?: AiTraceLogger,
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
      content: aiPromptConfig.workoutPlanIntentExtraction.system,
    },
    ...messages,
  ];

  const content = await requestDeepSeekJson("intent_extraction", apiKey, modelMessages, trace);

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
  messages: AiWorkoutPlanChatMessage[],
  intent: WorkoutPlanIntent,
  candidates: ExerciseCandidateResult,
  apiKey: string,
  trace?: AiTraceLogger,
): Promise<
  | { ok: true; draft: WorkoutPlanDraft }
  | {
      ok: false;
      code: "ai_request_failed" | "invalid_json" | "invalid_ai_output";
      message: string;
      detail?: unknown;
    }
> {
  const primaryPayload = candidates.primaryCandidates
    .slice(0, maxModelCandidates)
    .map(({ exercise }) => ({
      exerciseId: exercise.id,
      nameZh: exercise.nameZh,
      categoryZh: exercise.categoryZh,
      level: exercise.level,
      equipmentZh: exercise.equipmentZh,
      primaryMusclesZh: exercise.primaryMusclesZh,
      riskTags: exercise.riskTags,
      goalTags: exercise.goalTags,
    }));

  const supplementaryPayload = candidates.supplementaryCandidates
    .slice(0, maxModelCandidates)
    .map(({ exercise }) => ({
      exerciseId: exercise.id,
      nameZh: exercise.nameZh,
      categoryZh: exercise.categoryZh,
      level: exercise.level,
      equipmentZh: exercise.equipmentZh,
      primaryMusclesZh: exercise.primaryMusclesZh,
      riskTags: exercise.riskTags,
      goalTags: exercise.goalTags,
    }));

  const modelMessages: DeepSeekChatMessage[] = [
    {
      role: "system",
      content: [
        ...aiPromptConfig.workoutPlanDraftGeneration.base,
        intent.intentType === "routine"
          ? aiPromptConfig.workoutPlanDraftGeneration.routine
          : aiPromptConfig.workoutPlanDraftGeneration.plan,
        ...aiPromptConfig.workoutPlanDraftGeneration.schema,
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        intent,
        primaryExercises: primaryPayload,
        supplementaryExercises: supplementaryPayload,
        recentMessages: messages,
      }),
    },
  ];

  const content = await requestDeepSeekJson("draft_generation", apiKey, modelMessages, trace);

  if (!content.ok) {
    return content;
  }

  const parsedJson = parseJsonObject(content.content);

  if (!parsedJson.ok) {
    return parsedJson;
  }

  const parsedDraft = workoutPlanDraftSchema.safeParse(parsedJson.value);

  if (!parsedDraft.success) {
    trace?.addStep({
      name: "训练计划草稿结构校验失败",
      type: "validation",
      status: "failed",
      input: parsedJson.value,
      error: parsedDraft.error.flatten(),
    });
    console.error("[ai-workout-plan-service] draft zod validation failed! Details:", JSON.stringify(parsedDraft.error.format(), null, 2));
    console.error("[ai-workout-plan-service] failed draft JSON was:", JSON.stringify(parsedJson.value, null, 2));
    return {
      ok: false,
      code: "invalid_ai_output",
      message: "AI 生成的训练计划草稿未通过结构校验。",
      detail: parsedDraft.error.flatten(),
    };
  }

  return {
    ok: true,
    draft: parsedDraft.data,
  };
}

async function requestDeepSeekJson(
  taskName: string,
  apiKey: string,
  messages: DeepSeekChatMessage[],
  trace?: AiTraceLogger,
): Promise<
  | { ok: true; content: string }
  | { ok: false; code: "ai_request_failed"; message: string; detail?: unknown }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deepSeekRequestTimeoutMs);

  try {
    trace?.addStep({
      name: `${taskName} 模型请求`,
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
        task: taskName,
        timeoutMs: deepSeekRequestTimeoutMs,
      },
    });

    console.info("[ai-workout-plan] deepseek_request", {
      task: taskName,
      model,
      messageCount: messages.length,
      timeoutMs: deepSeekRequestTimeoutMs,
      payload: previewLogObject({
        model,
        messages,
        stream: false,
        thinking: {
          type: "disabled",
        },
      }),
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
        name: `${taskName} 模型响应失败`,
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
        name: `${taskName} 模型响应为空`,
        type: "error",
        status: "failed",
        output: failure,
      });
      logAiWorkoutPlanFailure(taskName, failure);
      return failure;
    }

    trace?.addStep({
      name: `${taskName} 模型输出`,
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

    console.info("[ai-workout-plan] deepseek_response", {
      task: taskName,
      model,
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
      name: `${taskName} 模型请求异常`,
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

function hasHighRiskHealthCondition(messages: AiWorkoutPlanChatMessage[]) {
  const text = messages.map((message) => message.content).join(" ");

  return /(胸痛|心脏病|心梗|中风|晕厥|昏厥|怀孕|孕期|产后|骨折|术后|手术后|高血压|糖尿病|癌症|肿瘤)/.test(
    text,
  );
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

function previewLogText(value: string) {
  return value.length > logPreviewLength ? `${value.slice(0, logPreviewLength)}...` : value;
}

function previewLogObject(value: unknown) {
  return previewLogText(JSON.stringify(value));
}
