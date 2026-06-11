import "server-only";

import { createAgent, AIMessage, ToolMessage } from "langchain";

import { agentRuntimeConfig } from "@/lib/server/config";

import { createLangChainDeepSeekModel, type LangChainDeepSeekModelFactoryResult } from "./model-factory";
import { buildLangChainAgentSystemPrompt } from "./prompt";
import { createExecutableLangChainTool, type LangChainToolWrapper, type LangChainToolWrapperContext } from "./tool-wrapper";
import {
  getErrorMessage,
  messageContentToText,
  toLangChainJsonValue,
} from "./utils";
import type {
  LangChainAgentMessage,
  LangChainAgentModel,
  LangChainAgentRunFailure,
  LangChainAgentRunResult,
  LangChainAgentRunTraceSummary,
  LangChainAgentRuntimeErrorCode,
  LangChainAgentToolExecution,
} from "./types";

export type RunLangChainAgentRuntimeInput = {
  messages: readonly LangChainAgentMessage[];
  actor: LangChainToolWrapperContext["actor"];
  model?: LangChainAgentModel;
  modelFactory?: () => LangChainDeepSeekModelFactoryResult;
  toolWrappers?: readonly LangChainToolWrapper[];
  systemPrompt?: string;
  signal?: AbortSignal;
};

/** runLangChainAgentRuntime 封装 LangChain agent harness，保留服务端工具校验、预算、错误归一化和 trace 摘要边界。 */
export async function runLangChainAgentRuntime(input: RunLangChainAgentRuntimeInput): Promise<LangChainAgentRunResult> {
  const startedAt = Date.now();
  const config = agentRuntimeConfig.langChain;
  const toolExecutions: LangChainAgentToolExecution[] = [];
  const modelResult = input.model
    ? { ok: true as const, model: input.model, modelName: "injected-test-model", endpoint: "injected" }
    : (input.modelFactory ?? createLangChainDeepSeekModel)();

  if (!modelResult.ok) {
    return createFailure({
      code: modelResult.code,
      message: modelResult.message,
      retryable: false,
      messages: [],
      toolExecutions,
    });
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.runBudget.overallTimeoutMs);
  const abortFromInput = () => abortController.abort();
  input.signal?.addEventListener("abort", abortFromInput);

  try {
    const tools = (input.toolWrappers ?? []).map((wrapper) => createExecutableLangChainTool(
      wrapper,
      {
        actor: input.actor,
        signal: abortController.signal,
      },
      (execution) => toolExecutions.push(execution),
    ));
    const agent = createAgent({
      model: modelResult.model,
      tools,
      systemPrompt: input.systemPrompt ?? buildLangChainAgentSystemPrompt(),
    });
    const state = await agent.invoke({
      messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
    }, {
      recursionLimit: Math.max(2, config.runBudget.maxIterations + 2),
      signal: abortController.signal,
    });
    const messages = Array.isArray(state.messages) ? state.messages : [];
    const generatedMessages = messages.slice(input.messages.length);
    const mergedToolExecutions = mergeToolExecutions(toolExecutions, messages);
    const finalMessage = [...generatedMessages].reverse().find((message) => (
      AIMessage.isInstance(message)
      && (!message.tool_calls || message.tool_calls.length === 0)
      && messageContentToText(message.content).trim().length > 0
    ));

    if (!finalMessage) {
      return createFailure({
        code: "empty_final_message",
        message: "LangChain agent completed without a final assistant text message.",
        retryable: true,
        messages,
        toolExecutions: mergedToolExecutions,
        traceSummary: createTraceSummary({
          startedAt,
          modelName: modelResult.modelName,
          inputMessages: input.messages,
          messages,
          toolExecutions: mergedToolExecutions,
          toolWrappers: input.toolWrappers ?? [],
          finalText: undefined,
        }),
      });
    }

    return {
      ok: true,
      finalText: messageContentToText(finalMessage.content).trim(),
      messages,
      toolExecutions: mergedToolExecutions,
      traceSummary: createTraceSummary({
        startedAt,
        modelName: modelResult.modelName,
        inputMessages: input.messages,
        messages,
        toolExecutions: mergedToolExecutions,
        toolWrappers: input.toolWrappers ?? [],
        finalText: messageContentToText(finalMessage.content).trim(),
      }),
    };
  } catch (error) {
    const normalized = normalizeLangChainRuntimeError(error);

    return createFailure({
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      messages: [],
      toolExecutions,
    });
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abortFromInput);
  }
}

