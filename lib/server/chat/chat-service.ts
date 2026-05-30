import "server-only";

import { z } from "zod";

import { aiPromptConfig } from "@/lib/server/ai/prompt-config";
import { updateConversationSummary } from "@/lib/server/chat/conversation-summary-service";
import {
  formatRecentArtifactSummariesForPrompt,
  type RecentArtifactSummary,
} from "@/lib/server/conversation-artifacts/artifact-service";
import {
  buildReferenceResolutionReply,
  formatReferenceResolutionForPrompt,
  resolveReference,
  shouldAttemptReferenceResolution,
} from "@/lib/server/reference-resolver/reference-resolver-service";
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
import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import { serverRequest } from "@/lib/server/http/server-request";
import {
  selectExerciseCandidates,
  workoutPlanIntentSchema,
  type WorkoutPlanIntent,
} from "@/lib/server/workout-plans";
import type { ReferenceResolution } from "@/lib/shared/reference-resolver/schema";

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

export const chatIntentSchema = z.object({
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
  canTriggerAction: z.boolean().default(false),
  missingActionFields: z.array(z.string().trim().min(1)).max(12).default([]),
  suggestedReplies: z.array(z.string().trim().min(1).max(120)).max(3).default([]),
  suggestedQuestions: z.array(z.string().trim().min(1).max(120)).max(3).default([]),
}).transform(({ suggestedQuestions, ...data }) => ({
  ...data,
  suggestedReplies: data.suggestedReplies.length > 0 ? data.suggestedReplies : suggestedQuestions,
}));

export type ChatIntent = z.infer<typeof chatIntentSchema>;

export const chatRequestSchema = z.object({
  conversationId: z.string().trim().min(1).max(120).optional(),
  latestUserMessage: z.string().trim().min(1).max(4000),
  conversationSummary: z.string().trim().max(2000).default(""),
  messages: z.array(aiContextChatMessageSchema).min(1).max(200).optional(),
  conversationContext: fitnessConversationContextSchema.optional(),
  thinkingEnabled: z.boolean().optional(),
});

export type AiChatRequest = z.infer<typeof chatRequestSchema>;

export type PreparedAiChatRequest = {
  conversationId?: string;
  rawMessages: ChatMessage[];
  messages: ChatMessage[];
  conversationSummaryContext: ConversationSummaryContext;
  internalConversationContext: FitnessConversationContext;
  recentArtifactSummaries: RecentArtifactSummary[];
  thinkingEnabled: boolean;
  hasClientConversationSummary: boolean;
};

export type AssistantAction = {
  action: "exercise_recommendation" | "workout_routine" | "workout_plan";
  intent: WorkoutPlanIntent;
  referenceResolution?: Extract<ReferenceResolution, { status: "resolved" }>;
};

