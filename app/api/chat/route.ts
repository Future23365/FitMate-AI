import { NextResponse } from "next/server";
import { z } from "zod";

import { startAiTrace, summarizeLatestUserMessage, type AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
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
如果用户描述疾病、孕期或其他高风险健康情况，你必须提醒其咨询医生或专业人士，不能做医疗诊断。

如果用户只是请求“推荐一些动作/有哪些动作可以练/某部位轻松练练”，但没有要求你安排组数、次数、休息、训练顺序、单次训练流程或长期计划，你必须只触发动作推荐卡片，不要触发训练计划或动作编排。
动作推荐 Trigger 必须在自然语言回复结尾，**单独以一个 \`\`\`json 开头和结尾的代码块形式**输出，格式如下：
\`\`\`json
{
  "type": "exercise_recommendation_trigger",
  "intent": {
    "intentType": "routine",
    "goal": "轻松臀部训练动作推荐",
    "experience": "beginner",
    "sessionMinutes": 20,
    "weeklyFrequency": 1,
    "equipment": ["none"],
    "injuryLimitations": [],
    "preferences": ["轻松一点"],
    "avoidances": []
  }
}
\`\`\`

如果用户表达的是“今天/这次/现在练什么/练多久/来一套/动作组/训练流程”这类单次训练需求，且已经明确提供训练目标、单次训练时长、可用器械或训练场地，你必须输出单次动作编排 Trigger，不能输出长期训练计划 Trigger。
单次动作编排 Trigger 必须在自然语言回复结尾，**单独以一个 \`\`\`json 开头和结尾的代码块形式**输出，格式如下：
\`\`\`json
{
  "type": "workout_routine_trigger",
  "intent": {
    "intentType": "routine",
    "goal": "腹部训练",
    "experience": "beginner",
    "sessionMinutes": 30,
    "weeklyFrequency": 1,
    "equipment": ["自重"],
    "injuryLimitations": [],
    "preferences": ["居家训练"],
    "avoidances": []
  }
}
\`\`\`

如果用户明确表达要制定长期、每周、多天、周期性训练计划，且已经明确提供训练目标、单次训练时长、可用器械或训练场地，你必须在你的自然语言回复结尾，**单独以一个 \`\`\`json 开头和结尾的代码块形式**，输出一个专属的 Trigger 对象用于智能触发后台计划生成。
长期计划 Trigger 必须格式严格如下：
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

如果你的自然语言回复中给了用户一个可以直接照着发送的示例问题、示例描述或下一步建议问题，你必须把这些可点击问题单独输出到 suggestedQuestions 字段中，不要让前端从正文中自行判断。
建议问题 Trigger 必须在自然语言回复结尾，**单独以一个 \`\`\`json 开头和结尾的代码块形式**输出，格式如下：
\`\`\`json
{
  "type": "suggested_question_trigger",
  "suggestedQuestions": ["今天在家想练20分钟腹部"]
}
\`\`\`

注意：
1. Trigger JSON 块必须紧跟在您自然的文字回复之后，**单独成行输出**，必须确保其 JSON 格式合法。
2. intentType 只能是 "plan" 或 "routine"。如果用户要求单次动作编排/动作组/动作列表/训练流程，判定为 "routine"；如果用户是想制定整体、长期、周/月训练计划，判定为 "plan"；如果用户只是要动作推荐，仍使用 intentType="routine"，但 Trigger type 必须是 "exercise_recommendation_trigger"。
3. experience 只能是 "beginner"、"intermediate" 或 "advanced"，默认 "beginner"。
4. sessionMinutes 是单次训练时长，单位分钟；weeklyFrequency 是每周训练频次。只有用户明确提供了生成计划所需关键信息时，才允许把默认值用于 Trigger。
5. equipment、injuryLimitations、preferences、avoidances 都必须是字符串数组；没有相关信息时使用空数组。
6. 同一条回复不要同时输出 workout_plan_trigger、workout_routine_trigger 和 exercise_recommendation_trigger。
7. 如果用户缺少训练目标、单次训练时长、可用器械或训练场地中的任意关键信息，你必须只用自然语言追问缺失信息，不要输出 workout_plan_trigger 或 workout_routine_trigger；如果正文给了可直接点击发送的示例问题，可以输出 suggested_question_trigger。
8. 如果用户描述包含任何严重的高风险健康情况（如胸痛、心脏病、心梗、晕厥、孕期、骨折、刚做完手术等），请在正文自然语言回复中极力警告并强烈建议其就医，**不要**输出 workout_plan_trigger、workout_routine_trigger 或 exercise_recommendation_trigger。`;
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
  const trace = startAiTrace({
    route: "/api/chat",
    title: summarizeLatestUserMessage(messages),
    metadata: {
      messageCount: messages.length,
      thinkingEnabled,
    },
  });

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "At least one valid message is required." },
      { status: 400 },
    );
  }

  trace.addStep({
    name: "用户输入",
    type: "user_input",
    input: {
      messages,
      thinkingEnabled,
    },
  });

  const chatIntent = await resolveChatIntent(apiKey, messages, trace);
  const exerciseContext = chatIntent.needsExerciseContext
    ? await buildExerciseContext(chatIntent, messages, trace)
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
  trace.addStep({
    name: "聊天模型请求",
    type: "model_request",
    input: {
      model: "deepseek-v4-flash",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
      thinking: {
        type: thinkingEnabled ? "enabled" : "disabled",
      },
    },
    metadata: {
      intent: chatIntent.type,
      exerciseContextCount: exerciseContext?.providedExercises.length ?? 0,
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
    trace.finish("failed");
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
    trace.addStep({
      name: "聊天模型响应失败",
      type: "error",
      status: "failed",
      output: {
        status: response.status,
        detail: errorText,
      },
    });
    trace.finish("failed");

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
    trace.addStep({
      name: "聊天模型响应为空",
      type: "error",
      status: "failed",
      output: {
        status: 502,
        detail: "DeepSeek API returned an empty stream.",
      },
    });
    trace.finish("failed");
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
      let contentText = "";
      let reasoningText = "";

      if (!reader) {
        clearTimeout(timeout);
        trace.addStep({
          name: "聊天模型响应为空",
          type: "error",
          status: "failed",
          output: "DeepSeek API returned an empty stream.",
        });
        trace.finish("failed");
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
              trace.addStep({
                name: "聊天模型流式输出",
                type: "model_response",
                output: {
                  content: contentText,
                  reasoning: reasoningText,
                },
              });
              trace.finish("success");
              controller.enqueue(encodeStreamEvent("done"));
              controller.close();
              return;
            }

            const chunk = JSON.parse(data) as DeepSeekStreamChunk;
            const delta = chunk.choices?.[0]?.delta;
            const reasoning = delta?.reasoning_content;
            const content = delta?.content;

            if (reasoning) {
              reasoningText += reasoning;
              controller.enqueue(encodeStreamEvent("reasoning", reasoning));
            }

            if (content) {
              contentText += content;
              controller.enqueue(encodeStreamEvent("content", content));
            }
          }
        }

        clearTimeout(timeout);
        trace.addStep({
          name: "聊天模型流式输出",
          type: "model_response",
          output: {
            content: contentText,
            reasoning: reasoningText,
          },
        });
        trace.finish("success");
        controller.enqueue(encodeStreamEvent("done"));
        controller.close();
      } catch (error) {
        clearTimeout(timeout);
        trace.addStep({
          name: "聊天模型流式读取失败",
          type: "error",
          status: "failed",
          error,
        });
        trace.finish("failed");
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

async function resolveChatIntent(
  apiKey: string,
  messages: ChatMessage[],
  trace?: AiTraceLogger,
): Promise<ChatIntent> {
  const fallbackIntent = createFallbackChatIntent(messages);

  try {
    const modelMessages: DeepSeekChatMessage[] = [
      {
        role: "system",
        content: [
          "你是 FitMate AI 的聊天意图解析器。",
          "请只返回一个合法 JSON 对象，不要输出 Markdown，不要解释。",
          "你需要判断用户是否在请求具体动作推荐、训练计划、单次动作编排、动作替换或动作讲解。",
          "如果用户只是想看某类动作推荐，不要求组数、次数、休息、训练顺序或计划，type 必须是 exercise_recommendation。",
          "如果用户要求安排成一套单次训练、动作组合、训练流程、组数次数或休息，type 才是 routine。",
          "如果用户说“今天”“这次”“现在”“30分钟”“在家想练某部位”“只有自重/哑铃”等，通常是单次训练需求，type 必须是 routine，workoutIntent.intentType 必须是 routine。",
          "只有用户明确说每周、长期、周期、一个月、计划表、多天安排等，type 才能是 workout_plan，workoutIntent.intentType 才能是 plan。",
          "如果用户只说“今天练什么”“帮我安排一下”这类宽泛请求，缺少目标、时长、器械/场地时，仍可识别为 routine，但后续必须先追问，不要把默认值当成用户已提供的信息。",
          "如果回答中可能需要出现具体动作名，needsExerciseContext 必须为 true。",
          "如果只是饮食、习惯、一般训练原则或非健身话题，needsExerciseContext 为 false。",
          "JSON 字段必须是：type, needsExerciseContext, workoutIntent, requestedExerciseName。",
          "type 只能是 general_fitness_advice、exercise_recommendation、workout_plan、routine、exercise_replacement、exercise_explanation、non_fitness。",
          "workoutIntent 字段在 needsExerciseContext 为 true 时必须给出，字段为 intentType, goal, experience, sessionMinutes, weeklyFrequency, equipment, injuryLimitations, preferences, avoidances。",
          "workoutIntent.intentType 只能是 plan 或 routine；exercise_recommendation 场景使用 routine；experience 只能是 beginner、intermediate、advanced。",
          "信息不足时为了满足 JSON Schema 可以使用占位默认值：goal 使用用户问题的核心目标，experience=beginner，sessionMinutes=30，weeklyFrequency=3，数组字段默认 []。这些默认值只用于结构化解析，不代表可以直接生成训练计划。",
        ].join("\n"),
      },
      ...messages,
    ];

    trace?.addStep({
      name: "意图解析模型请求",
      type: "model_request",
      input: {
        model: "deepseek-v4-flash",
        messages: modelMessages,
        stream: false,
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

    const parsedIntent = chatIntentSchema.safeParse(result.value);

    if (!parsedIntent.success) {
      trace?.addStep({
        name: "意图校验失败，使用兜底意图",
        type: "intent",
        status: "failed",
        output: fallbackIntent,
        error: parsedIntent.error.flatten(),
      });
      console.warn("[chat] intent_validation_failed", {
        detail: parsedIntent.error.flatten(),
        value: result.value,
      });
      return fallbackIntent;
    }

    const data = parsedIntent.data;
    trace?.addStep({
      name: "服务端意图解析结果",
      type: "intent",
      output: data,
    });

    if (data.needsExerciseContext && !data.workoutIntent) {
      return {
        ...data,
        workoutIntent: fallbackIntent.workoutIntent,
      };
    }

    return data;
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

async function buildExerciseContext(
  chatIntent: ChatIntent,
  messages: ChatMessage[],
  trace?: AiTraceLogger,
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

  const exerciseContext = {
    intent,
    providedExercises,
    candidateStatus: candidates.candidateStatus,
    relevantCandidateCount: candidates.relevantCandidateCount,
    requiredRelevantCandidateCount: candidates.requiredRelevantCandidateCount,
    warnings: candidates.warnings,
  };

  trace?.addStep({
    name: "动作库获取与候选筛选",
    type: "exercise_lookup",
    input: {
      intent,
      exerciseCount: exercises.length,
      requestedExerciseName: chatIntent.requestedExerciseName,
    },
    output: {
      context: exerciseContext,
      primaryCandidates: candidates.primaryCandidates.slice(0, 20),
      supplementaryCandidates: candidates.supplementaryCandidates.slice(0, 20),
      excluded: candidates.excluded.slice(0, 40),
    },
    metadata: {
      primaryCandidateCount: candidates.primaryCandidates.length,
      supplementaryCandidateCount: candidates.supplementaryCandidates.length,
      excludedCount: candidates.excluded.length,
    },
  });

  return exerciseContext;
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
    "4. 对 workout_plan 或 routine 场景，自然语言正文只做目标说明和生成说明，不要另写一套和卡片可能冲突的动作清单；具体动作以后台生成的卡片为准。",
    "5. 对 routine 场景，只有用户已明确提供训练目标、单次训练时长、可用器械或训练场地，且没有高风险健康情况时，才输出 workout_routine_trigger；禁止输出 workout_plan_trigger。",
    "6. 对 workout_plan 场景，只有用户明确要长期、每周、多天或周期计划，并已提供训练目标、单次训练时长、可用器械或训练场地，且没有高风险健康情况时，才输出 workout_plan_trigger；否则只追问缺失信息。",
    "7. 对 exercise_recommendation 场景，自然语言正文只做简短说明，不要直接列具体动作；必须输出 exercise_recommendation_trigger，具体动作以推荐卡片为准。",
    "8. 如果输出 Trigger，intent 必须与 serverWorkoutIntent 保持一致。",
    "9. 如果用户有疾病、孕期或其他高风险健康情况，正文必须提醒咨询医生或专业人士，不能做医疗诊断。",
    "10. 如果正文给了用户可直接发送的示例问题或下一步建议问题，必须额外输出 suggested_question_trigger，并把按钮文字放入 suggestedQuestions 字段。",
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
  trace?: AiTraceLogger,
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
    trace?.addStep({
      name: "意图解析模型输出",
      type: "model_response",
      output: {
        content,
      },
      metadata: {
        status: response.status,
      },
    });
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
  const latestUserMessage = getLatestUserMessage(messages);
  const isRecommendation = /推荐|有哪些|动作/.test(latestUserMessage) && !/组|套|流程|安排|计划/.test(latestUserMessage);
  const isRoutine = /今天|这次|现在|来一套|动作组|流程|安排|练|分钟/.test(latestUserMessage);
  const type = isRecommendation
    ? "exercise_recommendation"
    : isRoutine
      ? "routine"
    : "general_fitness_advice";
  const workoutIntent = createFallbackWorkoutIntent(messages, type);

  return {
    type,
    needsExerciseContext: /动作|训练|计划|编排|替换|推荐|练|胸|背|腿|肩|核心|减脂|增肌/.test(
      latestUserMessage,
    ),
    workoutIntent,
  };
}

function createFallbackWorkoutIntent(
  messages: ChatMessage[],
  type: ChatIntent["type"],
): WorkoutPlanIntent {
  const latestUserMessage = getLatestUserMessage(messages);
  const intentType = type === "routine" || type === "exercise_recommendation" ? "routine" : "plan";

  return workoutPlanIntentSchema.parse({
    intentType,
    goal: latestUserMessage.slice(0, 80) || "综合体能提升",
    experience: "beginner",
    sessionMinutes: 30,
    weeklyFrequency: intentType === "routine" ? 1 : 3,
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
