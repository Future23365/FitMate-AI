import "server-only";

import { z } from "zod";

import { aiPromptConfig, buildPromptFromModules } from "@/lib/server/ai/prompt-config";
import {
  createCandidateTrimSummary,
  createChatTokenBudgetDecision,
  getStageDecision,
  shouldSkipConversationSummaryUpdate,
  type AiPromptModuleId,
  type AiTokenBudgetDecision,
  type CandidateTrimSummary,
} from "@/lib/server/ai/token-budget";
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
import { listAllExercises } from "@/lib/server/exercises/exercise-service";
import { serverRequest } from "@/lib/server/http/server-request";
import {
  buildConversationMemoryState,
  formatMemoryStateForPrompt,
  mergeMemoryStateIntoWorkoutIntent,
  recordUserFeedbackFromChat,
} from "@/lib/server/user-feedback-memory/user-feedback-memory-service";
import {
  selectExerciseCandidates,
  workoutPlanIntentSchema,
  type WorkoutPlanIntent,
} from "@/lib/server/workout-plans";
import type { ReferenceResolution } from "@/lib/shared/reference-resolver/schema";
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
    matchingReasons?: string[];
    necessaryRestrictions?: string[];
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

  const chatIntent = await resolveChatIntent(
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
        tokenBudgetDecision,
      });
    }
  }

  const exerciseContext = chatIntent.needsExerciseContext
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
      internalActionSummary: summarizeAssistantAction(assistantAction),
    }),
  });
  traceTokenBudgetDecision(trace, tokenBudgetDecision);

  const systemPrompt = buildSystemPrompt(
    chatIntent,
    exerciseContext,
    conversationSummaryContext,
    assistantAction,
    recentArtifactSummaries,
    referenceResolution,
    memoryState,
    tokenBudgetDecision,
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
                internalActionSummary: summarizeAssistantAction(assistantAction),
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

  if (isLongTermPlanMessage(latestUserMessage)) {
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
      missingActionFields: input.chatIntent.missingActionFields.filter(
        (field) => !isPlanDefaultableMissingField(field, workoutIntent),
      ),
      suggestedReplies: [],
    };
  }

  if (hasPriorTrainingContext && isContextualWorkoutAdjustment(latestUserMessage)) {
    const intentType = inferContextualIntentType(latestUserMessage, input.chatIntent, contextualIntent);
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
      necessaryRestrictions: exercise.riskTags,
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
      matchingReasons: candidate.reasons.slice(0, 4),
      necessaryRestrictions: candidate.exercise.riskTags,
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
    necessaryRestrictions: exercise.necessaryRestrictions ?? [],
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

function buildSystemPrompt(
  chatIntent: ChatIntent,
  exerciseContext: ExerciseContext | null,
  conversationSummaryContext: ConversationSummaryContext,
  assistantAction: AssistantAction | null,
  recentArtifactSummaries: RecentArtifactSummary[],
  referenceResolution: ReferenceResolution | null = null,
  memoryState: ConversationMemoryState | null = null,
  tokenBudgetDecision?: AiTokenBudgetDecision,
) {
  const contextPrompt = formatConversationSummaryContextForPrompt(conversationSummaryContext);
  const artifactPrompt = formatRecentArtifactSummariesForPrompt(recentArtifactSummaries);
  const referencePrompt = formatReferenceResolutionForPrompt(referenceResolution);
  const memoryPrompt = formatMemoryStateForPrompt(memoryState);
  const promptModules = getStageDecision(tokenBudgetDecision, "chat_final_response")?.promptModules;
  const basePrompt = promptModules?.length
    ? buildPromptFromModules(promptModules)
    : aiPromptConfig.chatCompletion.system;

  if (!exerciseContext) {
    return [basePrompt, contextPrompt, artifactPrompt, referencePrompt, memoryPrompt].filter(Boolean).join("\n\n");
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
  return /不喜欢|讨厌|不想做|别安排|不要安排|太难|太轻松|做不了|吃力|今天不想|今天不要|这次不想|疼|痛|不舒服|不适|拉伤|扭伤|以后都不要|再也不要/.test(
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
  return (
    input.conversationContext.currentIntent ??
    input.chatIntent.workoutIntent ??
    buildWorkoutIntentFromRecentArtifact(input.recentArtifactSummaries?.[0]) ??
    input.fallbackIntent.workoutIntent
  );
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

function inferContextualIntentType(
  message: string,
  chatIntent: ChatIntent,
  contextualIntent: WorkoutPlanIntent | undefined,
): WorkoutPlanIntent["intentType"] {
  if (isLongTermPlanMessage(message) || chatIntent.type === "workout_plan" || contextualIntent?.intentType === "plan") {
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
