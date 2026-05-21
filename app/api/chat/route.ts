import { NextResponse } from "next/server";
import { z } from "zod";

import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import { serverRequest } from "@/lib/server/http/server-request";
import {
  selectExerciseCandidates,
  workoutPlanIntentSchema,
  type WorkoutPlanIntent,
} from "@/lib/server/workout-plans";

type ChatRole = "user" | "assistant";

type ChatMessage = {
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
};

type DeepSeekChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const chatIntentSchema = z.object({
  type: z
    .enum([
      "general_fitness_advice",
      "exercise_recommendation",
      "workout_plan",
      "routine",
      "exercise_replacement",
      "exercise_explanation",
      "non_fitness",
    ])
    .default("general_fitness_advice"),
  needsExerciseContext: z.boolean().default(false),
  workoutIntent: workoutPlanIntentSchema.optional(),
  requestedExerciseName: z.string().trim().max(80).optional(),
});

type ChatIntent = z.infer<typeof chatIntentSchema>;

type ExerciseContext = {
  intent: WorkoutPlanIntent;
  providedExercises: Array<{
    exerciseId: string;
    nameZh: string;
    categoryZh: string;
    level: string;
    equipmentZh: string;
    primaryMusclesZh: string[];
    secondaryMusclesZh: string[];
    riskTags: string[];
    goalTags: string[];
    source: "primary" | "supplementary" | "name_match";
  }>;
  candidateStatus: "enough" | "limited_but_usable" | "insufficient";
  relevantCandidateCount: number;
  requiredRelevantCandidateCount: number;
  warnings: string[];
};

const SYSTEM_PROMPT = `你是 FitMate AI，一个中文 AI 健身聊天助手。
你的职责是理解用户的健身目标、训练条件、时间安排和限制，并给出安全、可执行的训练建议。
如果用户描述疼痛、伤病、疾病、孕期或高风险健康情况，你必须提醒其咨询医生或专业人士，不能做医疗诊断。

如果你在对话中判定用户具有明确的“定制/生成/安排/制定训练计划”的意图，且你已经通过对话基本了解了（或合理默认推断了）他们的意图画像，你必须在你的自然语言回复结尾，**单独以一个 \`\`\`json 开头和结尾的代码块形式**，输出一个专属的 Trigger 对象用于智能触发后台计划生成。
这个代码块必须格式严格如下：
\`\`\`json
{
  "type": "workout_plan_trigger",
  "intent": {
    "intentType": "plan",
    "goal": "胸肌增肌",
    "experience": "beginner",
    "sessionMinutes": 45,
    "weeklyFrequency": 3,
    "equipment": ["dumbbell"],
    "injuryLimitations": [],
    "preferences": ["居家训练"],
    "avoidances": []
  }
}
\`\`\`

注意：
1. Trigger JSON 块必须紧跟在您自然的文字回复之后，**单独成行输出**，必须确保其 JSON 格式合法。
2. intentType 只能是 "plan" 或 "routine"。如果用户只是想要一份单次的动作编排/动作组/动作列表，判定为 "routine"；如果用户是想制定整体、长期、周/月训练计划，判定为 "plan"。
3. experience 只能是 "beginner"、"intermediate" 或 "advanced"，默认 "beginner"。
4. sessionMinutes 是单次训练时长，单位分钟，默认 30；weeklyFrequency 是每周训练频次，默认 3。
5. equipment、injuryLimitations、preferences、avoidances 都必须是字符串数组；若无信息，使用空数组，equipment 可合理默认 ["none"]。
6. 如果用户描述包含任何严重的高风险健康情况（如胸痛、心脏病、心梗、晕厥、孕期、骨折、刚做完手术等），请在正文自然语言回复中极力警告并强烈建议其就医，**不要**输出此 Trigger JSON 代码块。`;
const DEEPSEEK_REQUEST_TIMEOUT_MS = 45_000;
const INTENT_REQUEST_TIMEOUT_MS = 12_000;
const LOG_PREVIEW_LENGTH = 4000;

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeMessage = value as Partial<ChatMessage>;

  return (
    (maybeMessage.role === "user" || maybeMessage.role === "assistant") &&
    typeof maybeMessage.content === "string" &&
    maybeMessage.content.trim().length > 0
  );
}

