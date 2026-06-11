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
import {
  createExecutableLangChainTool,
  type LangChainToolExecutionCoordinator,
  type LangChainToolExecutionResult,
  type LangChainToolWrapper,
  type LangChainToolWrapperContext,
} from "./tool-wrapper";
import {
  createStableLangChainInputHash,
  getErrorMessage,
  messageContentToText,
  stringifyForModelSummary,
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
    const duplicateInputCoordinator = createDuplicateInputExecutionCoordinator();
    const consecutiveToolCallCoordinator = createConsecutiveBusinessToolCallCoordinator({
      maxConsecutiveBusinessToolCalls: config.runBudget.maxToolCallsPerTool,
      delegate: duplicateInputCoordinator,
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
      consecutiveToolCallCoordinator,
    ));
    const middleware = [
      ...createBusinessToolAvailabilityMiddleware(toolWrappers, config.runBudget.maxToolCallsPerTool),
      modelCallRecorder.middleware,
    ] as const;
    const agent = createAgent({
      model: modelResult.model,
      tools,
      // 显式使用 toolStrategy，避免 DeepSeek provider profile 把裸 JSON Schema 映射成当前不兼容的 response_format。
      responseFormat: toolStrategy(langChainFinalResponseJsonSchema, {
        toolMessageContent: "结构化最终回答已接收。",
      }),
      systemPrompt: input.systemPrompt ?? buildLangChainAgentSystemPrompt(),
      middleware,
    });
    const state = await agent.invoke({
      messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
    }, {
      recursionLimit: resolveLangChainGraphRecursionLimit(config.runBudget, toolWrappers.length),
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

type DuplicateInputKey = {
  key: string;
  toolVersion: string;
  normalizedInputHash: string;
};

type DuplicateInputEntry = {
  toolName: string;
  toolVersion: string;
  normalizedInputHash: string;
};

/** createDuplicateInputExecutionCoordinator 在单次 run 内复用同参成功工具事实，避免重复执行 handler 或烧尽预算。 */
function createDuplicateInputExecutionCoordinator(): LangChainToolExecutionCoordinator {
  const completedInputs = new Map<string, DuplicateInputEntry>();
  const pendingInputs = new Map<string, Promise<LangChainToolExecutionResult>>();

  return {
    execute: async ({ wrapper, rawInput, toolCallId, runExecution }) => {
      if ((wrapper.executionKind ?? "business") !== "business") {
        return runExecution();
      }

      const duplicateKey = createDuplicateInputKey(wrapper, rawInput);

      if (!duplicateKey) {
        return runExecution();
      }

      const completed = completedInputs.get(duplicateKey.key);

      if (completed) {
        return createDuplicateInputExecution({
          wrapper,
          rawInput,
          toolCallId,
          duplicateKey,
          completed,
        });
      }

      const pendingExecution = pendingInputs.get(duplicateKey.key);

      if (pendingExecution) {
        const previousExecution = await pendingExecution;

        if (previousExecution.record.status === "succeeded") {
          const completedEntry = createDuplicateInputEntry(wrapper, duplicateKey);

          completedInputs.set(duplicateKey.key, completedEntry);
          return createDuplicateInputExecution({
            wrapper,
            rawInput,
            toolCallId,
            duplicateKey,
            completed: completedEntry,
          });
        }

        return runExecution();
      }

      const executionPromise = runExecution();
      pendingInputs.set(duplicateKey.key, executionPromise);

      try {
        const execution = await executionPromise;

        if (execution.record.status === "succeeded") {
          completedInputs.set(duplicateKey.key, createDuplicateInputEntry(wrapper, duplicateKey));
        }

        return execution;
      } finally {
        if (pendingInputs.get(duplicateKey.key) === executionPromise) {
          pendingInputs.delete(duplicateKey.key);
        }
      }
    },
  };
}

function createConsecutiveBusinessToolCallCoordinator(input: {
  maxConsecutiveBusinessToolCalls: number;
  delegate: LangChainToolExecutionCoordinator;
}): LangChainToolExecutionCoordinator {
  let lastBusinessToolName: string | undefined;
  let consecutiveBusinessToolCalls = 0;

  return {
    // 业务 tool 连续限制只防止模型原地反复请求同一能力；总成本仍由全局 tool/model budget 控制。
    execute: async ({ wrapper, rawInput, toolCallId, runExecution }) => {
      if ((wrapper.executionKind ?? "business") !== "business") {
        return input.delegate.execute({ wrapper, rawInput, toolCallId, runExecution });
      }

      if (wrapper.name === lastBusinessToolName) {
        consecutiveBusinessToolCalls += 1;
      } else {
        lastBusinessToolName = wrapper.name;
        consecutiveBusinessToolCalls = 1;
      }

      if (consecutiveBusinessToolCalls > input.maxConsecutiveBusinessToolCalls) {
        return createConsecutiveBusinessToolLimitExecution({
          wrapper,
          rawInput,
          toolCallId,
          limit: input.maxConsecutiveBusinessToolCalls,
          consecutiveCount: consecutiveBusinessToolCalls,
        });
      }

      return input.delegate.execute({ wrapper, rawInput, toolCallId, runExecution });
    },
  };
}

function createDuplicateInputKey(wrapper: LangChainToolWrapper, rawInput: unknown): DuplicateInputKey | undefined {
  const parsedInput = wrapper.inputSchema.safeParse(rawInput);

  if (!parsedInput.success) {
    return undefined;
  }

  const toolVersion = wrapper.version ?? "v1";
  const normalizedInputHash = createStableLangChainInputHash(parsedInput.data);

  return {
    key: `${wrapper.name}:${toolVersion}:${normalizedInputHash}`,
    toolVersion,
    normalizedInputHash,
  };
}

function createDuplicateInputEntry(
  wrapper: LangChainToolWrapper,
  duplicateKey: DuplicateInputKey,
): DuplicateInputEntry {
  return {
    toolName: wrapper.name,
    toolVersion: duplicateKey.toolVersion,
    normalizedInputHash: duplicateKey.normalizedInputHash,
  };
}

function createDuplicateInputExecution(input: {
  wrapper: LangChainToolWrapper;
  rawInput: unknown;
  toolCallId?: string;
  duplicateKey: DuplicateInputKey;
  completed: DuplicateInputEntry;
}): LangChainToolExecutionResult {
  const startedAt = Date.now();
  const config = agentRuntimeConfig.langChain;
  const inputSummary = toLangChainJsonValue(input.rawInput, config.trace.toolArgumentsPreviewMaxLength);
  const modelVisibleSummary = stringifyForModelSummary({
    status: "duplicate_tool_input",
    code: "duplicate_tool_input",
    toolName: input.wrapper.name,
    toolVersion: input.duplicateKey.toolVersion,
    message: "同一 run 内该工具已使用相同归一化 input 产生过模型可见事实；重复调用不会产生新的事实。请基于本轮已可见事实继续推理，或在确实需要新事实时调整工具输入。",
    factBoundary: "这是重复输入反馈，不表示用户业务目标已经完成，也不要求调用任何下一步业务 tool。",
  }, config.toolWrapper.modelVisibleSummaryMaxLength);

  return {
    modelMessage: modelVisibleSummary,
    record: {
      toolCallId: input.toolCallId,
      toolName: input.wrapper.name,
      executionKind: input.wrapper.executionKind ?? "business",
      status: "duplicate_input",
      durationMs: Date.now() - startedAt,
      inputSummary,
      modelVisibleSummary,
      traceSummary: toLangChainJsonValue({
        status: "duplicate_input",
        code: "duplicate_tool_input",
        toolName: input.completed.toolName,
        toolVersion: input.completed.toolVersion,
        normalizedInputHash: input.completed.normalizedInputHash,
      }, config.toolWrapper.traceSummaryMaxLength),
      feedbackCode: "duplicate_tool_input",
      enteredModelContext: true,
    },
  };
}

function createConsecutiveBusinessToolLimitExecution(input: {
  wrapper: LangChainToolWrapper;
  rawInput: unknown;
  toolCallId?: string;
  limit: number;
  consecutiveCount: number;
}): LangChainToolExecutionResult {
  const startedAt = Date.now();
  const config = agentRuntimeConfig.langChain;
  const inputSummary = toLangChainJsonValue(input.rawInput, config.trace.toolArgumentsPreviewMaxLength);
  const modelVisibleSummary = stringifyForModelSummary({
    status: "failed",
    code: "tool_consecutive_call_limit_exceeded",
    toolName: input.wrapper.name,
    limit: input.limit,
    consecutiveCount: input.consecutiveCount,
    message: "同一个业务工具已连续调用达到本轮上限；请先使用其他已满足条件的业务工具、提交结构化终态、直接收口或向用户澄清。不要假装该工具已执行成功。",
    boundary: "activity 工具不计入也不打断业务工具连续计数；整轮 maxToolCalls 和 maxModelCalls 仍是安全熔断。",
  }, config.toolWrapper.modelVisibleSummaryMaxLength);

  return {
    modelMessage: modelVisibleSummary,
    record: {
      toolCallId: input.toolCallId,
      toolName: input.wrapper.name,
      executionKind: input.wrapper.executionKind ?? "business",
      status: "failed",
      durationMs: Date.now() - startedAt,
      inputSummary,
      modelVisibleSummary,
      traceSummary: toLangChainJsonValue({
        status: "failed",
        code: "tool_consecutive_call_limit_exceeded",
        toolName: input.wrapper.name,
        limit: input.limit,
        consecutiveCount: input.consecutiveCount,
      }, config.toolWrapper.traceSummaryMaxLength),
      failureCode: "tool_handler_failed",
      failureMessage: "同一个业务工具连续调用次数超过本轮上限。",
      enteredModelContext: true,
    },
  };
}

/** resolveLangChainGraphRecursionLimit 将模型调用预算映射为 LangChain graph step 上限，避免旧 iteration 语义与 LangGraph 计数脱节。 */
export function resolveLangChainGraphRecursionLimit(
  runBudget: Pick<AgentRuntimeConfig["langChain"]["runBudget"], "maxModelCalls">,
  toolMiddlewareCount = 0,
) {
  return Math.max(2, runBudget.maxModelCalls * Math.max(3, toolMiddlewareCount + 3));
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

/** createBusinessToolAvailabilityMiddleware 在下一次模型调用前移除连续达上限的业务 tool，避免模型原地重复请求同一能力。 */
function createBusinessToolAvailabilityMiddleware(
  toolWrappers: readonly LangChainToolWrapper[],
  maxToolCallsPerTool: number,
) {
  const businessToolNames = new Set(toolWrappers
    .filter((wrapper) => (wrapper.executionKind ?? "business") === "business")
    .map((wrapper) => wrapper.name));

  if (businessToolNames.size === 0) {
    return [];
  }

  return [createMiddleware({
    name: "FitMateBusinessToolAvailabilityMiddleware",
    wrapModelCall: async (request, handler) => {
      const exhaustedToolName = findConsecutivelyExhaustedBusinessToolNameInCurrentRun(
        request.messages,
        businessToolNames,
        maxToolCallsPerTool,
      );

      if (!exhaustedToolName) {
        return handler(request);
      }

      return handler({
        ...request,
        tools: request.tools.filter((tool) => {
          const toolName = readLangChainToolName(tool);

          return !toolName || toolName !== exhaustedToolName;
        }),
      });
    },
  })];
}

function findConsecutivelyExhaustedBusinessToolNameInCurrentRun(
  messages: readonly unknown[],
  businessToolNames: ReadonlySet<string>,
  maxToolCallsPerTool: number,
) {
  const currentRunMessages = messages.slice(findCurrentRunMessageStartIndex(messages));
  const businessToolCallNames: string[] = [];

  for (const message of currentRunMessages) {
    if (!AIMessage.isInstance(message)) {
      continue;
    }

    for (const toolCall of message.tool_calls ?? []) {
      if (!businessToolNames.has(toolCall.name)) {
        continue;
      }

      businessToolCallNames.push(toolCall.name);
    }
  }

  const lastToolName = businessToolCallNames.at(-1);

  if (!lastToolName) {
    return undefined;
  }

  let consecutiveCount = 0;

  for (let index = businessToolCallNames.length - 1; index >= 0; index -= 1) {
    if (businessToolCallNames[index] !== lastToolName) {
      break;
    }

    consecutiveCount += 1;
  }

  return consecutiveCount >= maxToolCallsPerTool ? lastToolName : undefined;
}

function findCurrentRunMessageStartIndex(messages: readonly unknown[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const role = readLangChainMessageRole(messages[index]);

    if (role === "user" || role === "human") {
      return index + 1;
    }
  }

  return 0;
}

function readLangChainToolName(tool: unknown) {
  const record = readRecord(tool);
  const directName = readStringFromRecord(record, "name");

  if (directName) {
    return directName;
  }

  return readStringFromRecord(readRecord(record.function), "name");
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
    .map((tool) => readLangChainToolName(tool))
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
