import "server-only";

import { createAgent, createMiddleware, AIMessage, ToolMessage } from "langchain";
import type { ModelRequest } from "langchain";

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
  LangChainAgentModelCallTrace,
  LangChainAgentModel,
  LangChainAgentProviderToolCallTrace,
  LangChainAgentRunFailure,
  LangChainAgentRunResult,
  LangChainAgentRunTraceSummary,
  LangChainAgentRuntimeErrorCode,
  LangChainAgentToolExecution,
  LangChainTokenUsage,
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

  const toolWrappers = input.toolWrappers ?? [];
  const modelCallRecorder = createLangChainModelCallTraceRecorder({ toolWrappers });
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.runBudget.overallTimeoutMs);
  const abortFromInput = () => abortController.abort();
  input.signal?.addEventListener("abort", abortFromInput);

  try {
    const toolExecutionBudget = createToolExecutionBudget(config.runBudget.maxToolCalls);
    const tools = toolWrappers.map((wrapper) => createExecutableLangChainTool(
      wrapper,
      {
        actor: input.actor,
        signal: abortController.signal,
      },
      (execution) => toolExecutions.push(execution),
      toolExecutionBudget,
    ));
    const agent = createAgent({
      model: modelResult.model,
      tools,
      systemPrompt: input.systemPrompt ?? buildLangChainAgentSystemPrompt(),
      middleware: [modelCallRecorder.middleware],
    });
    const state = await agent.invoke({
      messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
    }, {
      recursionLimit: Math.max(2, config.runBudget.maxIterations + 2),
      signal: abortController.signal,
    });
    const messages = Array.isArray(state.messages) ? state.messages : [];
    const generatedMessages = messages.slice(input.messages.length);
    const mergedToolExecutions = annotateToolExecutionsWithModelCalls(
      mergeToolExecutions(toolExecutions, messages),
      modelCallRecorder.modelCalls,
    );
    const budgetFailure = mergedToolExecutions.find((execution) => execution.failureCode === "budget_exhausted");

    if (budgetFailure) {
      return createFailure({
        code: "budget_exhausted",
        message: "LangChain agent exceeded the configured tool call budget.",
        retryable: true,
        messages,
        toolExecutions: mergedToolExecutions,
        traceSummary: createTraceSummary({
          startedAt,
          modelName: modelResult.modelName,
          inputMessages: input.messages,
          messages,
          toolExecutions: mergedToolExecutions,
          toolWrappers,
          modelCalls: modelCallRecorder.modelCalls,
          finalText: undefined,
        }),
      });
    }

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
          toolWrappers,
          modelCalls: modelCallRecorder.modelCalls,
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
        toolWrappers,
        modelCalls: modelCallRecorder.modelCalls,
        finalText: messageContentToText(finalMessage.content).trim(),
      }),
    };
  } catch (error) {
    const normalized = normalizeLangChainRuntimeError(error);
    const linkedToolExecutions = annotateToolExecutionsWithModelCalls(
      toolExecutions,
      modelCallRecorder.modelCalls,
    );

    return createFailure({
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      messages: [],
      toolExecutions: linkedToolExecutions,
      traceSummary: createTraceSummary({
        startedAt,
        modelName: modelResult.modelName,
        inputMessages: input.messages,
        messages: [],
        toolExecutions: linkedToolExecutions,
        toolWrappers,
        modelCalls: modelCallRecorder.modelCalls,
        finalText: undefined,
      }),
    });
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abortFromInput);
  }
}

function createToolExecutionBudget(maxToolCalls: number) {
  let reservedToolCalls = 0;

  return {
    reserveToolCall: () => {
      reservedToolCalls += 1;
      return reservedToolCalls <= maxToolCalls;
    },
  };
}

