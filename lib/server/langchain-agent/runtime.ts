import "server-only";

import { createAgent, createMiddleware, AIMessage, ToolMessage, toolStrategy } from "langchain";
import type { ModelRequest } from "langchain";

import {
  agentRuntimeConfig,
  createLangChainModelVisibleJsonProjectionBudget,
  type AgentRuntimeConfig,
} from "@/lib/server/config";

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

const consecutiveToolLimitExceededCode = "tool_consecutive_call_limit_exceeded";
const terminalToolLoopFailureMessage = "LangChain agent terminal tool loop stalled after consecutive business tool calls exceeded the configured limit.";

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
  const businessToolNames = createBusinessToolNameSet(toolWrappers);
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
    });
    let currentRequestToolAvailability: CurrentRequestToolAvailabilityState | undefined;
    const duplicateInputCoordinator = createDuplicateInputExecutionCoordinator();
    const consecutiveToolCallCoordinator = createConsecutiveBusinessToolCallCoordinator({
      maxConsecutiveBusinessToolCalls: config.runBudget.maxToolCallsPerTool,
      resolveToolCallBatch: createBusinessToolCallBatchResolver({
        modelCalls: modelCallRecorder.modelCalls,
        businessToolNames,
      }),
      delegate: duplicateInputCoordinator,
    });
    const availableToolExecutionCoordinator = createCurrentRequestToolAvailabilityExecutionCoordinator({
      resolveUnavailableTool: (toolName) => resolveCurrentRequestUnavailableTool(
        currentRequestToolAvailability,
        toolName,
      ),
      delegate: consecutiveToolCallCoordinator,
    });
    const tools = toolWrappers.map((wrapper) => createExecutableLangChainTool(
      wrapper,
      {
        actor: input.actor,
        signal: abortController.signal,
      },
      async (execution) => {
        toolExecutions.push(execution);
      },
      toolExecutionBudget,
      availableToolExecutionCoordinator,
      async (activity) => {
        await emitLangChainRuntimeActivityObserverEvent({
          activity,
          modelCalls: modelCallRecorder.modelCalls,
          onRuntimeEvent: input.onRuntimeEvent,
        });
      },
    ));
    const middleware = [
      ...createTerminalToolLoopFailureMiddleware(() => toolExecutions),
      ...createBusinessToolAvailabilityMiddleware(
        businessToolNames,
        config.runBudget.maxToolCallsPerTool,
        (availability) => {
          currentRequestToolAvailability = availability;
        },
      ),
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
    let state: unknown = await agent.invoke({
      messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
    }, {
      recursionLimit: resolveLangChainGraphRecursionLimit(config.runBudget, toolWrappers.length),
      signal: abortController.signal,
    });
    let snapshot = createLangChainRuntimeSnapshot({
      state,
      inputMessageCount: input.messages.length,
      toolExecutions,
      modelCalls: modelCallRecorder.modelCalls,
    });
    let messages = snapshot.messages;
    let generatedMessages = snapshot.generatedMessages;
    let mergedToolExecutions = snapshot.mergedToolExecutions;
    let terminalToolLoopFailure = snapshot.terminalToolLoopFailure;
    let budgetFailure = snapshot.budgetFailure;

    if (terminalToolLoopFailure) {
      return createFailure({
        code: "tool_handler_failed",
        message: createTerminalToolLoopFailureErrorMessage(terminalToolLoopFailure),
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

    let structuredFinalResponse = snapshot.structuredFinalResponse;

    if (!structuredFinalResponse.success) {
      state = await agent.invoke({
        messages: createStructuredFinalResponseRepairMessages({
          messages,
          generatedMessages,
          toolWrappers,
          issues: structuredFinalResponse.error.issues.map((issue) => ({
            path: issue.path.map(String),
            code: issue.code,
            message: issue.message,
          })),
        }),
      }, {
        recursionLimit: resolveLangChainGraphRecursionLimit(config.runBudget, toolWrappers.length),
        signal: abortController.signal,
      });
      snapshot = createLangChainRuntimeSnapshot({
        state,
        inputMessageCount: input.messages.length,
        toolExecutions,
        modelCalls: modelCallRecorder.modelCalls,
      });
      messages = snapshot.messages;
      generatedMessages = snapshot.generatedMessages;
      mergedToolExecutions = snapshot.mergedToolExecutions;
      terminalToolLoopFailure = snapshot.terminalToolLoopFailure;
      budgetFailure = snapshot.budgetFailure;

      if (terminalToolLoopFailure) {
        return createFailure({
          code: "tool_handler_failed",
          message: createTerminalToolLoopFailureErrorMessage(terminalToolLoopFailure),
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

      structuredFinalResponse = snapshot.structuredFinalResponse;
    }

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

type LangChainRuntimeSnapshot = {
  messages: readonly unknown[];
  generatedMessages: readonly unknown[];
  mergedToolExecutions: readonly LangChainAgentToolExecution[];
  terminalToolLoopFailure?: LangChainAgentToolExecution;
  budgetFailure?: LangChainAgentToolExecution;
  structuredFinalResponse: ReturnType<typeof parseLangChainFinalResponse>;
};

/** createLangChainRuntimeSnapshot 汇总当前 LangChain state 的确定性执行事实，供成功、失败和 repair 分支复用。 */
function createLangChainRuntimeSnapshot(input: {
  state: unknown;
  inputMessageCount: number;
  toolExecutions: readonly LangChainAgentToolExecution[];
  modelCalls: readonly LangChainAgentModelCallTrace[];
}): LangChainRuntimeSnapshot {
  const stateRecord = readRecord(input.state);
  const messages = Array.isArray(stateRecord.messages) ? stateRecord.messages : [];
  const mergedToolExecutions = annotateToolExecutionsWithModelCalls(
    mergeToolExecutions(input.toolExecutions, messages),
    input.modelCalls,
  );

  return {
    messages,
    generatedMessages: messages.slice(input.inputMessageCount),
    mergedToolExecutions,
    terminalToolLoopFailure: findTerminalToolLoopFailure(mergedToolExecutions),
    budgetFailure: mergedToolExecutions.find((execution) => execution.failureCode === "budget_exhausted"),
    structuredFinalResponse: parseLangChainFinalResponse(readStructuredResponseFromState(input.state)),
  };
}

/** createStructuredFinalResponseRepairMessages 构造一次性结构化终态修复请求，不根据用户措辞或业务 toolName 改写模型决策。 */
function createStructuredFinalResponseRepairMessages(input: {
  messages: readonly unknown[];
  generatedMessages: readonly unknown[];
  toolWrappers: readonly LangChainToolWrapper[];
  issues: readonly { path: readonly string[]; code: string; message: string }[];
}) {
  const toolCatalogSummary = input.toolWrappers.length > 0
    ? input.toolWrappers.map((wrapper) => `- ${wrapper.name}`).join("\n")
    : "- 当前没有业务工具；只能基于已可见上下文输出合法最终回答或围绕原任务追问。";
  const issueSummary = input.issues.length > 0
    ? input.issues.slice(0, 8).map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";

        return `- path=${path}; code=${issue.code}; message=${issue.message}`;
      }).join("\n")
    : "- 未拿到可展示的 schema issue；仍需重新提交合法结构化最终回答。";

  return [
    ...input.messages,
    {
      role: "user",
      content: [
        "结构化最终回答修复请求：上一轮没有产出合法 fitmate_final_response。请继续完成原始用户任务，但只能在当前对话历史、已进入模型上下文的 tool result 和当前可用工具目录内行动。",
        "",
        "当前合法出口：",
        "- 如果任务只需要普通健身回答，调用 fitmate_final_response，填入非空中文 content，可选 suggestedQuestions。",
        "- 如果任务需要训练卡片、routine、plan 或其他结构化业务结果，必须先使用当前暴露的对应 finalization tool，并继续接受服务端 schema、validator、policy 和 projection 校验；content 不能替代结构化业务事实。",
        "- 如果当前事实不足以完成原始任务，调用 fitmate_final_response，在 content 中只追问一个最关键条件，并让 suggestedQuestions 继续围绕原始任务。",
        "",
        "禁止行为：",
        "- 不要建议用户改问无关动作解释、动作区别说明、普通知识问答或其他任务。",
        "- 不要编造未暴露工具、未执行 tool result、未校验训练卡片、未校验 routine 或未校验 plan。",
        "- 不要输出旧 AgentAction JSON、Markdown 代码块、NDJSON event、visibleOutputs 或 raw schema。",
        "",
        "当前业务工具目录（最终回答工具由结构化终态合同提供）：",
        toolCatalogSummary,
        "",
        `当前已生成消息数量：${input.generatedMessages.length}。这些消息和其中的 ToolMessage 是本次 repair 可引用的已验证上下文边界。`,
        "上一轮结构化终态校验问题：",
        issueSummary,
      ].join("\n"),
    },
  ] as Parameters<ReturnType<typeof createAgent>["invoke"]>[0]["messages"];
}

type CurrentRequestToolAvailabilityState = {
  /** exposedToolNames 记录本次 provider request 实际暴露的 tool schema，供执行前拒绝陈旧 tool_call。 */
  exposedToolNames: ReadonlySet<string>;
  /** exhaustedBusinessTools 记录因连续业务 tool 上限而被本次 request 移除的工具，不承载业务语义。 */
  exhaustedBusinessTools: ReadonlyMap<string, ExhaustedBusinessToolState>;
};

type ExhaustedBusinessToolState = {
  toolName: string;
  limit: number;
  consecutiveCount: number;
};

type CurrentRequestUnavailableTool =
  | { kind: "unknown_tool" }
  | { kind: "consecutive_limit"; exhaustedTool: ExhaustedBusinessToolState };

function createCurrentRequestToolAvailabilityExecutionCoordinator(input: {
  resolveUnavailableTool: (toolName: string) => CurrentRequestUnavailableTool | undefined;
  delegate: LangChainToolExecutionCoordinator;
}): LangChainToolExecutionCoordinator {
  return {
    execute: async ({ wrapper, rawInput, toolCallId, runExecution }) => {
      const unavailableTool = input.resolveUnavailableTool(wrapper.name);

      if (unavailableTool?.kind === "consecutive_limit") {
        return createConsecutiveBusinessToolLimitExecution({
          wrapper,
          rawInput,
          toolCallId,
          limit: unavailableTool.exhaustedTool.limit,
          consecutiveCount: unavailableTool.exhaustedTool.consecutiveCount + 1,
        });
      }

      if (unavailableTool) {
        return createCurrentRequestToolUnavailableExecution({
          wrapper,
          rawInput,
          toolCallId,
        });
      }

      return input.delegate.execute({ wrapper, rawInput, toolCallId, runExecution });
    },
  };
}

function resolveCurrentRequestUnavailableTool(
  availability: CurrentRequestToolAvailabilityState | undefined,
  toolName: string,
): CurrentRequestUnavailableTool | undefined {
  if (!availability || availability.exposedToolNames.has(toolName)) {
    return undefined;
  }

  const exhaustedTool = availability.exhaustedBusinessTools.get(toolName);

  return exhaustedTool
    ? { kind: "consecutive_limit", exhaustedTool }
    : { kind: "unknown_tool" };
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
  resolveToolCallBatch: (toolCallId: string | undefined, fallbackToolName: string) => BusinessToolCallBatch;
  delegate: LangChainToolExecutionCoordinator;
}): LangChainToolExecutionCoordinator {
  let lastBusinessToolName: string | undefined;
  let consecutiveBusinessToolBatches = 0;
  const countedBatchKeys = new Set<string>();
  const exhaustedBatchByKey = new Map<string, { toolName: string; consecutiveCount: number }>();

  return {
    // 连续限制按模型决策批次计数；同批 fan-out 不是 observation 后的循环。
    execute: async ({ wrapper, rawInput, toolCallId, runExecution }) => {
      const batch = input.resolveToolCallBatch(toolCallId, wrapper.name);

      if (!countedBatchKeys.has(batch.batchKey)) {
        countedBatchKeys.add(batch.batchKey);

        if (!batch.singleBusinessToolName) {
          lastBusinessToolName = undefined;
          consecutiveBusinessToolBatches = 0;
        } else if (batch.singleBusinessToolName === lastBusinessToolName) {
          consecutiveBusinessToolBatches += 1;
        } else {
          lastBusinessToolName = batch.singleBusinessToolName;
          consecutiveBusinessToolBatches = 1;
        }

        if (batch.singleBusinessToolName && consecutiveBusinessToolBatches > input.maxConsecutiveBusinessToolCalls) {
          exhaustedBatchByKey.set(batch.batchKey, {
            toolName: batch.singleBusinessToolName,
            consecutiveCount: consecutiveBusinessToolBatches,
          });
        }
      }

      const exhaustedBatch = exhaustedBatchByKey.get(batch.batchKey);

      if (exhaustedBatch?.toolName === wrapper.name) {
        return createConsecutiveBusinessToolLimitExecution({
          wrapper,
          rawInput,
          toolCallId,
          limit: input.maxConsecutiveBusinessToolCalls,
          consecutiveCount: exhaustedBatch.consecutiveCount,
        });
      }

      return input.delegate.execute({ wrapper, rawInput, toolCallId, runExecution });
    },
  };
}

type BusinessToolCallBatch = {
  batchKey: string;
  singleBusinessToolName?: string;
};

function createBusinessToolNameSet(toolWrappers: readonly LangChainToolWrapper[]) {
  return new Set(toolWrappers
    .filter((wrapper) => (wrapper.executionKind ?? "business") === "business")
    .map((wrapper) => wrapper.name));
}

/** createBusinessToolCallBatchResolver 将 provider tool_calls 映射为模型决策批次，不读取用户自然语言或业务字段。 */
function createBusinessToolCallBatchResolver(input: {
  modelCalls: readonly LangChainAgentModelCallTrace[];
  businessToolNames: ReadonlySet<string>;
}) {
  let unlinkedBatchIndex = 0;

  return (toolCallId: string | undefined, fallbackToolName: string): BusinessToolCallBatch => {
    const linkage = findToolCallModelLinkage(toolCallId, input.modelCalls);

    if (!linkage?.modelCallIndex) {
      unlinkedBatchIndex += 1;

      return {
        batchKey: `unlinked:${unlinkedBatchIndex}`,
        singleBusinessToolName: fallbackToolName,
      };
    }

    const modelCall = input.modelCalls.find((call) => call.modelCallIndex === linkage.modelCallIndex);
    const batchBusinessToolNames = new Set(modelCall?.providerToolCalls
      .map((toolCall) => toolCall.name)
      .filter((toolName) => input.businessToolNames.has(toolName)));

    return {
      batchKey: `model:${linkage.modelCallIndex}`,
      singleBusinessToolName: batchBusinessToolNames.size === 1
        ? [...batchBusinessToolNames][0]
        : undefined,
    };
  };
}

function createDuplicateInputKey(wrapper: LangChainToolWrapper, rawInput: unknown): DuplicateInputKey | undefined {
  const parsedInput = wrapper.inputSchema.safeParse(readBusinessToolInputForRuntimeBoundary(wrapper, rawInput));

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

function readBusinessToolInputForRuntimeBoundary(wrapper: LangChainToolWrapper, rawInput: unknown) {
  void wrapper;

  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return rawInput;
  }

  const { runtimeMetadata: _runtimeMetadata, ...businessInput } = rawInput as Record<string, unknown>;

  return businessInput;
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
  const inputSummary = toLangChainJsonValue(
    readBusinessToolInputForRuntimeBoundary(input.wrapper, input.rawInput),
    config.trace.toolArgumentsPreviewMaxLength,
  );
  const modelVisibleSummary = stringifyForModelSummary({
    status: "duplicate_tool_input",
    code: "duplicate_tool_input",
    toolName: input.wrapper.name,
    toolVersion: input.duplicateKey.toolVersion,
    message: "同一 run 内该工具已使用相同归一化 input 产生过模型可见事实；重复调用不会产生新的事实。请基于本轮已可见事实继续推理，或在确实需要新事实时调整工具输入。",
    factBoundary: "这是重复输入反馈，不表示用户业务目标已经完成，也不要求调用任何下一步业务 tool。",
  }, config.toolWrapper.modelVisibleSummaryMaxLength, createLangChainModelVisibleJsonProjectionBudget(config.toolWrapper.modelVisibleSummaryMaxLength));

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

/** createTerminalToolLoopFailureMiddleware 在连续工具超限记录生成后终止主 Agent loop，避免模型切换工具继续空转。 */
function createTerminalToolLoopFailureMiddleware(
  readToolExecutions: () => readonly LangChainAgentToolExecution[],
) {
  return [createMiddleware({
    name: "FitMateTerminalToolLoopFailureMiddleware",
    wrapModelCall: async (request, handler) => {
      const terminalFailure = findTerminalToolLoopFailure(readToolExecutions());

      if (terminalFailure) {
        throw new Error(createTerminalToolLoopFailureErrorMessage(terminalFailure));
      }

      return handler(request);
    },
  })];
}

/** findTerminalToolLoopFailure 只识别通用连续业务 tool 超限，不依赖具体业务 toolName 或用户措辞。 */
function findTerminalToolLoopFailure(
  toolExecutions: readonly LangChainAgentToolExecution[],
) {
  return toolExecutions.find(isConsecutiveToolLimitExecution);
}

function isConsecutiveToolLimitExecution(execution: LangChainAgentToolExecution) {
  if (execution.status !== "failed") {
    return false;
  }

  return readStringFromRecord(readRecord(execution.traceSummary), "code") === consecutiveToolLimitExceededCode;
}

function createTerminalToolLoopFailureErrorMessage(execution: LangChainAgentToolExecution) {
  return `${terminalToolLoopFailureMessage} toolName=${execution.toolName}.`;
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
  const inputSummary = toLangChainJsonValue(
    readBusinessToolInputForRuntimeBoundary(input.wrapper, input.rawInput),
    config.trace.toolArgumentsPreviewMaxLength,
  );
  const modelVisibleSummary = stringifyForModelSummary({
    status: "failed",
    code: "tool_consecutive_call_limit_exceeded",
    toolName: input.wrapper.name,
    limit: input.limit,
    consecutiveCount: input.consecutiveCount,
    message: "同一个业务工具已连续调用达到本轮上限；runtime 将终止当前主 Agent loop，并进入失败收口或由上层 adapter 处理。不要假装该工具已执行成功。",
    boundary: "runtimeMetadata 不产生独立工具调用，也不打断业务工具连续计数；触发连续超限后不会继续自由业务工具调用，整轮 maxToolCalls 和 maxModelCalls 仍是外层安全熔断。",
  }, config.toolWrapper.modelVisibleSummaryMaxLength, createLangChainModelVisibleJsonProjectionBudget(config.toolWrapper.modelVisibleSummaryMaxLength));

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
      failureMessage: "同一个业务工具连续调用次数超过本轮上限，主 Agent loop 已终止。",
      enteredModelContext: true,
    },
  };
}

function createCurrentRequestToolUnavailableExecution(input: {
  wrapper: LangChainToolWrapper;
  rawInput: unknown;
  toolCallId?: string;
}): LangChainToolExecutionResult {
  const startedAt = Date.now();
  const config = agentRuntimeConfig.langChain;
  const inputSummary = toLangChainJsonValue(
    readBusinessToolInputForRuntimeBoundary(input.wrapper, input.rawInput),
    config.trace.toolArgumentsPreviewMaxLength,
  );
  const modelVisibleSummary = stringifyForModelSummary({
    status: "failed",
    code: "unknown_tool",
    toolName: input.wrapper.name,
    message: "当前模型请求未暴露该工具，runtime 已拒绝执行；请基于当前可见事实收口或说明能力边界。",
    boundary: "该失败只表示 provider 返回了当前 request tools 列表之外的 tool_call；服务端不会执行对应业务 handler，也不会改写 provider tool_call。",
  }, config.toolWrapper.modelVisibleSummaryMaxLength, createLangChainModelVisibleJsonProjectionBudget(config.toolWrapper.modelVisibleSummaryMaxLength));

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
        code: "unknown_tool",
        toolName: input.wrapper.name,
        reason: "current_request_tool_unavailable",
      }, config.toolWrapper.traceSummaryMaxLength),
      failureCode: "unknown_tool",
      failureMessage: "当前模型请求未暴露该工具，runtime 已拒绝执行 handler。",
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
}) {
  let reservedBusinessToolCalls = 0;

  return {
    reserveToolCall: (wrapper: LangChainToolWrapper) => {
      void wrapper;
      reservedBusinessToolCalls += 1;
      return reservedBusinessToolCalls <= input.maxBusinessToolCalls;
    },
  };
}