function mergeToolExecutions(
  wrapperExecutions: readonly LangChainAgentToolExecution[],
  messages: readonly unknown[],
): readonly LangChainAgentToolExecution[] {
  const byToolCallId = new Map(wrapperExecutions
    .filter((execution) => execution.toolCallId)
    .map((execution) => [execution.toolCallId, execution]));
  const projected = messages
    .filter((message): message is ToolMessage => ToolMessage.isInstance(message))
    .map((message) => {
      const existing = byToolCallId.get(message.tool_call_id);

      if (existing) {
        return existing;
      }

      const content = messageContentToText(message.content);
      const failureCode = message.status === "error" || isToolMessageErrorContent(content)
        ? classifyToolMessageError(content)
        : undefined;

      return {
        toolCallId: message.tool_call_id,
        toolName: message.name ?? "unknown",
        status: failureCode ? "failed" as const : "succeeded" as const,
        modelVisibleSummary: content,
        traceSummary: toLangChainJsonValue(content, agentRuntimeConfig.langChain.trace.toolResultPreviewMaxLength),
        failureCode,
        failureMessage: failureCode ? content : undefined,
        enteredModelContext: true,
      } satisfies LangChainAgentToolExecution;
    });

  return projected.length > 0 ? projected : wrapperExecutions;
}

function isToolMessageErrorContent(content: string) {
  return content.startsWith("Error invoking tool") || content.startsWith("Error:");
}

function classifyToolMessageError(content: string): LangChainAgentRuntimeErrorCode {
  if (content.includes("is not a valid tool")) {
    return "unknown_tool";
  }

  if (content.includes("Received tool input did not match expected schema") || content.includes("invalid_type")) {
    return "tool_schema_invalid";
  }

  return "tool_handler_failed";
}

function createTraceSummary(input: {
  startedAt: number;
  modelName: string;
  inputMessages: readonly LangChainAgentMessage[];
  messages: readonly unknown[];
  toolExecutions: readonly LangChainAgentToolExecution[];
  toolWrappers: readonly LangChainToolWrapper[];
  finalText?: string;
}): LangChainAgentRunTraceSummary {
  const generatedMessages = input.messages.slice(input.inputMessages.length);

  return {
    runtimeVersion: agentRuntimeConfig.langChain.runtimeVersion,
    model: input.modelName,
    toolNames: input.toolWrappers.map((wrapper) => wrapper.name),
    modelRequestSummary: {
      inputMessageCount: input.inputMessages.length,
      inputMessagePreviews: input.inputMessages.map((message) => ({
        role: message.role,
        contentPreview: message.content.slice(0, agentRuntimeConfig.langChain.trace.modelMessagePreviewMaxLength),
      })),
      toolCount: input.toolWrappers.length,
    },
    modelResponseSummary: {
      generatedMessageCount: generatedMessages.length,
      assistantMessageCount: generatedMessages.filter((message) => AIMessage.isInstance(message)).length,
      toolMessageCount: generatedMessages.filter((message) => ToolMessage.isInstance(message)).length,
      ...(input.finalText
        ? { finalTextPreview: input.finalText.slice(0, agentRuntimeConfig.langChain.trace.modelMessagePreviewMaxLength) }
        : {}),
    },
    providerToolCalls: input.messages
      .filter((message): message is AIMessage => AIMessage.isInstance(message))
      .flatMap((message) => (message.tool_calls ?? []).map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        argsSummary: toLangChainJsonValue(
          toolCall.args,
          agentRuntimeConfig.langChain.trace.toolArgumentsPreviewMaxLength,
        ),
      }))),
    modelCallCount: input.messages.filter((message) => AIMessage.isInstance(message)).length,
    toolCallCount: input.toolExecutions.length,
    messageCount: input.messages.length,
    durationMs: Date.now() - input.startedAt,
  };
}

function normalizeLangChainRuntimeError(error: unknown): { code: LangChainAgentRuntimeErrorCode; message: string; retryable: boolean } {
  const message = getErrorMessage(error);

  if (message.includes("Recursion limit") || message.includes("recursion limit") || message.includes("GraphRecursionError")) {
    return { code: "budget_exhausted", message, retryable: true };
  }

  if (message.includes("abort") || message.includes("AbortError")) {
    return { code: "provider_timeout", message, retryable: true };
  }

  return { code: "provider_error", message, retryable: true };
}

function createFailure(input: {
  code: LangChainAgentRuntimeErrorCode;
  message: string;
  retryable: boolean;
  messages: readonly unknown[];
  toolExecutions: readonly LangChainAgentToolExecution[];
  traceSummary?: LangChainAgentRunTraceSummary;
}): LangChainAgentRunFailure {
  return {
    ok: false,
    code: input.code,
    message: input.message,
    retryable: input.retryable,
    messages: input.messages,
    toolExecutions: input.toolExecutions,
    traceSummary: input.traceSummary,
  };
}
