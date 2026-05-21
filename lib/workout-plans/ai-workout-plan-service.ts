import { z } from "zod";

import { listAllExercises } from "@/lib/exercises/exercise-service";
import type { Exercise } from "@/lib/exercises/types";

import {
  workoutPlanDraftSchema,
  workoutPlanIntentSchema,
  type WorkoutPlanDraft,
  type WorkoutPlanIntent,
} from "./draft-schema";
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

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
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
): Promise<AiWorkoutPlanResult> {
  const request = aiWorkoutPlanRequestSchema.parse(rawRequest);
  const apiKey = process.env.DEEPSEEK_API_KEY;

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
    : await extractWorkoutPlanIntent(request.messages, apiKey);

  if (!intentResult.ok) {
    logAiWorkoutPlanFailure("intent_extraction", intentResult);
    return intentResult;
  }

  const exercises = await listAllExercises();
  const candidates = selectExerciseCandidates(intentResult.intent, exercises);

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
): Promise<
  | { ok: true; intent: WorkoutPlanIntent }
  | {
      ok: false;
      code: "intent_extraction_failed" | "ai_request_failed" | "invalid_json";
      message: string;
      detail?: unknown;
    }
> {
  const content = await requestDeepSeekJson("intent_extraction", apiKey, [
    {
      role: "system",
      content: [
        "你是 FitMate AI 的训练计划意图抽取器。",
        "请只根据对话内容抽取用户训练计划意图，并只返回 JSON。",
        "不要输出 Markdown，不要解释。",
        "如果信息不足，请根据最保守且合理的默认值补齐：intentType 默认 plan，experience 默认 beginner，sessionMinutes 默认 30，weeklyFrequency 默认 3，数组字段默认 []。",
        "JSON 字段必须是：intentType, goal, experience, sessionMinutes, weeklyFrequency, equipment, injuryLimitations, preferences, avoidances。",
        "intentType 只能是 plan（长期计划） 或 routine（单次动作编排/动作组/动作列表）。",
        "experience 只能是 beginner、intermediate、advanced。",
      ].join("\n"),
    },
    ...messages,
  ]);

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

  const content = await requestDeepSeekJson("draft_generation", apiKey, [
    {
      role: "system",
      content: [
        "你是 FitMate AI 的训练计划生成器。",
        "你必须只返回一个 JSON 对象，不要输出 Markdown，不要解释。",
        "你会收到两组候选动作：",
        "1. primaryExercises（核心候选）：根据用户意图推断出的动作，你必须优先从这里选择，计划中的主要训练动作应来自此列表。",
        "2. supplementaryExercises（补充候选）：用户未明确提及的补充动作，你可以根据训练计划的完整性自主选用（如热身、拉伸、协同肌群训练等），但不必全部使用。",
        "所有动作的 exerciseId 必须来自以上两组候选（包括 primaryExercises 和 supplementaryExercises），绝对禁止编造动作 ID！",
        "不能给出医疗诊断或治疗建议。",
        "如果用户有疼痛或伤病限制，计划必须保守，并在 safetyNotes 中提示停止疼痛动作并咨询专业人士。",
        intent.intentType === "routine"
          ? "注意：由于用户的意图是生成单次动作编排列表 (routine)，你输出 of days 数组必须只能包含 1 个训练日，title 也应该聚焦于该单次动作编排（例如「胸肌轰炸动作编排」）。整个计划的 weeklyFrequency 必须固定为 1。"
          : "注意：由于用户的意图是生成长期训练计划 (plan)，你必须根据 weeklyFrequency 生成包含多天的完整计划（例如每周 3 次就必须在 days 数组中输出 3 个训练日）。",
        "输出的 JSON 对象必须严格符合以下 TypeScript 类型定义：",
        "",
        "interface WorkoutPlanDraft {",
        "  title: string; // 训练计划标题，例如 \"活力减脂计划\"",
        "  goal: string; // 训练目标，例如 \"全身减脂\"",
        "  summary: string; // 计划简述，例如 \"适合新手的自重全身减脂计划\"",
        "  weeklyFrequency: number; // 每周训练频率 (1-7)",
        "  estimatedSessionMinutes: number; // 单次预估时长 (5-240)",
        "  safetyNotes: string[]; // 全局安全建议与限制说明，必须是字符串数组，例如 [\"注意保持身体直立\", \"避免憋气\"]",
        "  days: Array<{",
        "    title: string; // 训练日标题，例如 \"Day 1 核心激活\"",
        "    focus: string; // 训练重点，例如 \"核心与下肢\"",
        "    dayIndex: number; // 训练日索引 (1-7)",
        "    estimatedMinutes: number; // 本日预估时间 (5-240)",
        "    safetyNotes: string[]; // 本训练日专属防伤提示，必须是字符串数组，例如 [\"训练前后注意拉伸\"]",
        "    items: Array<{",
        "      exerciseId: string; // 必须是候选动作中的 exerciseId，绝对不能编造！",
        "      mode: \"reps\" | \"duration\"; // 只能是 reps 或 duration",
        "      sets: number; // 组数 (1-8)",
        "      target: number; // 次数或秒数。如果是 reps，则为单组次数(1-600)；如果是 duration，则为单组秒数(1-600)",
        "      setRestSeconds: number; // 组间休息秒数 (0-300)",
        "      transitionRestSeconds: number; // 动作过渡休息秒数 (0-600)",
        "      notes?: string; // 动作备注，例如 \"注意核心收紧\"",
        "    }>;",
        "  }>;",
        "}",
        "",
        "组数、次数、时长和休息必须保守可执行。",
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
  ]);

  if (!content.ok) {
    return content;
  }

  const parsedJson = parseJsonObject(content.content);

  if (!parsedJson.ok) {
    return parsedJson;
  }

  const parsedDraft = workoutPlanDraftSchema.safeParse(parsedJson.value);

  if (!parsedDraft.success) {
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
): Promise<
  | { ok: true; content: string }
  | { ok: false; code: "ai_request_failed"; message: string; detail?: unknown }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deepSeekRequestTimeoutMs);

  try {
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

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        thinking: {
          type: "disabled",
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      const failure = {
        ok: false,
        code: "ai_request_failed",
        message: "DeepSeek API request failed.",
        detail,
      } as const;

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

      logAiWorkoutPlanFailure(taskName, failure);
      return failure;
    }

    console.info("[ai-workout-plan] deepseek_response", {
      task: taskName,
      model,
      content: previewLogText(content),
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