/** createBusinessToolAvailabilityMiddleware 在下一次模型调用前移除连续达上限的业务 tool，并记录本次 request 实际暴露的工具集合。 */
function createBusinessToolAvailabilityMiddleware(
  businessToolNames: ReadonlySet<string>,
  maxToolCallsPerTool: number,
  updateCurrentRequestAvailability: (availability: CurrentRequestToolAvailabilityState) => void,
) {
  if (businessToolNames.size === 0) {
    return [];
  }

  return [createMiddleware({
    name: "FitMateBusinessToolAvailabilityMiddleware",
    wrapModelCall: async (request, handler) => {
      const exhaustedTool = findConsecutivelyExhaustedBusinessToolInCurrentRun(
        request.messages,
        businessToolNames,
        maxToolCallsPerTool,
      );

      if (!exhaustedTool) {
        updateCurrentRequestAvailability(createRequestToolAvailabilityState(request.tools));
        return handler(request);
      }

      const nextRequest = {
        ...request,
        tools: request.tools.filter((tool) => {
          const toolName = readLangChainToolName(tool);

          return !toolName || toolName !== exhaustedTool.toolName;
        }),
      };
      updateCurrentRequestAvailability(createRequestToolAvailabilityState(
        nextRequest.tools,
        [{
          toolName: exhaustedTool.toolName,
          limit: maxToolCallsPerTool,
          consecutiveCount: exhaustedTool.consecutiveCount,
        }],
      ));

      return handler(nextRequest);
    },
  })];
}