export type ExerciseContext = {
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
      recentArtifactSummaries,
      aiContextMessages: messages,
      thinkingEnabled,
    },
  });

  const chatIntent = await resolveChatIntent(
    apiKey,
    messages,
    conversationSummaryContext,
    internalConversationContext,
    recentArtifactSummaries,
    trace,
  );
  const referenceResolution = shouldAttemptReferenceResolution(
    conversationSummaryContext.latestUserMessage,
    chatIntent.type,
  )
    ? await resolveReference({
        latestUserMessage: conversationSummaryContext.latestUserMessage,
        sessionId: request.conversationId,
        recentArtifacts: recentArtifactSummaries,
        intentType: chatIntent.type,
      })
    : null;

  trace.addStep({
    name: "引用解析结果",
    type: "candidate_selection",
    output: referenceResolution,
    metadata: {
      skipped: !referenceResolution,
    },
  });

  if (referenceResolution?.status === "ambiguous" || referenceResolution?.status === "not_found") {
    return createDeterministicChatResponse({
      apiKey,
      trace,
      conversationSummaryContext,
      assistantReply: buildReferenceResolutionReply(referenceResolution),
      internalActionSummary: JSON.stringify({ referenceResolution }),
    });
  }

  const exerciseContext = chatIntent.needsExerciseContext
    ? await buildExerciseContext(chatIntent, messages, internalConversationContext, trace)
    : null;
  const assistantAction = resolveAssistantAction(
    chatIntent,
    exerciseContext,
    referenceResolution?.status === "resolved" ? referenceResolution : undefined,
  );
  const visibleSuggestedReplies = resolveVisibleSuggestedReplies(chatIntent, assistantAction);
  trace.addStep({
    name: "服务端内部动作事件",
    type: "intent",
    status: "success",
    output: {
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
    },
  });
  const systemPrompt = buildSystemPrompt(
    chatIntent,
    exerciseContext,
    conversationSummaryContext,
    assistantAction,
    recentArtifactSummaries,
    referenceResolution,
  );
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
      intent: chatIntent.type,
      exerciseContextCount: exerciseContext?.providedExercises.length ?? 0,
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
    trace.finish("failed");
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
    trace.finish("failed");

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
    trace.finish("failed");
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
          encodeChatStreamEvent("assistant_action", "", {
            action: assistantAction.action,
            intent: assistantAction.intent,
            referenceResolution: assistantAction.referenceResolution,
          }),
        );
      }

      if (visibleSuggestedReplies.length > 0) {
        controller.enqueue(
          encodeChatStreamEvent("suggested_replies", "", {
            suggestedReplies: visibleSuggestedReplies,
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
        trace.finish("failed");
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
                internalActionSummary: summarizeAssistantAction(assistantAction),
                trace,
              });
              trace.finish("success");
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
          internalActionSummary: summarizeAssistantAction(assistantAction),
          trace,
        });
        trace.finish("success");
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
        trace.finish("failed");
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
      controller.enqueue(encodeChatStreamEvent("content", input.assistantReply));

      const summaryUpdate = await updateConversationSummary({
        apiKey: input.apiKey,
        previousSummary: input.conversationSummaryContext.summary,
        latestUserMessage: input.conversationSummaryContext.latestUserMessage,
        assistantReply: input.assistantReply,
        internalActionSummary: input.internalActionSummary,
        trace: input.trace,
      });
      input.trace.finish("success");
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

  try {
    const modelMessages: DeepSeekChatMessage[] = [
      {
        role: "system",
        content: [aiPromptConfig.chatIntentResolution.system, contextPrompt, artifactPrompt]
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
      name: "意图判断结构化结果",
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
  conversationContext: FitnessConversationContext,
  trace?: AiTraceLogger,
): Promise<ExerciseContext> {
  const exercises = await listAllExercises();
  const intent =
    chatIntent.workoutIntent ??
    conversationContext.currentIntent ??
    createFallbackWorkoutIntent(messages, chatIntent.type, conversationContext);
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
      equipmentZh: exercise.equipmentZh ?? "未标注器械",
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
      equipmentZh: candidate.exercise.equipmentZh ?? "未标注器械",
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

// 服务端兜底触发边界：动作推荐只要求目标明确，训练编排和长期计划继续检查关键字段。
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

function summarizeAssistantAction(assistantAction: AssistantAction | null) {
  if (!assistantAction) {
    return "";
  }

  return JSON.stringify({
    action: assistantAction.action,
    intent: assistantAction.intent,
    referenceResolution: assistantAction.referenceResolution,
  });
}

function buildSystemPrompt(
  chatIntent: ChatIntent,
  exerciseContext: ExerciseContext | null,
  conversationSummaryContext: ConversationSummaryContext,
  assistantAction: AssistantAction | null,
  recentArtifactSummaries: RecentArtifactSummary[],
  referenceResolution: ReferenceResolution | null = null,
) {
  const contextPrompt = formatConversationSummaryContextForPrompt(conversationSummaryContext);
  const artifactPrompt = formatRecentArtifactSummariesForPrompt(recentArtifactSummaries);
  const referencePrompt = formatReferenceResolutionForPrompt(referenceResolution);

  if (!exerciseContext) {
    return [aiPromptConfig.chatCompletion.system, contextPrompt, artifactPrompt, referencePrompt].filter(Boolean).join("\n\n");
  }

  return [
    aiPromptConfig.chatCompletion.system,
    contextPrompt,
    "",
    artifactPrompt,
    "",
    referencePrompt,
    "",
    aiPromptConfig.chatCompletion.exerciseContext,
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
      `${latestUserMessage} ${conversationSummary}`,
    ),
    workoutIntent:
      isRecommendationRefresh && conversationContext.currentIntent
        ? conversationContext.currentIntent
        : conversationContext.currentIntent ?? workoutIntent,
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
    weeklyFrequency: knownFacts?.weeklyFrequency ?? (intentType === "routine" ? 1 : 3),
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