function createLangChainModelCallTraceRecorder(input: {
  toolWrappers: readonly LangChainToolWrapper[];
}) {
  const modelCalls: LangChainAgentModelCallTrace[] = [];
  let modelCallIndex = 0;

  return {
    modelCalls,
    // middleware 是 LangChain runtime 的观测入口，用框架级 hook 记录每次真实 provider model call。
    middleware: createMiddleware({
      name: "FitMateLangChainTraceMiddleware",
      wrapModelCall: async (request, handler) => {
        const currentModelCallIndex = modelCallIndex + 1;
        modelCallIndex = currentModelCallIndex;
        const startedAt = Date.now();
        const requestSummary = summarizeLangChainModelRequest(request, input.toolWrappers);

        try {
          const response = await handler(request);
          const providerToolCalls = readAIMessageProviderToolCalls(response, currentModelCallIndex);

          modelCalls.push({
            modelCallIndex: currentModelCallIndex,
            runtimeStep: currentModelCallIndex,
            status: "success",
            durationMs: Date.now() - startedAt,
            requestSummary,
            responseSummary: summarizeLangChainModelResponse(response),
            providerToolCalls,
            tokenUsage: readAIMessageTokenUsage(response),
          });

          return response;
        } catch (error) {
          const normalized = normalizeLangChainRuntimeError(error);

          modelCalls.push({
            modelCallIndex: currentModelCallIndex,
            runtimeStep: currentModelCallIndex,
            status: "failed",
            durationMs: Date.now() - startedAt,
            requestSummary,
            providerToolCalls: [],
            failureCode: normalized.code,
            failureMessage: normalized.message,
          });

          throw error;
        }
      },
    }),
  };
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

function annotateToolExecutionsWithModelCalls(
  executions: readonly LangChainAgentToolExecution[],
  modelCalls: readonly LangChainAgentModelCallTrace[],
): readonly LangChainAgentToolExecution[] {
  const linkageByToolCallId = new Map<string, { modelCallIndex: number; runtimeStep: number }>();

  for (const modelCall of modelCalls) {
    for (const toolCall of modelCall.providerToolCalls) {
      if (!toolCall.id) {
        continue;
      }

      linkageByToolCallId.set(toolCall.id, {
        modelCallIndex: toolCall.modelCallIndex ?? modelCall.modelCallIndex,
        runtimeStep: toolCall.runtimeStep ?? modelCall.runtimeStep,
      });
    }
  }

  return executions.map((execution, index) => {
    const linkage = execution.toolCallId ? linkageByToolCallId.get(execution.toolCallId) : undefined;

    return {
      ...execution,
      sequence: execution.sequence ?? index + 1,
      modelCallIndex: execution.modelCallIndex ?? linkage?.modelCallIndex,
      runtimeStep: execution.runtimeStep ?? linkage?.runtimeStep,
    };
  });
}

function summarizeLangChainModelRequest(
  request: ModelRequest<Record<string, unknown>, unknown>,
  toolWrappers: readonly LangChainToolWrapper[],
): LangChainAgentModelCallTrace["requestSummary"] {
  const messagePreviews = request.messages.map((message) => ({
    role: readLangChainMessageRole(message),
    contentPreview: messageContentToText(message.content).slice(
      0,
      agentRuntimeConfig.langChain.trace.modelMessagePreviewMaxLength,
    ),
  }));
  const requestToolNames = request.tools
    .map((tool) => readStringFromRecord(readRecord(tool), "name"))
    .filter((toolName): toolName is string => Boolean(toolName));
  const fallbackToolNames = toolWrappers.map((wrapper) => wrapper.name);
  const toolNames = requestToolNames.length > 0 ? requestToolNames : fallbackToolNames;

  return {
    messageCount: request.messages.length,
    messagePreviews,
    toolCount: toolNames.length,
    toolNames,
  };
}

function summarizeLangChainModelResponse(response: AIMessage): LangChainAgentModelCallTrace["responseSummary"] {
  const content = messageContentToText(response.content);
  const responseMetadata = readRecord(response.response_metadata);

  return {
    contentPreview: content.slice(0, agentRuntimeConfig.langChain.trace.modelMessagePreviewMaxLength),
    contentLength: content.length,
    finishReason: readStringFromRecord(responseMetadata, "finish_reason")
      ?? readStringFromRecord(responseMetadata, "finishReason"),
  };
}

function readAIMessageProviderToolCalls(
  response: AIMessage,
  modelCallIndex: number,
): readonly LangChainAgentProviderToolCallTrace[] {
  return (response.tool_calls ?? []).map((toolCall) => ({
    id: toolCall.id,
    name: toolCall.name,
    argsSummary: toLangChainJsonValue(
      toolCall.args,
      agentRuntimeConfig.langChain.trace.toolArgumentsPreviewMaxLength,
    ),
    modelCallIndex,
    runtimeStep: modelCallIndex,
  }));
}

function readAIMessageTokenUsage(response: AIMessage): LangChainTokenUsage | undefined {
  const usageMetadata = readTokenUsageFromRecord(readRecord(response.usage_metadata));

  if (usageMetadata) {
    return usageMetadata;
  }

  const responseMetadata = readRecord(response.response_metadata);
  const camelTokenUsage = readRecord(responseMetadata.tokenUsage);
  const snakeTokenUsage = readRecord(responseMetadata.token_usage);

  return readTokenUsageFromRecord(camelTokenUsage)
    ?? readTokenUsageFromRecord(snakeTokenUsage);
}

function readTokenUsageFromRecord(record: Record<string, unknown>): LangChainTokenUsage | undefined {
  const promptTokens = readFiniteNumber(record.input_tokens)
    ?? readFiniteNumber(record.prompt_tokens)
    ?? readFiniteNumber(record.promptTokens);
  const completionTokens = readFiniteNumber(record.output_tokens)
    ?? readFiniteNumber(record.completion_tokens)
    ?? readFiniteNumber(record.completionTokens);
  const totalTokens = readFiniteNumber(record.total_tokens)
    ?? readFiniteNumber(record.totalTokens);

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

function readLangChainMessageRole(message: unknown) {
  if (AIMessage.isInstance(message)) {
    return "assistant";
  }

  if (ToolMessage.isInstance(message)) {
    return "tool";
  }

  const record = readRecord(message);
  const directRole = readStringFromRecord(record, "role");

  if (directRole) {
    return directRole;
  }

  const directType = readStringFromRecord(record, "type");

  if (directType) {
    return directType;
  }

  const getType = record._getType;

  return typeof getType === "function" ? String(getType.call(message)) : "unknown";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function readStringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" ? value : undefined;
}

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
  modelCalls: readonly LangChainAgentModelCallTrace[];
  finalText?: string;
}): LangChainAgentRunTraceSummary {
  const generatedMessages = input.messages.slice(input.inputMessages.length);
  const providerToolCalls = input.modelCalls.flatMap((modelCall) => modelCall.providerToolCalls);

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
    modelCalls: input.modelCalls,
    providerToolCalls,
    modelCallCount: input.modelCalls.length,
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