function createRequestToolAvailabilityState(
  tools: readonly unknown[],
  exhaustedBusinessTools: readonly ExhaustedBusinessToolState[] = [],
): CurrentRequestToolAvailabilityState {
  return {
    exposedToolNames: createRequestToolNameSet(tools),
    exhaustedBusinessTools: new Map(exhaustedBusinessTools.map((tool) => [tool.toolName, tool])),
  };
}

function createRequestToolNameSet(tools: readonly unknown[]) {
  return new Set(tools
    .map(readLangChainToolName)
    .filter((toolName): toolName is string => Boolean(toolName)));
}

function findConsecutivelyExhaustedBusinessToolInCurrentRun(
  messages: readonly unknown[],
  businessToolNames: ReadonlySet<string>,
  maxToolCallsPerTool: number,
): { toolName: string; consecutiveCount: number } | undefined {
  const currentRunMessages = messages.slice(findCurrentRunMessageStartIndex(messages));
  const businessToolCallBatches: Array<string | undefined> = [];

  for (const message of currentRunMessages) {
    if (!AIMessage.isInstance(message)) {
      continue;
    }

    const batchBusinessToolNames = new Set<string>();

    for (const toolCall of message.tool_calls ?? []) {
      if (!businessToolNames.has(toolCall.name)) {
        continue;
      }

      batchBusinessToolNames.add(toolCall.name);
    }

    if (batchBusinessToolNames.size === 0) {
      continue;
    }

    businessToolCallBatches.push(batchBusinessToolNames.size === 1 ? [...batchBusinessToolNames][0] : undefined);
  }

  const lastToolName = businessToolCallBatches.at(-1);

  if (!lastToolName) {
    return undefined;
  }

  let consecutiveCount = 0;

  for (let index = businessToolCallBatches.length - 1; index >= 0; index -= 1) {
    if (businessToolCallBatches[index] !== lastToolName) {
      break;
    }

    consecutiveCount += 1;
  }

  return consecutiveCount >= maxToolCallsPerTool
    ? { toolName: lastToolName, consecutiveCount }
    : undefined;
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

async function emitLangChainRuntimeActivityObserverEvent(input: {
  activity: NonNullable<LangChainAgentToolExecution["runtimeActivity"]> & {
    toolName: string;
    toolCallId?: string;
  };
  modelCalls: readonly LangChainAgentModelCallTrace[];
  onRuntimeEvent?: (event: LangChainAgentRuntimeObserverEvent) => void | Promise<void>;
}) {
  if (!input.onRuntimeEvent) {
    return;
  }

  const linkage = findToolCallModelLinkage(input.activity.toolCallId, input.modelCalls);

  await emitRuntimeObserverSafely(input.onRuntimeEvent, {
    type: "runtime_activity_reported",
    activitySummary: input.activity.activitySummary,
    source: input.activity.source,
    ...(input.activity.discardedSummaryReason
      ? { discardedSummaryReason: input.activity.discardedSummaryReason }
      : {}),
    ...(input.activity.toolCallId ? { toolCallId: input.activity.toolCallId } : {}),
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
        traceSummary: toLangChainJsonValue(
          content,
          agentRuntimeConfig.langChain.trace.toolResultPreviewMaxLength,
        ),
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
    runtimeActivities: input.toolExecutions.flatMap((execution) => {
      if (!execution.runtimeActivity) {
        return [];
      }

      return [{
        toolName: execution.toolName,
        ...(execution.toolCallId ? { toolCallId: execution.toolCallId } : {}),
        ...(execution.modelCallIndex ? { modelCallIndex: execution.modelCallIndex } : {}),
        ...(execution.runtimeStep ? { runtimeStep: execution.runtimeStep } : {}),
        ...execution.runtimeActivity,
      }];
    }),
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

  if (message.includes(terminalToolLoopFailureMessage)) {
    return { code: "tool_handler_failed", message, retryable: true };
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
