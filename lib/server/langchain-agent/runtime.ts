import "server-only";

import { createAgent, createMiddleware, AIMessage, ToolMessage, toolStrategy } from "langchain";
import type { ModelRequest } from "langchain";

import { agentRuntimeConfig, type AgentRuntimeConfig } from "@/lib/server/config";

import { createLangChainDeepSeekModel, type LangChainDeepSeekModelFactoryResult } from "./model-factory";
import { buildLangChainAgentSystemPrompt } from "./prompt";
import {
  langChainFinalResponseJsonSchema,
  langChainFinalResponseToolName,
  parseLangChainFinalResponse,
} from "./final-response-schema";
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
  LangChainAgentRuntimeObserverEvent,
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
  onRuntimeEvent?: (event: LangChainAgentRuntimeObserverEvent) => void | Promise<void>;
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
  const modelCallRecorder = createLangChainModelCallTraceRecorder({
    toolWrappers,
    maxModelCalls: config.runBudget.maxModelCalls,
    onRuntimeEvent: input.onRuntimeEvent,
  });
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), config.runBudget.overallTimeoutMs);
  const abortFromInput = () => abortController.abort();
  input.signal?.addEventListener("abort", abortFromInput);

  try {
    const toolExecutionBudget = createToolExecutionBudget({
      maxBusinessToolCalls: config.runBudget.maxToolCalls,
      maxActivityReports: config.runBudget.maxActivityReports,
    });
    const tools = toolWrappers.map((wrapper) => createExecutableLangChainTool(
      wrapper,
      {
        actor: input.actor,
        signal: abortController.signal,
      },
      async (execution) => {
        toolExecutions.push(execution);
        await emitLangChainRuntimeObserverEvent({
          execution,
          modelCalls: modelCallRecorder.modelCalls,
          onRuntimeEvent: input.onRuntimeEvent,
        });
      },
      toolExecutionBudget,
    ));
    const agent = createAgent({
      model: modelResult.model,
      tools,
      // 显式使用 toolStrategy，避免 DeepSeek provider profile 把裸 JSON Schema 映射成当前不兼容的 response_format。
      responseFormat: toolStrategy(langChainFinalResponseJsonSchema, {
        toolMessageContent: "结构化最终回答已接收。",
      }),
      systemPrompt: input.systemPrompt ?? buildLangChainAgentSystemPrompt(),
      middleware: [modelCallRecorder.middleware],
    });
    const state = await agent.invoke({
      messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
    }, {
      recursionLimit: resolveLangChainGraphRecursionLimit(config.runBudget),
      signal: abortController.signal,
    });
    const messages = Array.isArray(state.messages) ? state.messages : [];
    const generatedMessages = messages.slice(input.messages.length);
    const mergedToolExecutions = annotateToolExecutionsWithModelCalls(
      mergeToolExecutions(toolExecutions, messages),
      modelCallRecorder.modelCalls,
    );
    const budgetFailure = mergedToolExecutions.find((execution) => (
      execution.failureCode === "budget_exhausted" && execution.executionKind !== "activity"
    ));

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

    const structuredFinalResponse = parseLangChainFinalResponse(readStructuredResponseFromState(state));

    if (!structuredFinalResponse.success) {
      return createFailure({
        code: "structured_output_validation_failed",
        message: "LangChain agent completed without a valid structured final response.",
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
      finalText: structuredFinalResponse.data.content,
      suggestedQuestions: structuredFinalResponse.data.suggestedQuestions,
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
        finalText: structuredFinalResponse.data.content,
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

/** resolveLangChainGraphRecursionLimit 将模型调用预算映射为 LangChain graph step 上限，避免旧 iteration 语义与 LangGraph 计数脱节。 */
export function resolveLangChainGraphRecursionLimit(
  runBudget: Pick<AgentRuntimeConfig["langChain"]["runBudget"], "maxModelCalls">,
) {
  return Math.max(2, (runBudget.maxModelCalls * 2) + 1);
}

function createToolExecutionBudget(input: {
  maxBusinessToolCalls: number;
  maxActivityReports: number;
}) {
  let reservedBusinessToolCalls = 0;
  let reservedActivityReports = 0;

  return {
    reserveToolCall: (wrapper: LangChainToolWrapper) => {
      if (wrapper.executionKind === "activity") {
        reservedActivityReports += 1;
        return reservedActivityReports <= input.maxActivityReports;
      }

      reservedBusinessToolCalls += 1;
      return reservedBusinessToolCalls <= input.maxBusinessToolCalls;
    },
  };
}

async function emitLangChainRuntimeObserverEvent(input: {
  execution: LangChainAgentToolExecution;
  modelCalls: readonly LangChainAgentModelCallTrace[];
  onRuntimeEvent?: (event: LangChainAgentRuntimeObserverEvent) => void | Promise<void>;
}) {
  if (!input.onRuntimeEvent || input.execution.toolName !== "reportAgentActivity" || input.execution.status !== "succeeded") {
    return;
  }

  const activityProjection = readAgentActivityUserProjection(input.execution.userProjection);

  if (!activityProjection?.summary) {
    return;
  }

  const linkage = findToolCallModelLinkage(input.execution.toolCallId, input.modelCalls);

  await emitRuntimeObserverSafely(input.onRuntimeEvent, {
    type: "model_activity_reported",
    summary: activityProjection.summary,
    ...(activityProjection.stepType ? { stepType: activityProjection.stepType } : {}),
    ...(input.execution.toolCallId ? { toolCallId: input.execution.toolCallId } : {}),
    ...(linkage?.modelCallIndex ? { modelCallIndex: linkage.modelCallIndex } : {}),
    ...(linkage?.runtimeStep ? { runtimeStep: linkage.runtimeStep } : {}),
  });
}

async function emitRuntimeObserverSafely(
  onRuntimeEvent: ((event: LangChainAgentRuntimeObserverEvent) => void | Promise<void>) | undefined,
  event: LangChainAgentRuntimeObserverEvent,
) {
  if (!onRuntimeEvent) {
    return;
  }

  try {
    await onRuntimeEvent(event);
  } catch {
    // Runtime observer 只服务 request-local UI / trace，失败不能改变模型调用或 tool 执行结果。
  }
}

function readAgentActivityUserProjection(value: unknown) {
  const record = readRecord(value);
  const summary = readStringFromRecord(record, "activitySummary");
  const stepType = readStringFromRecord(record, "stepType");

  return summary
    ? {
        summary,
        ...(stepType ? { stepType } : {}),
      }
    : undefined;
}

function findToolCallModelLinkage(
  toolCallId: string | undefined,
  modelCalls: readonly LangChainAgentModelCallTrace[],
) {
  if (!toolCallId) {
    return undefined;
  }

  for (const modelCall of modelCalls) {
    const providerToolCall = modelCall.providerToolCalls.find((toolCall) => toolCall.id === toolCallId);

    if (providerToolCall) {
      return {
        modelCallIndex: providerToolCall.modelCallIndex ?? modelCall.modelCallIndex,
        runtimeStep: providerToolCall.runtimeStep ?? modelCall.runtimeStep,
      };
    }
  }

  return undefined;
}

function createLangChainModelCallTraceRecorder(input: {
  toolWrappers: readonly LangChainToolWrapper[];
  maxModelCalls: number;
  onRuntimeEvent?: (event: LangChainAgentRuntimeObserverEvent) => void | Promise<void>;
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
        const requestSummary = summarizeLangChainModelRequest(request, input.toolWrappers);

        if (currentModelCallIndex > input.maxModelCalls) {
          throw new Error(`LangChain model call budget exhausted before provider call: maxModelCalls=${input.maxModelCalls}.`);
        }

        modelCallIndex = currentModelCallIndex;
        const startedAt = Date.now();

        await emitRuntimeObserverSafely(input.onRuntimeEvent, {
          type: "model_call_started",
          loopTurn: currentModelCallIndex,
          modelCallIndex: currentModelCallIndex,
          runtimeStep: currentModelCallIndex,
        });

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
    .filter((message) => message.name !== langChainFinalResponseToolName)
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

function readStructuredResponseFromState(state: unknown) {
  const record = readRecord(state);

  return record.structuredResponse;
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

  if (message.includes("model call budget exhausted")) {
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