function encodeStreamEvent(type: string, delta = "") {
  return new TextEncoder().encode(`${JSON.stringify({ type, delta })}\n`);
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing DEEPSEEK_API_KEY environment variable." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    messages?: unknown;
    thinkingEnabled?: unknown;
  } | null;

  if (!body || !Array.isArray(body.messages)) {
    return NextResponse.json(
      { error: "Request body must include a messages array." },
      { status: 400 },
    );
  }

  const messages = body.messages.filter(isChatMessage).slice(-20);
  const thinkingEnabled = body.thinkingEnabled !== false;

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "At least one valid message is required." },
      { status: 400 },
    );
  }

  const chatIntent = await resolveChatIntent(apiKey, messages);
  const exerciseContext = chatIntent.needsExerciseContext
    ? await buildExerciseContext(chatIntent, messages)
    : null;
  const systemPrompt = buildSystemPrompt(chatIntent, exerciseContext);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPSEEK_REQUEST_TIMEOUT_MS);
  let response: Response;

  console.info("[chat] deepseek_request", {
    model: "deepseek-v4-flash",
    messageCount: messages.length,
    thinkingEnabled,
    intent: chatIntent.type,
    exerciseContextCount: exerciseContext?.providedExercises.length ?? 0,
    timeoutMs: DEEPSEEK_REQUEST_TIMEOUT_MS,
    payload: previewLogObject({
      model: "deepseek-v4-flash",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
      thinking: {
        type: thinkingEnabled ? "enabled" : "disabled",
      },
    }),
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
        thinking: {
          type: thinkingEnabled ? "enabled" : "disabled",
        },
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    console.warn("[chat] deepseek_failed", {
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "DeepSeek API request timed out."
          : "DeepSeek API request failed.",
      detail: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
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

    console.warn("[chat] deepseek_failed", {
      status: response.status,
      detail: errorText,
    });

    return NextResponse.json(
      {
        error: "DeepSeek API request failed.",
        detail: errorText,
      },
      { status: response.status },
    );
  }

  if (!response.body) {
    clearTimeout(timeout);
    console.warn("[chat] deepseek_failed", {
      status: 502,
      detail: "DeepSeek API returned an empty stream.",
    });

    return NextResponse.json(
      { error: "DeepSeek API returned an empty stream." },
      { status: 502 },
    );
  }

  console.info("[chat] deepseek_response", {
    status: response.status,
    contentType: response.headers.get("content-type"),
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) {
        clearTimeout(timeout);
        controller.enqueue(encodeStreamEvent("error", "DeepSeek API returned an empty stream."));
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
              controller.enqueue(encodeStreamEvent("done"));
              controller.close();
              return;
            }

            const chunk = JSON.parse(data) as DeepSeekStreamChunk;
            const delta = chunk.choices?.[0]?.delta;
            const reasoning = delta?.reasoning_content;
            const content = delta?.content;

            if (reasoning) {
              controller.enqueue(encodeStreamEvent("reasoning", reasoning));
            }

            if (content) {
              controller.enqueue(encodeStreamEvent("content", content));
            }
          }
        }

        clearTimeout(timeout);
        controller.enqueue(encodeStreamEvent("done"));
        controller.close();
      } catch (error) {
        clearTimeout(timeout);
        console.warn("[chat] deepseek_failed", {
          message:
            error instanceof DOMException && error.name === "AbortError"
              ? "DeepSeek API stream timed out."
              : "Failed to read DeepSeek stream.",
          detail: error instanceof Error ? error.message : error,
        });
        controller.enqueue(
          encodeStreamEvent(
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

async function resolveChatIntent(apiKey: string, messages: ChatMessage[]): Promise<ChatIntent> {
  const fallbackIntent = createFallbackChatIntent(messages);

  try {
    const result = await requestDeepSeekJson(apiKey, [
      {
        role: "system",
        content: [
          "你是 FitMate AI 的聊天意图解析器。",
          "请只返回一个合法 JSON 对象，不要输出 Markdown，不要解释。",
          "你需要判断用户是否在请求具体动作推荐、训练计划、单次动作编排、动作替换或动作讲解。",
          "如果回答中可能需要出现具体动作名，needsExerciseContext 必须为 true。",
          "如果只是饮食、习惯、一般训练原则或非健身话题，needsExerciseContext 为 false。",
          "JSON 字段必须是：type, needsExerciseContext, workoutIntent, requestedExerciseName。",
          "type 只能是 general_fitness_advice、exercise_recommendation、workout_plan、routine、exercise_replacement、exercise_explanation、non_fitness。",
          "workoutIntent 字段在 needsExerciseContext 为 true 时必须给出，字段为 intentType, goal, experience, sessionMinutes, weeklyFrequency, equipment, injuryLimitations, preferences, avoidances。",
          "workoutIntent.intentType 只能是 plan 或 routine；experience 只能是 beginner、intermediate、advanced。",
          "信息不足时使用保守默认值：goal 使用用户问题的核心目标，experience=beginner，sessionMinutes=30，weeklyFrequency=3，数组字段默认 []。",
        ].join("\n"),
      },
      ...messages,
    ]);

    if (!result.ok) {
      console.warn("[chat] intent_resolution_failed", result);
      return fallbackIntent;
    }

    const parsedIntent = chatIntentSchema.safeParse(result.value);

    if (!parsedIntent.success) {
      console.warn("[chat] intent_validation_failed", {
        detail: parsedIntent.error.flatten(),
        value: result.value,
      });
      return fallbackIntent;
    }

    const data = parsedIntent.data;

    if (data.needsExerciseContext && !data.workoutIntent) {
      return {
        ...data,
        workoutIntent: fallbackIntent.workoutIntent,
      };
    }

    return data;
  } catch (error) {
    console.warn("[chat] intent_resolution_failed", {
      detail: error instanceof Error ? error.message : error,
    });
    return fallbackIntent;
  }
}

async function buildExerciseContext(
  chatIntent: ChatIntent,
  messages: ChatMessage[],
): Promise<ExerciseContext> {
  const exercises = await listAllExercises();
  const intent = chatIntent.workoutIntent ?? createFallbackWorkoutIntent(messages, chatIntent.type);
  const candidates = selectExerciseCandidates(intent, exercises);
  const nameMatches = findExerciseNameMatches(exercises, chatIntent.requestedExerciseName);
  const seenIds = new Set<string>();
  const providedExercises: ExerciseContext["providedExercises"] = [];

  for (const exercise of nameMatches) {
    seenIds.add(exercise.id);
    providedExercises.push({
      exerciseId: exercise.id,
      nameZh: exercise.nameZh,
      categoryZh: exercise.categoryZh ?? "训练",
      level: exercise.level ?? "beginner",
      equipmentZh: exercise.equipmentZh ?? "自重",
      primaryMusclesZh: exercise.primaryMusclesZh,
      secondaryMusclesZh: exercise.secondaryMusclesZh,
      riskTags: exercise.riskTags,
      goalTags: exercise.goalTags,
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
      exerciseId: candidate.exercise.id,
      nameZh: candidate.exercise.nameZh,
      categoryZh: candidate.exercise.categoryZh ?? "训练",
      level: candidate.exercise.level ?? "beginner",
      equipmentZh: candidate.exercise.equipmentZh ?? "自重",
      primaryMusclesZh: candidate.exercise.primaryMusclesZh,
      secondaryMusclesZh: candidate.exercise.secondaryMusclesZh,
      riskTags: candidate.exercise.riskTags,
      goalTags: candidate.exercise.goalTags,
      source: candidate.source,
    });
  }

  return {
    intent,
    providedExercises,
    candidateStatus: candidates.candidateStatus,
    relevantCandidateCount: candidates.relevantCandidateCount,
    requiredRelevantCandidateCount: candidates.requiredRelevantCandidateCount,
    warnings: candidates.warnings,
  };
}

function buildSystemPrompt(chatIntent: ChatIntent, exerciseContext: ExerciseContext | null) {
  if (!exerciseContext) {
    return SYSTEM_PROMPT;
  }

  return [
    SYSTEM_PROMPT,
    "",
    "当前服务端已经先解析了用户意图，并从动作库查询出候选动作。你必须遵守以下规则：",
    "1. 如果回答里提到任何具体训练动作，动作名称必须来自 providedExercises.nameZh，禁止编造动作或使用候选列表之外的动作。",
    "2. 只有 candidateStatus 为 insufficient 时，你才能说明当前动作库没有足够匹配动作，并建议用户放宽器械、目标或限制条件。",
    "3. 如果 candidateStatus 为 enough 或 limited_but_usable，禁止说动作库没有匹配动作、无法推荐动作或需要用户放宽条件。",
    "4. 对 workout_plan 或 routine 场景，自然语言正文只做目标确认、安全提醒和生成说明，不要另写一套和卡片可能冲突的动作清单；具体动作以后台生成的计划卡片为准。",
    "5. 对 workout_plan 或 routine 场景，只要没有高风险健康情况，必须输出 workout_plan_trigger。",
    "6. 如果输出 workout_plan_trigger，intent 必须与 serverWorkoutIntent 保持一致。",
    "7. 如果用户有疼痛、伤病、疾病、孕期或高风险健康情况，正文必须提醒咨询医生或专业人士，不能做医疗诊断。",
    "",
    "serverParsedIntent:",
    JSON.stringify(
      {
        type: chatIntent.type,
        needsExerciseContext: chatIntent.needsExerciseContext,
        requestedExerciseName: chatIntent.requestedExerciseName,
      },
      null,
      2,
    ),
    "",
    "serverWorkoutIntent:",
    JSON.stringify(exerciseContext.intent, null, 2),
    "",
    "providedExercises:",
    JSON.stringify(exerciseContext.providedExercises, null, 2),
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

async function requestDeepSeekJson(
  apiKey: string,
  messages: DeepSeekChatMessage[],
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; code: "ai_request_failed" | "invalid_json"; message: string; detail?: unknown }
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

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = body.choices?.[0]?.message?.content?.trim() ?? "";
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

function parseJsonObject(content: string):
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

function createFallbackChatIntent(messages: ChatMessage[]): ChatIntent {
  const workoutIntent = createFallbackWorkoutIntent(messages, "general_fitness_advice");

  return {
    type: "general_fitness_advice",
    needsExerciseContext: /动作|训练|计划|编排|替换|推荐|练|胸|背|腿|肩|核心|减脂|增肌/.test(
      getLatestUserMessage(messages),
    ),
    workoutIntent,
  };
}

function createFallbackWorkoutIntent(
  messages: ChatMessage[],
  type: ChatIntent["type"],
): WorkoutPlanIntent {
  const latestUserMessage = getLatestUserMessage(messages);

  return workoutPlanIntentSchema.parse({
    intentType: type === "routine" ? "routine" : "plan",
    goal: latestUserMessage.slice(0, 80) || "综合体能提升",
    experience: "beginner",
    sessionMinutes: 30,
    weeklyFrequency: 3,
    equipment: [],
    injuryLimitations: extractByPattern(latestUserMessage, /(膝盖|腰|肩|手腕|脚踝|疼|痛|伤|不适)/),
    preferences: extractByPattern(latestUserMessage, /(居家|家里|徒手|自重|哑铃|杠铃|弹力带|低强度|高强度)/),
    avoidances: [],
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

function previewLogObject(value: unknown) {
  const text = JSON.stringify(value);

  return previewLogText(text);
}

function previewLogText(value: string) {
  return value.length > LOG_PREVIEW_LENGTH ? `${value.slice(0, LOG_PREVIEW_LENGTH)}...` : value;
}
