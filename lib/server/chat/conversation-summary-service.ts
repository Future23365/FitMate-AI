import "server-only";

import { z } from "zod";

import { aiPromptConfig } from "@/lib/server/ai/prompt-config";
import {
  getStageDecision,
  shouldSkipConversationSummaryUpdate,
  type AiTokenBudgetDecision,
} from "@/lib/server/ai/token-budget";
import type { AiTraceLogger } from "@/lib/server/dev/ai-trace-logger";
import { serverRequest } from "@/lib/server/http/server-request";
import { conversationSummaryContextSchema } from "@/lib/shared/chat/fitness-conversation-context";

type SummaryUpdateInput = {
  apiKey: string;
  previousSummary: string;
  latestUserMessage: string;
  assistantReply: string;
  internalActionSummary?: string;
  tokenBudgetDecision?: AiTokenBudgetDecision;
  trace?: AiTraceLogger;
};

type DeepSeekSummaryResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

const model = "deepseek-v4-flash";
const requestTimeoutMs = 12_000;

const summaryModelOutputSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
});

// Summary 更新是聊天长上下文的服务端边界；失败时必须兜底，不能影响用户可见回复。
export async function updateConversationSummary(input: SummaryUpdateInput) {
  const payload = {
    previousSummary: input.previousSummary,
    latestUserMessage: input.latestUserMessage,
    assistantReply: input.assistantReply,
    internalActionSummary: input.internalActionSummary ?? "",
  };
  const budgetStage = getStageDecision(input.tokenBudgetDecision, "conversation_summary_update");
  const skipReason = budgetStage?.skipReason ?? shouldSkipConversationSummaryUpdate(input);

  if (skipReason) {
    input.trace?.addStep({
      name: "聊天上下文总结更新跳过",
      type: "token_budget",
      input: payload,
      output: {
        summary: input.previousSummary,
        source: "skipped",
        skipReason,
      },
      metadata: {
        aiStage: "conversation_summary_update",
        aiStageStatus: "skipped",
        skipReason,
        promptModules: budgetStage?.promptModules ?? [],
      },
    });

    return {
      summary: input.previousSummary,
      source: "skipped" as const,
      skipReason,
    };
  }

  const fallbackSummary = buildFallbackConversationSummary(input);

  try {
    const result = await requestSummaryModel(input.apiKey, payload, input.trace, input.tokenBudgetDecision);

    if (!result.ok) {
      input.trace?.addStep({
        name: "聊天上下文总结更新失败，使用确定性兜底",
        type: "error",
        status: "failed",
        input: payload,
        output: { summary: fallbackSummary },
        error: result,
      });

      return {
        summary: fallbackSummary,
        source: "fallback" as const,
        error: result,
      };
    }

    input.trace?.addStep({
      name: "聊天上下文总结更新结果",
      type: "model_response",
      status: "success",
      input: payload,
      output: { summary: result.summary },
      metadata: result.metadata,
    });

    return {
      summary: result.summary,
      source: "model" as const,
    };
  } catch (error) {
    input.trace?.addStep({
      name: "聊天上下文总结更新异常，使用确定性兜底",
      type: "error",
      status: "failed",
      input: payload,
      output: { summary: fallbackSummary },
      error,
    });

    return {
      summary: fallbackSummary,
      source: "fallback" as const,
      error,
    };
  }
}

export function buildFallbackConversationSummary(input: {
  previousSummary?: string;
  latestUserMessage: string;
  assistantReply?: string;
  internalActionSummary?: string;
}) {
  const lines = [
    input.previousSummary?.trim(),
    input.latestUserMessage.trim() ? `最近用户消息：${input.latestUserMessage.trim()}` : "",
    input.assistantReply?.trim() ? `最近助手回复：${input.assistantReply.trim()}` : "",
    input.internalActionSummary?.trim() ? `服务端内部动作：${input.internalActionSummary.trim()}` : "",
  ].filter(Boolean);
  const summary = lines.join("\n");

  return conversationSummaryContextSchema.shape.summary.parse(truncateText(summary, 2000));
}

async function requestSummaryModel(
  apiKey: string,
  payload: {
    previousSummary: string;
    latestUserMessage: string;
    assistantReply: string;
    internalActionSummary: string;
  },
  trace?: AiTraceLogger,
  tokenBudgetDecision?: AiTokenBudgetDecision,
):
  Promise<
    | { ok: true; summary: string; metadata: Record<string, unknown> }
    | { ok: false; code: "ai_request_failed" | "empty_content" | "invalid_json" | "invalid_ai_output"; message: string; detail?: unknown }
  > {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const budgetStage = getStageDecision(tokenBudgetDecision, "conversation_summary_update");
  const messages = [
    {
      role: "system" as const,
      content: aiPromptConfig.chatContextSummarization.system,
    },
    {
      role: "user" as const,
      content: JSON.stringify(payload),
    },
  ];

  trace?.addStep({
    name: "聊天上下文总结更新请求",
    type: "model_request",
    input: {
      model,
      messages,
      stream: false,
      response_format: {
        type: "json_object",
      },
    },
    metadata: {
      aiStage: "conversation_summary_update",
      aiStageStatus: "executed",
      promptModules: budgetStage?.promptModules ?? ["conversation_summary_update"],
      timeoutMs: requestTimeoutMs,
      previousSummaryLength: payload.previousSummary.length,
      latestUserMessageLength: payload.latestUserMessage.length,
      assistantReplyLength: payload.assistantReply.length,
    },
  });

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
        model,
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
        message: "DeepSeek summary request failed.",
        detail: await response.text(),
      };
    }

    const data = (await response.json()) as DeepSeekSummaryResponse;
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return {
        ok: false,
        code: "empty_content",
        message: "DeepSeek summary request returned empty content.",
      };
    }

    const parsedJson = parseJsonObject(content);

    if (!parsedJson.ok) {
      return parsedJson;
    }

    const parsedSummary = summaryModelOutputSchema.safeParse(parsedJson.value);

    if (!parsedSummary.success) {
      return {
        ok: false,
        code: "invalid_ai_output",
        message: "AI summary output validation failed.",
        detail: parsedSummary.error.flatten(),
      };
    }

    return {
      ok: true,
      summary: parsedSummary.data.summary,
      metadata: {
        status: response.status,
        tokenUsage: data.usage,
      },
    };
  } catch (error) {
    return {
      ok: false,
      code: "ai_request_failed",
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "DeepSeek summary request timed out."
          : "DeepSeek summary request failed.",
      detail: error instanceof Error ? error.message : error,
    };
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
    return { ok: true, value: JSON.parse(jsonText) };
  } catch (error) {
    return {
      ok: false,
      code: "invalid_json",
      message: "AI returned invalid JSON.",
      detail: error instanceof Error ? error.message : error,
    };
  }
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s{3,}/g, "\n\n");

  return normalized.length > maxLength ? normalized.slice(-maxLength) : normalized;
}
